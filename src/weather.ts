// Nearune — current weather at a free-text location string. Prefers Apple's
// WeatherKit (see weatherkit.ts) when the APPLE_WEATHERKIT_* env vars are
// configured, and falls back to Open-Meteo's free geocoding + forecast APIs
// otherwise (or if a WeatherKit call ever fails) — so this always works,
// with or without Apple credentials. WeatherKit has no historical-hours
// endpoint, so the last-6-hours trend always comes from Open-Meteo either
// way. SANDBOX EXPERIMENT: powers a "weather of the other person"
// background theme. Results are cached briefly in memory since weather
// changes slowly and this can be polled by every device every so often.

import { weatherKitConfigured, weatherKitCurrentWeather, weatherKitBucket, weatherKitLabel } from "./weatherkit";

type GeoPoint = { lat: number; lon: number; name: string; countryCode: string } | null;

const geoCache = new Map<string, { at: number; value: GeoPoint }>();
const GEO_TTL = 24 * 60 * 60 * 1000; // a location's coordinates don't change

async function geocode(location: string): Promise<GeoPoint> {
  const q = (location || "").trim();
  if (!q) return null;
  const cached = geoCache.get(q);
  if (cached && Date.now() - cached.at < GEO_TTL) return cached.value;
  let value: GeoPoint = null;
  try {
    const url =
      "https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=" + encodeURIComponent(q);
    const res = await fetch(url);
    if (res.ok) {
      const data: any = await res.json();
      const first = data && Array.isArray(data.results) && data.results[0];
      if (first) value = { lat: first.latitude, lon: first.longitude, name: first.name, countryCode: first.country_code || "" };
    }
  } catch {}
  geoCache.set(q, { at: Date.now(), value });
  return value;
}

// Countries that conventionally report weather in Fahrenheit — everywhere
// else (the overwhelming majority of the world, including India) uses
// Celsius. US dominates this list; the rest are the usual short list of
// other Fahrenheit holdouts.
const FAHRENHEIT_COUNTRIES = new Set(["US", "BS", "BZ", "KY", "PW", "FM", "MH", "LR"]);
function unitForCountry(countryCode: string): "F" | "C" {
  return FAHRENHEIT_COUNTRIES.has((countryCode || "").toUpperCase()) ? "F" : "C";
}

export type WeatherTheme = { key: string; label: string; sky: [string, string]; glow: string; icon: string };

export type HourlyPoint = { hour: string; temp: number; humidity: number | null };

export type WeatherNow = {
  location: string;
  // `temp`/`unit` is the primary reading — Fahrenheit for US (and the other
  // Fahrenheit-holdout) locations, Celsius everywhere else. `tempF`/`tempC`
  // carry the SAME reading in both units, so a caller can show the other
  // one as a secondary/under value regardless of which is primary — see
  // page.ts's weatherWidgetBlock().
  temp: number;
  unit: "F" | "C";
  tempF: number;
  tempC: number;
  code: number;
  isDay: boolean;
  // Relative humidity, percent — null if neither provider reported it.
  humidity: number | null;
  theme: WeatherTheme;
  // Last ~6 hours of temperature (same unit as `temp`), oldest first,
  // ending at the current hour — for the expanded detail card's trend
  // view. Empty if the hourly call didn't come back cleanly (current
  // conditions still work either way).
  recentHours: HourlyPoint[];
};

// Monoline, filled icons in the spirit of Apple's own SF Symbols weather
// glyphs (sun / moon / cloud, with rain-drops, snow-dots or a bolt added
// for the rest) — rendered via innerHTML (see page.ts's h()'s "html" attr)
// rather than emoji, which read as a generic/cartoonish weather app rather
// than anything resembling Apple Weather. "currentColor" picks up the
// tile's own white text color (see .weather-widget-tile-icon svg in
// page.ts), so these need no per-theme color of their own.
const ICON_SUN =
  '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1v3M12 20v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></g></svg>';
const ICON_MOON =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.2 14.9A8.5 8.5 0 1 1 9.1 3.8a7 7 0 0 0 11.1 11.1z"/></svg>';
const ICON_CLOUD =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.5 18a5 5 0 0 1 .3-10 6 6 0 0 1 11.1 2.1A4.3 4.3 0 0 1 18 18H7.5z"/></svg>';
const ICON_FOG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 10.5a4 4 0 0 1 7.4-2 4.5 4.5 0 0 1 4.4 3.3"/><path d="M4 15h16M4 19h16"/></svg>';
const ICON_RAIN =
  '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7.2 14.5a4.6 4.6 0 0 1 .3-9.2 5.6 5.6 0 0 1 10.3 1.9A4 4 0 0 1 17.6 15H7.2z"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8.5 18l-1 3M12.5 18l-1 3M16.5 18l-1 3"/></g></svg>';
