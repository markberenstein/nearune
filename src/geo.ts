// Nearune — resolves a free-text "where you're based" string (city,
// country, whatever someone types) to a real IANA timezone and a likely
// primary language, via Open-Meteo's free geocoding API (no key required).
// The browser's own reported timezone (see util.ts/page.ts browserTz()) is
// used only as a fallback when the location can't be resolved (empty,
// gibberish, or the geocoding service is unreachable).

// Primary/official language per country, for the common cases — a starting
// point for the language dropdown, never the final word (someone in
// Singapore or Switzerland may reasonably pick a different one, and the
// dropdown stays fully editable). Deliberately conservative: a country left
// out here just means no language gets pre-selected, not a wrong guess.
const COUNTRY_TO_LANGUAGE: Record<string, string> = {
  US: "English", GB: "English", CA: "English", AU: "English", NZ: "English", IE: "English",
  MX: "Spanish", ES: "Spanish", AR: "Spanish", CO: "Spanish", CL: "Spanish", PE: "Spanish",
  FR: "French",
  DE: "German", AT: "German",
  PT: "Portuguese", BR: "Portuguese",
  IT: "Italian",
  CN: "Mandarin Chinese", TW: "Mandarin Chinese",
  JP: "Japanese",
  KR: "Korean",
  SA: "Arabic", AE: "Arabic", EG: "Arabic", QA: "Arabic", KW: "Arabic",
  IR: "Farsi (Persian)",
  RU: "Russian",
  BD: "Bengali",
  PK: "Urdu",
  IN: "Hindi",
  NL: "Dutch",
  PL: "Polish",
  TR: "Turkish",
  VN: "Vietnamese",
  TH: "Thai",
  ID: "Indonesian",
  PH: "Tagalog (Filipino)",
  GR: "Greek",
  IL: "Hebrew",
  SE: "Swedish",
  NO: "Norwegian",
  UA: "Ukrainian",
  RO: "Romanian",
  CZ: "Czech",
  KE: "Swahili", TZ: "Swahili",
  // More countries (same conservative rule: only where one language clearly dominates).
  ZA: "English", SG: "English", NG: "English", GH: "English", JM: "English",
  VE: "Spanish", EC: "Spanish", UY: "Spanish", BO: "Spanish", PY: "Spanish", CR: "Spanish",
  PA: "Spanish", DO: "Spanish", GT: "Spanish", CU: "Spanish", HN: "Spanish", SV: "Spanish", NI: "Spanish", PR: "Spanish",
  IQ: "Arabic", JO: "Arabic", LB: "Arabic", MA: "Arabic", DZ: "Arabic", TN: "Arabic", LY: "Arabic",
  OM: "Arabic", BH: "Arabic", SY: "Arabic", YE: "Arabic", SD: "Arabic",
  AO: "Portuguese", MZ: "Portuguese",
  LU: "French", SN: "French", CI: "French", CM: "French", CD: "French", HT: "French", MG: "French",
  HK: "Mandarin Chinese",
  AF: "Farsi (Persian)",
  UG: "Swahili",
  BY: "Russian", KZ: "Russian",
};

// India's states mostly have their own dominant language, so when the
// geocoder reports the state (admin1) it beats the country-level "Hindi".
const INDIA_STATE_LANGUAGE: Record<string, string> = {
  "tamil nadu": "Tamil", "puducherry": "Tamil",
  "telangana": "Telugu", "andhra pradesh": "Telugu",
  "maharashtra": "Marathi",
  "gujarat": "Gujarati",
  "west bengal": "Bengali", "tripura": "Bengali",
  "punjab": "Punjabi",
};

async function geocodeRaw(q: string): Promise<any | null> {
  try {
    const url =
      "https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=" +
      encodeURIComponent(q);
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: any = await res.json();
    return (data && Array.isArray(data.results) && data.results[0]) || null;
  } catch {
    return null;
  }
}

