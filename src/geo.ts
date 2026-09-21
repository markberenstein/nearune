// Same Sky — resolves a free-text "where you're based" string (city,
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
};

async function geocode(location: string): Promise<any | null> {
  const q = (location || "").trim();
  if (!q) return null;
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

export async function resolveTimezoneFromLocation(location: string): Promise<string | null> {
  const first = await geocode(location);
  const tz = first && typeof first.timezone === "string" ? first.timezone : null;
  return tz || null;
}

// Used by the client's location field to pre-select a language guess (still
// freely changeable) — one geocoding lookup answers both the timezone and
// the language suggestion, so the "where you're based" field only needs to
// be resolved once.
export async function resolveLocationInfo(location: string): Promise<{ tz: string | null; language: string | null }> {
  const first = await geocode(location);
  const tz = first && typeof first.timezone === "string" ? first.timezone : null;
  const countryCode = first && typeof first.country_code === "string" ? first.country_code.toUpperCase() : "";
  const language = (countryCode && COUNTRY_TO_LANGUAGE[countryCode]) || null;
  return { tz: tz || null, language };
}
