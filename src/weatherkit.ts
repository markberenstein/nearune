// Nearune — current weather via Apple's WeatherKit REST API, used when the
// four APPLE_WEATHERKIT_* env vars are configured (see weather.ts, which
// falls back to Open-Meteo automatically when they're missing or a call
// fails). WeatherKit has no historical-hours endpoint, so the "last 6
// hours" trend always comes from Open-Meteo regardless of which provider
// supplied the current reading — see weather.ts's currentWeather().
//
// Auth: a short-lived ES256 JWT signed with the WeatherKit private key,
// per https://developer.apple.com/documentation/weatherkitrestapi.

import { createSign } from "node:crypto";

function base64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let cachedToken: { token: string; expiresAt: number } | null = null;

function credentials() {
  const teamId = Bun.env.APPLE_WEATHERKIT_TEAM_ID || "";
  const keyId = Bun.env.APPLE_WEATHERKIT_KEY_ID || "";
  const serviceId = Bun.env.APPLE_WEATHERKIT_SERVICE_ID || "";
  const privateKey = Bun.env.APPLE_WEATHERKIT_PRIVATE_KEY || "";
  if (!teamId || !keyId || !serviceId || !privateKey) return null;
  return { teamId, keyId, serviceId, privateKey };
}

export function weatherKitConfigured(): boolean {
  return !!credentials();
}

// Signed once and reused for ~50 minutes (Apple recommends short-lived
// tokens but doesn't require a fresh one per request) to avoid re-signing
// on every weather fetch.
function signedToken(): string | null {
  const creds = credentials();
  if (!creds) return null;
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.token;

  const header = { alg: "ES256", kid: creds.keyId, id: creds.teamId + "." + creds.serviceId, typ: "JWT" };
  const exp = now + 50 * 60;
  const payload = { iss: creds.teamId, iat: now, exp, sub: creds.serviceId };

  const headerB64 = base64url(Buffer.from(JSON.stringify(header)));
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload)));
  const signingInput = headerB64 + "." + payloadB64;

  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  // "ieee-p1363" gives the raw r||s signature JWS/ES256 requires, instead
  // of the DER encoding crypto.sign() produces by default.
  const signature = signer.sign({ key: creds.privateKey, dsaEncoding: "ieee-p1363" });
  const token = signingInput + "." + base64url(signature);

  cachedToken = { token, expiresAt: exp };
  return token;
}

export type WeatherKitCurrent = { tempC: number; conditionCode: string; isDay: boolean; humidityPct: number | null } | null;

// WeatherKit's conditionCode values (a fixed enum Apple documents), mapped
// to our own theme buckets — see weather.ts's THEMES. Anything unlisted
// falls back to "cloudy" rather than failing.
const CONDITION_BUCKET: Record<string, string> = {
  Clear: "clear",
  MostlyClear: "clear",
  Frigid: "clear",
  Hot: "clear",
  PartlyCloudy: "cloudy",
  MostlyCloudy: "cloudy",
  Cloudy: "cloudy",
  Windy: "cloudy",
  Breezy: "cloudy",
  Foggy: "fog",
  Haze: "fog",
  Smoky: "fog",
  Drizzle: "rain",
  Rain: "rain",
  HeavyRain: "rain",
  IsolatedThunderstorms: "storm",
  ScatteredThunderstorms: "storm",
  StrongStorms: "storm",
  Thunderstorms: "storm",
  Hurricane: "storm",
  TropicalStorm: "storm",
  Squalls: "storm",
  Snow: "snow",
  HeavySnow: "snow",
  Blizzard: "snow",
  Flurries: "snow",
  SnowShowers: "snow",
  Sleet: "snow",
  FreezingRain: "snow",
  FreezingDrizzle: "snow",
  WintryMix: "snow",
  Hail: "storm",
};

export function weatherKitBucket(conditionCode: string): string {
  return CONDITION_BUCKET[conditionCode] || "cloudy";
}

// Apple's own display text for each conditionCode (close to what the real
// Weather app shows), used instead of our generic bucket label whenever
// WeatherKit actually supplied the reading — see weather.ts's
// currentWeather(). Falls back to a crude space-inserted version of the
// code itself for anything Apple adds later that isn't listed here yet.
const CONDITION_LABEL: Record<string, string> = {
  Clear: "Clear",
  MostlyClear: "Mostly Clear",
  PartlyCloudy: "Partly Cloudy",
  MostlyCloudy: "Mostly Cloudy",
  Cloudy: "Cloudy",
  Windy: "Windy",
  Breezy: "Breezy",
  Foggy: "Foggy",
  Haze: "Haze",
  Smoky: "Smoky",
  Frigid: "Frigid",
  Hot: "Hot",
  Drizzle: "Drizzle",
  Rain: "Rain",
  HeavyRain: "Heavy Rain",
  IsolatedThunderstorms: "Isolated T-Storms",
  ScatteredThunderstorms: "Scattered T-Storms",
  StrongStorms: "Strong Storms",
  Thunderstorms: "Thunderstorms",
  Hurricane: "Hurricane",
  TropicalStorm: "Tropical Storm",
  Squalls: "Squalls",
  Snow: "Snow",
  HeavySnow: "Heavy Snow",
  Blizzard: "Blizzard",
  Flurries: "Flurries",
  SnowShowers: "Snow Showers",
  Sleet: "Sleet",
  FreezingRain: "Freezing Rain",
  FreezingDrizzle: "Freezing Drizzle",
  WintryMix: "Wintry Mix",
  Hail: "Hail",
};

export function weatherKitLabel(conditionCode: string): string {
  return CONDITION_LABEL[conditionCode] || conditionCode.replace(/([a-z])([A-Z])/g, "$1 $2");
}

// Fetches current conditions from WeatherKit for a geocoded point, or null
// if credentials aren't configured or the call fails for any reason —
// callers (weather.ts) fall back to Open-Meteo in that case, so this never
// throws.
export async function weatherKitCurrentWeather(lat: number, lon: number): Promise<WeatherKitCurrent> {
  try {
    const token = signedToken();
    if (!token) return null;
    const url =
      "https://weatherkit.apple.com/api/v1/weather/en/" + lat + "/" + lon + "?dataSets=currentWeather&timezone=UTC";
    const res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    if (!res.ok) {
      // Temporary diagnostic — surfaces *why* a call failed (Apple's status
      // + body) instead of silently falling back, so intermittent failures
      // can actually be diagnosed from the Railway logs.
      let bodySnippet = "";
      try { bodySnippet = (await res.text()).slice(0, 300); } catch {}
      console.log("[weatherkit] " + lat + "," + lon + " -> HTTP " + res.status + " " + res.statusText + " " + bodySnippet);
      return null;
    }
    const data: any = await res.json();
    const cur = data && data.currentWeather;
    if (!cur || typeof cur.temperature !== "number" || !cur.conditionCode) {
      console.log("[weatherkit] " + lat + "," + lon + " -> unexpected response shape: " + JSON.stringify(data).slice(0, 300));
      return null;
    }
    // WeatherKit reports humidity as a 0-1 fraction — shown as a percent.
    const humidityPct = typeof cur.humidity === "number" ? Math.round(cur.humidity * 100) : null;
    return { tempC: cur.temperature, conditionCode: cur.conditionCode, isDay: cur.daylight !== false, humidityPct };
  } catch (err: any) {
    console.log("[weatherkit] " + lat + "," + lon + " -> threw: " + (err && err.message ? err.message : String(err)));
    return null;
  }
}
