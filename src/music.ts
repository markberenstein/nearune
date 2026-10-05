// Nearune — top songs chart at a free-text location, via Apple's public
// "most played" marketing feed (no API key required — same no-auth
// approach as localnews.ts's Google News RSS and weather.ts's Open-Meteo
// calls) for the chart listing itself (title/artist/rank/artwork — just
// metadata, no account needed to read it), plus a 30-second preview clip
// for every song from Deezer's public search API instead of Apple's. Apple
// previews are plain files too, but Deezer's search needs no API key NOR
// any Apple ID/Apple Music association on the listener's end — one person
// on this app hit real trouble getting Apple's preview/trailer links to
// play without Apple Music configured on their phone, so previews now come
// from a source that works the same for everyone regardless of what
// they're signed into. One lookup per song, run in parallel (movies.ts
// gets previews for free from its own feed; this chart's metadata feed
// doesn't include them, so each song needs its own lookup so every entry
// in the expanded top-5 list — not just the collapsed #1 — gets a play
// button). Billboard doesn't publish city-level charts — its charts are
// national — so "near you" here really means "popular in your country" the
// same way weather.ts picks a temperature unit per country rather than per
// city. See resolveCountryCode in geo.ts for how a free-text location
// becomes a chart region.

import { resolveCountryCode } from "./geo";

export type SongEntry = {
  rank: number;
  title: string;
  artist: string;
  url: string;
  artworkUrl: string;
  previewUrl: string | null;
};
export type MusicChart = SongEntry[] | null;

const chartCache = new Map<string, { at: number; value: MusicChart }>();
const CHART_TTL = 6 * 60 * 60 * 1000; // 6 hours — a top-songs chart doesn't move fast
// A failed/empty fetch (Apple's feed is occasionally down or slow — seen a
// real 504 from apple's own servers for the US songs chart) gets a much
// shorter TTL, so a transient outage doesn't lock in "no chart" for a
// whole 6-hour window once Apple recovers.
const FAILURE_TTL = 2 * 60 * 1000; // 2 minutes

// Deezer's search API is public, keyless, and returns a direct, DRM-free
// 30s mp3 — no Apple ID, Apple Music subscription, or region-matched
// Apple account required to play it, unlike some of Apple's own
// preview/trailer links. A plain-text "title artist" query (no field
// quoting — that returned zero results in testing) works better than a
// structured query for matching Apple's chart titles against Deezer's
// catalog.
async function fetchPreviewUrl(title: string, artist: string): Promise<string | null> {
  if (!title) return null;
  try {
    const q = [title, artist].filter(Boolean).join(" ");
    const res = await fetch("https://api.deezer.com/search?q=" + encodeURIComponent(q) + "&limit=1");
    if (!res.ok) return null;
    const data: any = await res.json();
    const first = data && Array.isArray(data.data) && data.data[0];
    return (first && typeof first.preview === "string" && first.preview) || null;
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
  if (cached) {
    const ttl = cached.value ? CHART_TTL : FAILURE_TTL;
    if (Date.now() - cached.at < ttl) return cached.value;
  }
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
        const previewUrls = await Promise.all(top.map((r) => (r ? fetchPreviewUrl(r.name || "", r.artistName || "") : Promise.resolve(null))));
        value = top.map((r, i) => ({
          rank: i + 1,
          title: r.name || "",
          artist: r.artistName || "",
          url: r.url || "",
          artworkUrl: r.artworkUrl100 || "",
          previewUrl: previewUrls[i],
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
