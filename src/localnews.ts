// Nearune — top local news headline at a free-text location string, biased
// toward lighter/fun stories, via Google News' public RSS search (no API
// key required — unlike weather.ts's WeatherKit path, there's nothing to
// configure here). SANDBOX EXPERIMENT: shown as a single line between the
// Today/Puzzle content and the "next question" countdown — see page.ts's
// newsLineBlock(). Results are cached for a while since a "fun local
// story" doesn't need to be near-real-time, and this keeps from hammering
// Google's endpoint on every client poll.
//
// A single broad "fun" query tends to return the SAME top headline for
// days at a time (Google News' top match for an evergreen query is sticky),
// which is what made the news line feel repetitive. To fix that, each day
// picks one narrow theme (see THEMES below) from a rotating list, keyed to
// the app's own day boundary (todayKeyPT — 6:30am IST, same as everywhere
// else in the app), so the query itself — not just the cache — changes
// daily and both people see a genuinely different kind of story each day.

import { todayKeyPT } from "./util";

export type LocalStory = { headline: string; source: string; url: string } | null;

const newsCache = new Map<string, { at: number; value: LocalStory }>();
const NEWS_TTL = 2 * 60 * 60 * 1000; // 2 hours — news doesn't need to be fresh-by-the-minute

// Narrow, non-overlapping themes — each day's query uses only ONE of these,
// so the story pool genuinely differs day to day instead of the same broad
// "fun" search returning the same sticky top result. Order doesn't matter;
// the day picks an index by hashing todayKeyPT() below.
const THEMES: { name: string; terms: string }[] = [
  { name: "festival", terms: "(festival OR carnival OR \"pop-up\" OR parade OR fair)" },
  { name: "art", terms: "(art OR artist OR gallery OR mural OR exhibit OR installation)" },
  { name: "comedy", terms: "(comedy OR comedian OR \"stand-up\" OR \"open mic\" OR improv)" },
  { name: "heartwarming", terms: "(heartwarming OR \"feel-good\" OR uplifting OR delightful OR touching)" },
  { name: "quirky", terms: "(quirky OR zany OR offbeat OR wacky OR whimsical OR bizarre-but-fun)" },
  { name: "local hero", terms: "(\"local hero\" OR volunteer OR kindness OR generosity OR \"good samaritan\")" },
  { name: "street performance", terms: "(\"street performer\" OR busker OR mascot OR \"flash mob\")" },
  { name: "food & treats", terms: "(bakery OR \"food truck\" OR \"ice cream\" OR cafe OR \"pop-up shop\")" },
  { name: "pets & animals", terms: "(\"shelter dog\" OR \"animal rescue\" OR \"therapy dog\" OR reunited OR adoption)" },
  { name: "milestone", terms: "(\"world record\" OR \"record-breaking\" OR milestone OR anniversary OR reunion)" },
  { name: "music", terms: "(concert OR busker OR \"open mic\" OR choir OR \"live music\")" },
  { name: "community", terms: "(\"community garden\" OR neighborhood OR \"block party\" OR fundraiser OR charity)" },
];

// Deterministic day-to-day rotation through THEMES, keyed to the app's own
// day boundary so it changes once per "Nearune day" (not at UTC midnight)
// and both people get the same theme on the same day.
function todaysTheme(): { name: string; terms: string } {
  const key = todayKeyPT(); // "YYYY-MM-DD"
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return THEMES[hash % THEMES.length];
}

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
    if (!res.ok) {
      console.log("[localnews] fetch " + JSON.stringify(query) + " -> HTTP " + res.status + " " + res.statusText);
      return null;
    }
    const xml = await res.text();
    const item = firstItem(xml);
    if (!item || !item.title) {
      console.log("[localnews] fetch " + JSON.stringify(query) + " -> no <item>/<title> found in RSS (" + xml.length + " bytes)");
      return null;
    }
    // Google News titles are usually "Headline - Source" — split on the
    // LAST " - " so a hyphen inside the headline itself doesn't break it.
    const idx = item.title.lastIndexOf(" - ");
    const headline = idx > 0 ? item.title.slice(0, idx) : item.title;
    const source = idx > 0 ? item.title.slice(idx + 3) : "";
    return { headline, source, url: item.link };
  } catch (err: any) {
    console.log("[localnews] fetch " + JSON.stringify(query) + " -> threw: " + (err && err.message ? err.message : String(err)));
    return null;
  }
}

// Excluded so a story merely mentioning "event" or "festival" in passing
// (a shooting AT an event, a crash NEAR a festival) can't sneak through —
// Google News search supports "-" exclusion the same way its web search does.
const EXCLUDE_TERMS =
  "-crime -shooting -shot -killed -dead -death -died -murder -stabbing " +
  "-robbery -arrest -arrested -crash -accident -fire -explosion -war " +
  "-attack -assault -abuse -scandal -lawsuit -controversy -protest " +
  "-flood -disaster -storm -outage -layoffs -bankruptcy -indicted -trial";

// Top local story for a free-text location, biased toward lighter/fun
// stories and away from anything dark — using today's single rotating
// theme (see THEMES/todaysTheme above) rather than one broad "fun" query,
// so the story pool changes daily instead of Google News handing back the
// same sticky top match every time. Tries with dark-topic exclusions
// first, loosens slightly if that comes up empty, and returns null —
// rather than falling back to an unfiltered "top local headline" — if
// nothing on-theme turns up at all, since showing a grim or unrelated
// headline here would defeat the point.
export async function topLocalStory(location: string): Promise<LocalStory> {
  const q = (location || "").trim();
  if (!q) return null;
  const theme = todaysTheme();
  // Cache key includes the date + theme so a cache entry can never survive
  // across the app's day boundary and serve yesterday's story.
  const cacheKey = todayKeyPT() + "|" + theme.name + "|" + q;
  const cached = newsCache.get(cacheKey);
  if (cached && Date.now() - cached.at < NEWS_TTL) return cached.value;
  let value = await fetchTopStory(q + " " + theme.terms + " " + EXCLUDE_TERMS);
  if (!value) value = await fetchTopStory(q + " " + theme.terms);
  // Temporary diagnostic — same idea as weatherkit.ts's, to confirm from
  // the Railway logs whether this is actually pulling real stories, and
  // which theme is active for the day.
  console.log(
    "[localnews] " + q + " (theme=" + theme.name + ") -> " +
    (value ? "ok: " + JSON.stringify(value.headline) : "no story found")
  );
  newsCache.set(cacheKey, { at: Date.now(), value });
  return value;
}