const ICON_SNOW =
  '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7.2 14.5a4.6 4.6 0 0 1 .3-9.2 5.6 5.6 0 0 1 10.3 1.9A4 4 0 0 1 17.6 15H7.2z"/><g fill="currentColor"><circle cx="8.5" cy="19" r="1.2"/><circle cx="12.5" cy="20.5" r="1.2"/><circle cx="16.5" cy="19" r="1.2"/></g></svg>';
const ICON_STORM =
  '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7.2 13a4.6 4.6 0 0 1 .3-9.2 5.6 5.6 0 0 1 10.3 1.9A4 4 0 0 1 17.6 13.5H7.2z"/><path fill="currentColor" d="M13.2 13l-4 6.5h3.1l-1 4.5 5.2-7.3h-3.1z"/></svg>';

// WMO weather codes (what Open-Meteo's `weather_code` returns), grouped into
// a handful of buckets — each with a day and night two-stop "sky" gradient
// plus a glow color and an icon. Colors are modeled on Apple's own Weather
// app rather than a generic sunny-yellow/cartoon palette: clear skies are
// blue (not yellow/orange — that read as a different app entirely), and
// every bucket leans into the same cool, slightly desaturated range Apple
// uses so the backgrounds feel like one coherent app rather than a rainbow
// of condition colors.
const THEMES: Record<string, { day: WeatherTheme; night: WeatherTheme }> = {
  clear: {
    day: { key: "clear-day", label: "Clear", sky: ["#5AA6E6", "#A9D8F7"], glow: "#FFD27A", icon: ICON_SUN },
    night: { key: "clear-night", label: "Clear", sky: ["#060B1E", "#141B3D"], glow: "#4C62A8", icon: ICON_MOON },
  },
  cloudy: {
    day: { key: "cloudy-day", label: "Cloudy", sky: ["#8497AA", "#B6C4D1"], glow: "#8C97A3", icon: ICON_CLOUD },
    night: { key: "cloudy-night", label: "Cloudy", sky: ["#171D27", "#2B333F"], glow: "#49525F", icon: ICON_CLOUD },
  },
  fog: {
    day: { key: "fog-day", label: "Fog", sky: ["#98A2AA", "#CBD2D6"], glow: "#AEB7BD", icon: ICON_FOG },
    night: { key: "fog-night", label: "Fog", sky: ["#1C2227", "#333B41"], glow: "#4B545B", icon: ICON_FOG },
  },
  rain: {
    day: { key: "rain-day", label: "Rain", sky: ["#7C90A6", "#A9BCCD"], glow: "#3A5068", icon: ICON_RAIN },
    night: { key: "rain-night", label: "Rain", sky: ["#0A121C", "#1B2733"], glow: "#2C4056", icon: ICON_RAIN },
  },
  snow: {
    day: { key: "snow-day", label: "Snow", sky: ["#AFD0E6", "#E6F1FA"], glow: "#9AC0DD", icon: ICON_SNOW },
    night: { key: "snow-night", label: "Snow", sky: ["#17222F", "#2B3D51"], glow: "#3C5570", icon: ICON_SNOW },
  },
  storm: {
    day: { key: "storm-day", label: "Thunderstorms", sky: ["#39344C", "#685C83"], glow: "#4A3C6A", icon: ICON_STORM },
    night: { key: "storm-night", label: "Thunderstorms", sky: ["#0A0812", "#1A1427"], glow: "#2D2246", icon: ICON_STORM },
  },
};

function bucketForCode(code: number): keyof typeof THEMES {
  if (code === 0) return "clear";
  if (code === 1 || code === 2 || code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code === 95 || code === 96 || code === 99) return "storm";
  return "cloudy";
}

export function themeFor(code: number, isDay: boolean): WeatherTheme {
  const bucket = THEMES[bucketForCode(code)];
  return isDay ? bucket.day : bucket.night;
}

function themeForBucket(bucketKey: string, isDay: boolean): WeatherTheme {
  const bucket = THEMES[bucketKey] || THEMES.cloudy;
  return isDay ? bucket.day : bucket.night;
}

function celsiusTo(unit: "F" | "C", c: number): number {
  return unit === "F" ? Math.round((c * 9) / 5 + 32) : Math.round(c);
}

const weatherCache = new Map<string, { at: number; value: WeatherNow | null }>();
// Kept a bit shorter than the client's poll interval (page.ts's
// WEATHER_POLL_MS) so a client refresh reliably gets fresh-enough data
// rather than serving the same cached value back every time.
const WEATHER_TTL = 4 * 60 * 1000;