// When the geocoder finds nothing (usually a misspelling like "Mumbay" or
// "San Fransisco"), ask Claude Haiku for the most likely intended place.
// Returns null with no API key, on any failure, or when Claude isn't
// confident — the caller then behaves exactly as before.
const fixCache = new Map<string, string | null>();
async function aiFixLocation(q: string): Promise<string | null> {
  if (fixCache.has(q)) return fixCache.get(q)!;
  const key = Bun.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  let out: string | null = null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 30,
        system:
          "The user typed a city or place name that may be misspelled or in another language/script. " +
          "Reply with only the corrected place in English as \"City, Country\" (or \"City, State\" for the US), " +
          "nothing else. If the text is not plausibly a real place, reply with exactly NONE.",
        messages: [{ role: "user", content: q.slice(0, 80) }],
      }),
    });
    if (res.ok) {
      const data: any = await res.json();
      const text = ((data && data.content && data.content[0] && data.content[0].text) || "").trim().split("\n")[0];
      if (text && !/^none\b/i.test(text) && text.length <= 60) out = text;
    }
  } catch {}
  if (fixCache.size > 500) fixCache.clear();
  fixCache.set(q, out);
  return out;
}

async function geocodeFull(location: string): Promise<{ first: any | null; corrected: string | null }> {
  const q = (location || "").trim();
  if (!q) return { first: null, corrected: null };
  const first = await geocodeRaw(q);
  if (first) return { first, corrected: null };
  const fixed = await aiFixLocation(q);
  if (!fixed || fixed.toLowerCase() === q.toLowerCase()) return { first: null, corrected: null };
  const again = await geocodeRaw(fixed) || (await geocodeRaw(fixed.split(",")[0].trim()));
  return again ? { first: again, corrected: fixed } : { first: null, corrected: null };
}

async function geocode(location: string): Promise<any | null> {
  return (await geocodeFull(location)).first;
}

export async function resolveTimezoneFromLocation(location: string): Promise<string | null> {
  const first = await geocode(location);
  const tz = first && typeof first.timezone === "string" ? first.timezone : null;
  return tz || null;
}

// Used by the client's location field to pre-select a language guess (still
// freely changeable) — one geocoding lookup answers both the timezone and
// the language suggestion, so the "where you're based" field only needs to
// be resolved once.
export async function resolveLocationInfo(location: string): Promise<{ tz: string | null; language: string | null; corrected: string | null }> {
  const { first, corrected } = await geocodeFull(location);
  const tz = first && typeof first.timezone === "string" ? first.timezone : null;
  const countryCode = first && typeof first.country_code === "string" ? first.country_code.toUpperCase() : "";
  const admin1 = first && typeof first.admin1 === "string" ? first.admin1.toLowerCase() : "";
  const language =
    (countryCode === "IN" && INDIA_STATE_LANGUAGE[admin1]) ||
    (countryCode && COUNTRY_TO_LANGUAGE[countryCode]) || null;
  return { tz: tz || null, language, corrected };
}

// Lower-case ISO country code (e.g. "us", "in") for a free-text location —
// used by music.ts/movies.ts to pick a storefront/chart region. Apple's
// marketing charts and Billboard alike only publish country-level (or
// national) charts, not city-level ones, so this is the finest granularity
// a "what's popular near them" feature can actually use.
export async function resolveCountryCode(location: string): Promise<string | null> {
  const first = await geocode(location);
  const code = first && typeof first.country_code === "string" ? first.country_code.toLowerCase() : "";
  return code || null;
}

// Coordinates + city label for a free-text location (admin stats map only).
export async function resolveCoords(location: string): Promise<{ lat: number; lon: number; city: string; country: string } | null> {
  const first = await geocode(location);
  if (!first || typeof first.latitude !== "number" || typeof first.longitude !== "number") return null;
  return { lat: first.latitude, lon: first.longitude, city: String(first.name || ""), country: String(first.country_code || "").toUpperCase() };
}
