// Nearune — top songs chart at a free-text location, via Apple's public
// "most played" marketing feed (no API key required — same no-auth
// approach as localnews.ts's Google News RSS and weather.ts's Open-Meteo
// calls), plus a 30-second preview clip for the #1 song from the public
// iTunes Search API. Billboard doesn't publish city-level charts — its
// charts are national — so "near you" here really means "popular in your
// country" the same way weather.ts picks a temperature unit per country
// rather than per city. See resolveCountryCode in geo.ts for how a
// free-text location becomes a chart region.

import { resolveCountryCode } from "./geo";

export type SongEntry = {
  rank: number;
  title: string;
  artist: string;
  url: string;
  artworkUrl: string;
  // Only populated for rank 1 — fetching a preview is one extra request
  // per song, and most of a 5-song chart never gets listened to. The #1
  // slot is the one actually shown collapsed (see page.ts's musicLineBlock),
  // so it's the only one that needs to be ready immediately.
  previewUrl: string | null;
};
export type MusicChart = SongEntry[] | null;

const chartCache = new Map<string, { at: number; value: MusicChart }>();
const CHART_TTL = 6 * 60 * 60 * 1000; // 6 hours — a top-songs chart doesn't move fast

async function fetchPreviewUrl(appleId: string): Promise<string | null> {
  try {
    const res = await fetch("https://itunes.apple.com/lookup?id=" + encodeURIComponent(appleId));
    if (!res.ok) return null;
    const data: any = await res.json();
    const first = data && Array.isArray(data.results) && data.results[0];
    return (first && typeof first.previewUrl === "string" && first.previewUrl) || null;
  } catch {
    return null;
  }
}

// Top `limit` songs (default 5) currently popular in whichever country a
// free-text location resolves to.
export async function topSongs(location: string, limit = 5): Promise<MusicChart> {
  const country = await resolveCountryCode(location);
  if (!country) return null;
  const cacheKey = country + "|" + limit;
  const cached = chartCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CHART_TTL) return cached.value;
  let value: MusicChart = null;
  try {
    // Apple's feed only serves a few fixed sizes (10/25/50/100) — always
    // pull 10 and slice down to what was actually asked for.
    const url = "https://rss.applemarketingtools.com/api/v2/" + country + "/music/most-played/10/songs.json";
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
          artist: r.artistName || "",
          url: r.url || "",
          artworkUrl: r.artworkUrl100 || "",
          previewUrl: i === 0 ? previewUrl : null,
        }));
      }
    } else {
      console.log("[music] fetch " + country + " -> HTTP " + res.status);
    }
  } catch (err: any) {
    console.log("[music] fetch " + country + " -> threw: " + (err && err.message ? err.message : String(err)));
  }
  chartCache.set(cacheKey, { at: Date.now(), value });
  return value;
}
