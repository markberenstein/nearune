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

export type WeatherTheme = { key: string; label: string; sky: [string, string]; glow: string };

export type WeatherNow = {
  location: string;
  tempF: number;
  code: number;
  isDay: boolean;
  theme: WeatherTheme;
};

// WMO weather codes (what Open-Meteo's `weather_code` returns), grouped into
// a handful of buckets — each with a day and night two-stop "sky" gradient
// plus a glow color. Colors are chosen to sit near the app's existing warm
// palette (see page.ts's --bg/--accent) rather than clashing with it — the
// background should read as "the sky changed", not "a different app skin
// loaded".
const THEMES: Record<string, { day: WeatherTheme; night: WeatherTheme }> = {
  clear: {
    day: { key: "clear-day", label: "Clear", sky: ["#FDEBC8", "#FBF3EC"], glow: "#F2B75E" },
    night: { key: "clear-night", label: "Clear", sky: ["#232A44", "#14171F"], glow: "#5B6AA8" },
  },
  cloudy: {
    day: { key: "cloudy-day", label: "Cloudy", sky: ["#E6DED2", "#FBF3EC"], glow: "#B9AC98" },
    night: { key: "cloudy-night", label: "Cloudy", sky: ["#20242F", "#14171F"], glow: "#3A4054" },
  },
  fog: {
    day: { key: "fog-day", label: "Foggy", sky: ["#E4E1DA", "#FBF3EC"], glow: "#C8C3B8" },
    night: { key: "fog-night", label: "Foggy", sky: ["#252A33", "#14171F"], glow: "#454C58" },
  },
  rain: {
    day: { key: "rain-day", label: "Rainy", sky: ["#C9D3DC", "#FBF3EC"], glow: "#7C93A8" },
    night: { key: "rain-night", label: "Rainy", sky: ["#1A2530", "#14171F"], glow: "#3E5670" },
  },
  snow: {
    day: { key: "snow-day", label: "Snowy", sky: ["#EAF1F7", "#FBF3EC"], glow: "#BFD3E3" },
    night: { key: "snow-night", label: "Snowy", sky: ["#232B38", "#14171F"], glow: "#4A5A70" },
  },
  storm: {
    day: { key: "storm-day", label: "Stormy", sky: ["#B7B0C4", "#FBF3EC"], glow: "#6E5C8C" },
    night: { key: "storm-night", label: "Stormy", sky: ["#181524", "#14171F"], glow: "#463A66" },
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
const WEATHER_TTL = 15 * 60 * 1000;

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
        "&current=temperature_2m,weather_code,is_day&temperature_unit=fahrenheit&timezone=auto";
      const res = await fetch(url);
      if (res.ok) {
        const data: any = await res.json();
        const cur = data && data.current;
        if (cur && typeof cur.weather_code === "number") {
          const isDay = cur.is_day !== 0;
          value = {
            location: point.name || q,
            tempF: Math.round(cur.temperature_2m),
            code: cur.weather_code,
            isDay,
            theme: themeFor(cur.weather_code, isDay),
          };
        }
      }
    }
  } catch {}
  weatherCache.set(q, { at: Date.now(), value });
  return value;
}
