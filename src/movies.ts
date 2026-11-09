// Nearune — top movies chart at a free-text location. Apple's marketing
// RSS feed used by music.ts (rss.applemarketingtools.com) only covers apps,
// music, podcasts, books and audiobooks — it has no movies chart at all
// (confirmed: every /movies/... path 404s). The older iTunes Store RSS
// feed generator (itunes.apple.com/{country}/rss/topmovies/...) still
// works and does cover movies, so that's the source here instead, for the
// chart listing itself (title/artwork/link — just metadata).
//
// previewUrl used to come straight from that feed's own trailer/enclosure
// link (an Apple-hosted stream), but those can be region-gated behind an
// Apple ID/Apple Music association — one person on this app hit real
// trouble with it. previewUrl is now a plain YouTube search link for
// "<title> official trailer" instead: no API key, no account, no DRM,
// works the same for everyone. It opens as a normal link (see page.ts's
// chartPlayButton) rather than playing inline.
// No API key required, same as music.ts.

import { resolveCountryCode } from "./geo";

export type MovieEntry = {
  rank: number;
  title: string;
  url: string;
  artworkUrl: string;
  previewUrl: string | null;
};
export type MovieChart = MovieEntry[] | null;

const chartCache = new Map<string, { at: number; value: MovieChart }>();
const CHART_TTL = 6 * 60 * 60 * 1000; // 6 hours — same as music.ts
// See music.ts's FAILURE_TTL comment — same reasoning here.
const FAILURE_TTL = 2 * 60 * 1000; // 2 minutes

function youtubeTrailerSearchUrl(title: string): string | null {
  if (!title) return null;
  return "https://www.youtube.com/results?search_query=" + encodeURIComponent(title + " official trailer");
}

function findAlternateUrl(linkField: any): string {
  const links = Array.isArray(linkField) ? linkField : linkField ? [linkField] : [];
  for (const l of links) {
    if (l && l.attributes && l.attributes.rel === "alternate" && typeof l.attributes.href === "string") {
      return l.attributes.href;
    }
  }
  return "";
}

function largestImageUrl(imageField: any): string {
  const images = Array.isArray(imageField) ? imageField : imageField ? [imageField] : [];
  const last = images[images.length - 1];
  return (last && typeof last.label === "string" && last.label) || "";
}

// In-theatres list from TMDB (needs TMDB_API_KEY: either the v3 API key or the
// v4 "API Read Access Token"). Uses TMDB now_playing for that country, ranked by TMDB popularity. This is NOT box
// office (TMDB has no per-country grosses). Returns null when no key is set,
// the call fails, or nothing is found, so the iTunes chart below is the fallback.
async function tmdbInTheatres(country: string, limit: number): Promise<MovieChart> {
  const key = (process.env.TMDB_API_KEY || "").trim();
  if (!key) return null;
  try {
    const q = new URLSearchParams({ region: country, page: "1" });
    const headers: Record<string, string> = {};
    if (key.startsWith("eyJ")) headers.Authorization = "Bearer " + key;
    else q.set("api_key", key);
    const res = await fetch("https://api.themoviedb.org/3/movie/now_playing?" + q.toString(), { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) { console.log("[movies] tmdb " + country + " -> HTTP " + res.status); return null; }
    const data: any = await res.json();
    const rows: any[] = (data && Array.isArray(data.results) && data.results) || [];
    console.log("[movies] tmdb " + country + " -> " + rows.length + " now playing");
    rows.sort((x, y) => (Number(y && y.popularity) || 0) - (Number(x && x.popularity) || 0));
    const out = rows.filter((r) => r && r.title).slice(0, limit).map((r, i) => ({
      rank: i + 1,
      title: String(r.title),
      url: "https://www.themoviedb.org/movie/" + r.id,
      artworkUrl: r.poster_path ? "https://image.tmdb.org/t/p/w342" + r.poster_path : "",
      previewUrl: youtubeTrailerSearchUrl(String(r.title)),
    }));
    return out.length ? out : null;
  } catch (err: any) {
    console.log("[movies] tmdb " + country + " -> threw: " + (err && err.message ? err.message : String(err)));
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
  if (cached) {
    const ttl = cached.value ? CHART_TTL : FAILURE_TTL;
    if (Date.now() - cached.at < ttl) return cached.value;
  }
  let value: MovieChart = await tmdbInTheatres(country, limit);
  try {
    if (!value) {
    const url = "https://itunes.apple.com/" + country + "/rss/topmovies/limit=" + limit + "/json";
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data: any = await res.json();
      const entries: any[] = (data && data.feed && Array.isArray(data.feed.entry) && data.feed.entry) || [];
      if (entries.length) {
        value = entries.slice(0, limit).map((e, i) => {
          const title = (e["im:name"] && e["im:name"].label) || "";
          return {
            rank: i + 1,
            title,
            url: findAlternateUrl(e.link),
            artworkUrl: largestImageUrl(e["im:image"]),
            previewUrl: youtubeTrailerSearchUrl(title),
          };
        });
      }
    } else {
      console.log("[movies] fetch " + country + " -> HTTP " + res.status);
    }
    }
  } catch (err: any) {
    console.log("[movies] fetch " + country + " -> threw: " + (err && err.message ? err.message : String(err)));
  }
  if (!value) console.log("[movies] no chart for " + country + " (feed empty, down, or not offered in that country)");
  // Keep the last good chart if Apple's feed is failing right now.
  if (!value && cached && cached.value) {
    chartCache.set(cacheKey, { at: Date.now() - CHART_TTL + FAILURE_TTL, value: cached.value });
    return cached.value;
  }
  chartCache.set(cacheKey, { at: Date.now(), value });
  return value;
}
