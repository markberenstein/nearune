// Nearune — top movies chart at a free-text location. Same approach and
// same reasoning as music.ts (see its header comment): Apple's public
// "top movies" marketing feed, no API key required, country-level only
// (there's no such thing as a city-level box office chart either), plus a
// trailer preview clip for the #1 movie from the public iTunes Search API.

import { resolveCountryCode } from "./geo";

export type MovieEntry = {
  rank: number;
  title: string;
  url: string;
  artworkUrl: string;
  // Only populated for rank 1 — see music.ts's SongEntry for why.
  previewUrl: string | null;
};
export type MovieChart = MovieEntry[] | null;

const chartCache = new Map<string, { at: number; value: MovieChart }>();
const CHART_TTL = 6 * 60 * 60 * 1000; // 6 hours — same as music.ts

async function fetchPreviewUrl(appleId: string): Promise<string | null> {
  try {
    const res = await fetch("https://itunes.apple.com/lookup?id=" + encodeURIComponent(appleId) + "&entity=movie");
    if (!res.ok) return null;
    const data: any = await res.json();
    const first = data && Array.isArray(data.results) && data.results[0];
    return (first && typeof first.previewUrl === "string" && first.previewUrl) || null;
  } catch {
    return null;
  }
}

// Top `limit` movies (default 5) currently popular in whichever country a
// free-text location resolves to.
export async function topMovies(location: string, limit = 5): Promise<MovieChart> {
  const country = await resolveCountryCode(location);
  if (!country) return null;
  const cacheKey = country + "|" + limit;
  const cached = chartCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CHART_TTL) return cached.value;
  let value: MovieChart = null;
  try {
    const url = "https://rss.applemarketingtools.com/api/v2/" + country + "/movies/top-movies/10/movies.json";
    const res = await fetch(url);
    if (res.ok) {
      const data: any = await res.json();
      const results: any[] = (data && data.feed && Array.isArray(data.feed.results) && data.feed.results) || [];
      const top = results.slice(0, limit);
      if (top.length) {
        const previewUrl = top[0] && top[0].id ? await fetchPreviewUrl(top[0].id) : null;
        value = top.map((r, i) => ({
          rank: i + 1,
          title: r.name || "",
          url: r.url || "",
          artworkUrl: r.artworkUrl100 || "",
          previewUrl: i === 0 ? previewUrl : null,
        }));
      }
    } else {
      console.log("[movies] fetch " + country + " -> HTTP " + res.status);
    }
  } catch (err: any) {
    console.log("[movies] fetch " + country + " -> threw: " + (err && err.message ? err.message : String(err)));
  }
  chartCache.set(cacheKey, { at: Date.now(), value });
  return value;
}
