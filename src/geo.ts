// Same Sky — resolves a free-text "where you're based" string (city,
// country, whatever someone types) to a real IANA timezone, via Open-Meteo's
// free geocoding API (no key required). This is what actually answers "what
// timezone is this person in" from their typed location — the browser's own
// reported timezone (see util.ts/page.ts browserTz()) is used only as a
// fallback when the location can't be resolved (empty, gibberish, or the
// geocoding service is unreachable).
export async function resolveTimezoneFromLocation(location: string): Promise<string | null> {
  const q = (location || "").trim();
  if (!q) return null;
  try {
    const url =
      "https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=" +
      encodeURIComponent(q);
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: any = await res.json();
    const first = data && Array.isArray(data.results) && data.results[0];
    const tz = first && typeof first.timezone === "string" ? first.timezone : null;
    return tz || null;
  } catch {
    return null;
  }
}
