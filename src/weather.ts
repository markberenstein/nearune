// Nearune — current weather at a free-text location string, via
// Open-Meteo's free geocoding + forecast APIs (no key required — same
// provider already used for timezone/language resolution in geo.ts).
// SANDBOX EXPERIMENT: powers a "weather of the other person" background
// theme. Results are cached briefly in memory since weather changes slowly
// and this can be polled by every device every so often.

type GeoPoint = { lat: number; lon: number; name: string } | null;

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
      if (first) value = { lat: first.latitude, lon: first.longitude, name: first.name };
    }
  } catch {}
  geoCache.set(q, { at: Date.now(), value });
  return value;
}

export type WeatherTheme = { key: string; label: string; sky: [string, string]; glow: string; icon: string };

export type HourlyPoint = { hour: string; tempF: number };

export type WeatherNow = {
  location: string;
  tempF: number;
  code: number;
  isDay: boolean;
  theme: WeatherTheme;
  // Last ~6 hours of temperature, oldest first, ending at the current hour
  // — for the expanded detail card's trend view. Empty if the hourly call
  // didn't come back cleanly (current conditions still work either way).
  recentHours: HourlyPoint[];
};

// WMO weather codes (what Open-Meteo's `weather_code` returns), grouped into
// a handful of buckets — each with a day and night two-stop "sky" gradient
// plus a glow color and an icon. Colors lean more saturated than the app's
// own palette on purpose (see page.ts's --bg/--accent) — earlier versions
// faded the second stop into --bg so the wash barely read as weather at
// all; these stay visibly tinted end to end so it's unmistakable.
const THEMES: Record<string, { day: WeatherTheme; night: WeatherTheme }> = {
  clear: {
    day: { key: "clear-day", label: "Clear", sky: ["#FFD98A", "#FFEFC4"], glow: "#F2A93E", icon: "☀️" },
    night: { key: "clear-night", label: "Clear", sky: ["#2A3466", "#141A33"], glow: "#6C7FC9", icon: "🌙" },
  },
  cloudy: {
    day: { key: "cloudy-day", label: "Cloudy", sky: ["#D7CDBC", "#ECE3D2"], glow: "#A89878", icon: "⛅" },
    night: { key: "cloudy-night", label: "Cloudy", sky: ["#262C3D", "#151822"], glow: "#4A5170", icon: "☁️" },
  },
  fog: {
    day: { key: "fog-day", label: "Foggy", sky: ["#DAD5C9", "#EBE6DA"], glow: "#B7AF9C", icon: "🌫️" },
    night: { key: "fog-night", label: "Foggy", sky: ["#2B303A", "#171A21"], glow: "#565D6B", icon: "🌫️" },
  },
  rain: {
    day: { key: "rain-day", label: "Rainy", sky: ["#9FB4C7", "#D5E0E9"], glow: "#5C7B98", icon: "🌧️" },
    night: { key: "rain-night", label: "Rainy", sky: ["#17222E", "#0F161F"], glow: "#33506E", icon: "🌧️" },
  },
  snow: {
    day: { key: "snow-day", label: "Snowy", sky: ["#D7E8F5", "#EFF6FB"], glow: "#9EC2DE", icon: "❄️" },
    night: { key: "snow-night", label: "Snowy", sky: ["#232E42", "#131A28"], glow: "#3E5A80", icon: "❄️" },
  },
  storm: {
    day: { key: "storm-day", label: "Stormy", sky: ["#8E82AC", "#C4BADA"], glow: "#5B4880", icon: "⛈️" },
    night: { key: "storm-night", label: "Stormy", sky: ["#15111F", "#0D0A14"], glow: "#3A2C5C", icon: "⛈️" },
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
      const url =
        "https://api.open-meteo.com/v1/forecast?latitude=" + point.lat + "&longitude=" + point.lon +
        "&current=temperature_2m,weather_code,is_day&hourly=temperature_2m&past_hours=6&forecast_hours=1" +
        "&temperature_unit=fahrenheit&timezone=auto";
      const res = await fetch(url);
      if (res.ok) {
        const data: any = await res.json();
        const cur = data && data.current;
        if (cur && typeof cur.weather_code === "number") {
          const isDay = cur.is_day !== 0;
          const recentHours: HourlyPoint[] = [];
          const hourly = data && data.hourly;
          if (hourly && Array.isArray(hourly.time) && Array.isArray(hourly.temperature_2m)) {
            // past_hours=6 + forecast_hours=1 gives ~7 points ending just
            // after now — drop any at/after the current reading so this is
            // strictly "the last 6 hours leading up to now".
            for (let i = 0; i < hourly.time.length; i++) {
              if (hourly.time[i] >= cur.time) continue;
              const t = new Date(hourly.time[i]);
              recentHours.push({
                hour: t.toLocaleTimeString([], { hour: "numeric" }),
                tempF: Math.round(hourly.temperature_2m[i]),
              });
            }
          }
          value = {
            location: point.name || q,
            tempF: Math.round(cur.temperature_2m),
            code: cur.weather_code,
            isDay,
            theme: themeFor(cur.weather_code, isDay),
            recentHours: recentHours.slice(-6),
          };
        }
      }
    }
  } catch {}
  weatherCache.set(q, { at: Date.now(), value });
  return value;
}