// Current weather at a free-text location string, or null if it couldn't be
// resolved (empty/unrecognized location, or the weather service is
// unreachable) — callers fall back to no weather theme in that case.
export async function currentWeather(location: string): Promise<WeatherNow | null> {
  const q = (location || "").trim();
  if (!q) return null;
  const cached = weatherCache.get(q);
  if (cached && Date.now() - cached.at < WEATHER_TTL) return cached.value;
  let value: WeatherNow | null = null;
  try {
    const point = await geocode(q);
    if (point) {
      const unit = unitForCountry(point.countryCode);
      // Always fetched in Celsius (Open-Meteo's default) regardless of the
      // primary display unit, so both tempF/tempC below — and the trend
      // bars — can be derived from one raw reading rather than guessing.
      const url =
        "https://api.open-meteo.com/v1/forecast?latitude=" + point.lat + "&longitude=" + point.lon +
        "&current=temperature_2m,relative_humidity_2m,weather_code,is_day&hourly=temperature_2m,relative_humidity_2m&past_hours=6&forecast_hours=1" +
        "&timezone=auto";
      // Fetched in parallel: Open-Meteo (needed either way, for the
      // last-6-hours trend, and as the fallback current reading) and
      // WeatherKit (only actually called when configured — see
      // weatherKitCurrentWeather, which returns null instantly otherwise).
      const [res, weatherKit] = await Promise.all([
        fetch(url),
        weatherKitConfigured() ? weatherKitCurrentWeather(point.lat, point.lon) : Promise.resolve(null),
      ]);
      // Temporary diagnostic — lets us confirm from the Railway logs
      // whether WeatherKit is actually succeeding or silently falling
      // back, since the two look identical in the UI.
      console.log(
        "[weather] " + q + " -> " +
        (weatherKit ? "WeatherKit ok (" + weatherKit.conditionCode + ")" : weatherKitConfigured() ? "WeatherKit configured but failed, using Open-Meteo" : "WeatherKit not configured, using Open-Meteo")
      );
      if (res.ok) {
        const data: any = await res.json();
        const cur = data && data.current;
        if (cur && typeof cur.weather_code === "number") {
          const recentHours: HourlyPoint[] = [];
          const hourly = data && data.hourly;
          if (hourly && Array.isArray(hourly.time) && Array.isArray(hourly.temperature_2m)) {
            // past_hours=6 + forecast_hours=1 gives ~7 points ending just
            // after now — drop any at/after the current reading so this is
            // strictly "the last 6 hours leading up to now". WeatherKit has
            // no historical-hours endpoint, so this trend is always
            // Open-Meteo's data even when WeatherKit supplies the current
            // reading below.
            for (let i = 0; i < hourly.time.length; i++) {
              if (hourly.time[i] >= cur.time) continue;
              const t = new Date(hourly.time[i]);
              recentHours.push({
                hour: t.toLocaleTimeString([], { hour: "numeric" }),
                // hourly.temperature_2m is always Celsius now — convert to
                // the primary display unit for the trend bars.
                temp: celsiusTo(unit, hourly.temperature_2m[i]),
                humidity: Array.isArray(hourly.relative_humidity_2m) && typeof hourly.relative_humidity_2m[i] === "number"
                  ? Math.round(hourly.relative_humidity_2m[i])
                  : null,
              });
            }
          }
          // Prefer WeatherKit's current reading (Apple's own data + precise
          // condition classification) when it came back; otherwise fall
          // back to Open-Meteo's, which is always fetched above anyway.
          const isDay = weatherKit ? weatherKit.isDay : cur.is_day !== 0;
          // Raw Celsius reading, whichever provider supplied it — cur.temperature_2m
          // is always Celsius now (see the fetch URL above).
          const rawC = weatherKit ? weatherKit.tempC : cur.temperature_2m;
          const temp = celsiusTo(unit, rawC);
          // Prefer WeatherKit's humidity alongside its other current
          // readings; fall back to Open-Meteo's.
          const humidity =
            weatherKit && weatherKit.humidityPct !== null
              ? weatherKit.humidityPct
              : typeof cur.relative_humidity_2m === "number"
                ? Math.round(cur.relative_humidity_2m)
                : null;
          // When WeatherKit supplied the reading, show Apple's own condition
          // text ("Mostly Clear", "Scattered T-Storms", ...) instead of our
          // coarser bucket label — cloned rather than mutating the shared
          // THEMES object, which every other call also reads from.
          const theme = weatherKit
            ? Object.assign({}, themeForBucket(weatherKitBucket(weatherKit.conditionCode), isDay), { label: weatherKitLabel(weatherKit.conditionCode) })
            : themeFor(cur.weather_code, isDay);
          value = {
            location: point.name || q,
            temp,
            unit,
            tempF: celsiusTo("F", rawC),
            tempC: celsiusTo("C", rawC),
            code: cur.weather_code,
            isDay,
            humidity,
            theme,
            recentHours: recentHours.slice(-6),
          };
        }
      }
    }
  } catch {}
  weatherCache.set(q, { at: Date.now(), value });
  return value;
}

// Exposed for the daily self-check (qa.ts) so it audits the real palette.
export { THEMES as WEATHER_THEMES };
