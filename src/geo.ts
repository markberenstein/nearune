import { expandUsState, US_ABBR, regionAbbr } from "./usstates";
import { recordClaude } from "./usage";
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

const norm = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

async function fetchPlaces(name: string, count: number): Promise<any[]> {
  try {
    const res = await fetch("https://geocoding-api.open-meteo.com/v1/search?count=" + count + "&language=en&format=json&name=" + encodeURIComponent(name));
    if (!res.ok) return [];
    const data: any = await res.json();
    return (data && Array.isArray(data.results)) ? data.results : [];
  } catch { return []; }
}

// Does a result match the qualifiers typed after the city name ("TX", "Texas", "France", "US")?
function matchesQualifiers(r: any, rest: string[]): boolean {
  return rest.every((t0) => {
    const t = norm(t0);
    if (!t) return true;
    const cc = String(r.country_code || "").toLowerCase();
    if (r.admin1 && norm(r.admin1) === t) return true;
    if (r.admin2 && norm(r.admin2) === t) return true;
    if (r.country && norm(r.country) === t) return true;
    if (cc === t || (t === "usa" && cc === "us") || (t === "uk" && cc === "gb")) return true;
    if (cc === "us" && US_ABBR[t.toUpperCase()] && US_ABBR[t.toUpperCase()] === norm(r.admin1 || "")) return true;
    if (regionAbbr(cc, r.admin1 || "") === t.toUpperCase()) return true;
    return false;
  });
}

// Best match for free text. "City, Region, Country" picks the matching place; plain text takes the top result.
export async function geocodePlace(q0: string): Promise<any | null> {
  const q = expandUsState(q0);
  if (q.includes(",")) {
    const parts = q.split(",").map((s) => s.trim()).filter(Boolean);
    const cityName = parts[0], rest = parts.slice(1);
    if (cityName && rest.length) {
      const hits = (await fetchPlaces(cityName, 10)).filter((r) => norm(r.name) === norm(cityName) && matchesQualifiers(r, rest));
      if (hits[0]) return hits[0];
    }
  }
  return (await fetchPlaces(q, 1))[0] || null;
}

async function geocodeRaw(q: string): Promise<any | null> {
  return geocodePlace(q);
}

// Cities and towns matching the text, for a "which one?" list. Up to 6, labelled "City, Region, Country".
export async function searchPlaces(q0: string): Promise<{ label: string; lat: number; lon: number }[]> {
  const q = expandUsState((q0 || "").trim());
  const parts = q.split(",").map((s) => s.trim()).filter(Boolean);
  const cityName = parts[0] || "";
  if (cityName.length < 2) return [];
  const rest = parts.slice(1);
  const out: { label: string; lat: number; lon: number }[] = [];
  const seen = new Set<string>();
  for (const r of await fetchPlaces(cityName, 10)) {
    const fc = String(r.feature_code || "");
    if (fc.startsWith("PCL") || fc.startsWith("ADM")) continue;
    if (norm(r.name) !== norm(cityName)) continue;
    if (!matchesQualifiers(r, rest)) continue;
    const cc2 = String(r.country_code || "").toUpperCase();
    const ab = regionAbbr(cc2, r.admin1 || "");
    let label = [r.name, ab, cc2 || r.country || ""].filter(Boolean).join(", ");
    // Regions with no standard abbreviation: only name the region when the short label would repeat.
    if (!ab && seen.has(label) && r.admin1) label = [r.name, r.admin1, cc2 || r.country || ""].filter(Boolean).join(", ");
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ label, lat: r.latitude, lon: r.longitude });
    if (out.length >= 6) break;
  }
  return out;
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
      recordClaude("location", data);
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

// Countries Nearune is not offered in: those with no U.S. diplomatic
// relations. Editable without a deploy via the BLOCKED_COUNTRIES env var
// (comma-separated ISO codes). Default: Bhutan, Iran, North Korea.
// Fails open: an empty location or an unresolvable one is never blocked.
// True when the text names a city or town. Rejects a bare country, state or
// county (feature codes PCL*, ADM*) so every person has a city for weather and
// the clock. Fails open when the lookup finds nothing.
const CITY_STATES = new Set(["singapore", "monaco", "hong kong", "vatican city", "macau", "macao", "gibraltar", "luxembourg"]);
export async function isCityLevelLocation(location: string): Promise<boolean> {
  const q = (location || "").trim();
  if (!q) return false;
  if (expandUsState(q) !== q) return false;
  if (CITY_STATES.has(q.toLowerCase())) return true;
  let { first } = await geocodeFull(q);
  if (!first) { await new Promise((r) => setTimeout(r, 400)); first = (await geocodeFull(q)).first; }
  // Strict: a place the lookup cannot identify is not accepted.
  if (!first) { console.log("[city-check] " + JSON.stringify({ q, found: false, ok: false })); return false; }
  const fc = typeof first.feature_code === "string" ? first.feature_code : "";
  const nm = typeof first.name === "string" ? first.name.trim().toLowerCase() : "";
  const co = typeof first.country === "string" ? first.country.trim().toLowerCase() : "";
  const ad = typeof first.admin1 === "string" ? first.admin1.trim().toLowerCase() : "";
  // A country (code PCL*, or its name is the country's own name), a state or a county is not a city.
  const isCountry = fc.startsWith("PCL") || (!!nm && nm === co);
  const isRegion = fc.startsWith("ADM");
  const ok = !(isCountry || isRegion);
  console.log("[city-check] " + JSON.stringify({ q, fc, name: nm, country: co, admin1: ad, ok }));
  return ok;
}

const blockedCache = new Map<string, boolean>();
export async function isBlockedLocation(location: string): Promise<boolean> {
  const blocked = (Bun.env.BLOCKED_COUNTRIES ?? "BT,IR,KP").split(",").map((c) => c.trim().toLowerCase()).filter(Boolean);
  const q = (location || "").trim();
  if (!blocked.length || !q) return false;
  const ck = blocked.join(",") + "|" + q.toLowerCase();
  const hit = blockedCache.get(ck);
  if (hit !== undefined) return hit;
  const cc = await resolveCountryCode(q).catch(() => null);
  const res = !!cc && blocked.includes(cc.toLowerCase());
  // Only cache successful lookups so a failed geocode is retried (fails open meanwhile).
  if (cc) { if (blockedCache.size > 1000) blockedCache.clear(); blockedCache.set(ck, res); }
  return res;
}
