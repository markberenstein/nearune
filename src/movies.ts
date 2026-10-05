// Nearune — top movies chart at a free-text location. Apple's marketing
// RSS feed used by music.ts (rss.applemarketingtools.com) only covers apps,
// music, podcasts, books and audiobooks — it has no movies chart at all
// (confirmed: every /movies/... path 404s). The older iTunes Store RSS
// feed generator (itunes.apple.com/{country}/rss/topmovies/...) still
// works and does cover movies, so that's the source here instead. Bonus:
// each entry already includes a direct trailer/preview clip link, so no
// second iTunes Search API round trip is needed the way music.ts needs one
// for its preview — every entry in the chart gets a preview url for free.
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

function findEnclosureUrl(linkField: any): string | null {
  const links = Array.isArray(linkField) ? linkField : linkField ? [linkField] : [];
  for (const l of links) {
    if (l && l.attributes && l.attributes.rel === "enclosure" && typeof l.attributes.href === "string") {
      return l.attributes.href;
    }
  }
  return null;
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
  let value: MovieChart = null;
  try {
    const url = "https://itunes.apple.com/" + country + "/rss/topmovies/limit=" + limit + "/json";
    const res = await fetch(url);
    if (res.ok) {
      const data: any = await res.json();
      const entries: any[] = (data && data.feed && Array.isArray(data.feed.entry) && data.feed.entry) || [];
      if (entries.length) {
        value = entries.slice(0, limit).map((e, i) => ({
          rank: i + 1,
          title: (e["im:name"] && e["im:name"].label) || "",
          url: findAlternateUrl(e.link),
          artworkUrl: largestImageUrl(e["im:image"]),
          previewUrl: findEnclosureUrl(e.link),
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
