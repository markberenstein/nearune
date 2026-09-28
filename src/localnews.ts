// Nearune — top local news headline at a free-text location string, biased
// toward lighter/fun stories, via Google News' public RSS search (no API
// key required — unlike weather.ts's WeatherKit path, there's nothing to
// configure here). SANDBOX EXPERIMENT: shown as a single line between the
// Today/Puzzle content and the "next question" countdown — see page.ts's
// newsLineBlock(). Results are cached for a while since a "fun local
// story" doesn't need to be near-real-time, and this keeps from hammering
// Google's endpoint on every client poll.

export type LocalStory = { headline: string; source: string; url: string } | null;

const newsCache = new Map<string, { at: number; value: LocalStory }>();
const NEWS_TTL = 2 * 60 * 60 * 1000; // 2 hours — news doesn't need to be fresh-by-the-minute

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(parseInt(code, 10)));
}

function firstItem(xml: string): { title: string; link: string } | null {
  const itemMatch = xml.match(/<item>([\s\S]*?)<\/item>/);
  if (!itemMatch) return null;
  const itemXml = itemMatch[1];
  const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
  const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/);
  if (!titleMatch) return null;
  return { title: decodeEntities(titleMatch[1].trim()), link: linkMatch ? linkMatch[1].trim() : "" };
}

async function fetchTopStory(query: string): Promise<LocalStory> {
  try {
    const url = "https://news.google.com/rss/search?q=" + encodeURIComponent(query) + "&hl=en-US&gl=US&ceid=US:en";
    const res = await fetch(url);
    if (!res.ok) return null;
    const xml = await res.text();
    const item = firstItem(xml);
    if (!item || !item.title) return null;
    // Google News titles are usually "Headline - Source" — split on the
    // LAST " - " so a hyphen inside the headline itself doesn't break it.
    const idx = item.title.lastIndexOf(" - ");
    const headline = idx > 0 ? item.title.slice(0, idx) : item.title;
    const source = idx > 0 ? item.title.slice(idx + 3) : "";
    return { headline, source, url: item.link };
  } catch {
    return null;
  }
}

// Top local story for a free-text location, biased toward lighter/fun
// stories first — falls back to the plain top local headline if a
// fun/quirky-flavored search comes up empty (e.g. a slow news day).
// Returns null if the location is blank or nothing came back either way.
export async function topLocalStory(location: string): Promise<LocalStory> {
  const q = (location || "").trim();
  if (!q) return null;
  const cached = newsCache.get(q);
  if (cached && Date.now() - cached.at < NEWS_TTL) return cached.value;
  let value = await fetchTopStory(q + " (fun OR quirky OR feel-good OR heartwarming OR delightful)");
  if (!value) value = await fetchTopStory(q);
  newsCache.set(q, { at: Date.now(), value });
  return value;
}
