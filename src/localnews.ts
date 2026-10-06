// Nearune — top local news headline at a free-text location string, biased
// toward genuinely odd/funny stories, via Google News' public RSS search
// (no API key required — unlike weather.ts's WeatherKit path, there's
// nothing to configure here). SANDBOX EXPERIMENT: shown as a single line
// between the Today/Puzzle content and the "next question" countdown —
// see page.ts's newsLineBlock(). Real stories, with a real link, so both
// of you can actually open and laugh over the same thing — see
// topLocalStory's doc comment below for why these are tone-targeted
// rather than category-targeted. Results are cached for a while since a
// "fun local story" doesn't need to be near-real-time, and this keeps
// from hammering Google's endpoint on every client poll.
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

// These used to be CATEGORIES of event (festival, art, community) — but a
// real "art exhibit opens" or "community fundraiser" headline is usually
// a flat, press-release-style local-news item, not something to laugh
// over. Retuned to TONE words instead: things real local reporters use
// specifically for the "huh, no way" story — an escaped animal, a viral
// video, a world-record attempt — which is a much better predictor of
// something genuinely shareable than the event category was.
const THEMES: { name: string; terms: string }[] = [
  { name: "loose animal", terms: "(\"on the loose\" OR escaped OR \"spotted wandering\" OR \"roaming the streets\" OR \"chased down\")" },
  { name: "viral moment", terms: "(viral OR \"caught on camera\" OR \"caught on video\" OR \"internet can't stop\" OR \"go viral\")" },
  { name: "bizarre but true", terms: "(bizarre OR baffled OR \"you won't believe\" OR stunned OR \"left speechless\")" },
  { name: "world record", terms: "(\"world record\" OR \"guinness world records\" OR \"record attempt\" OR \"largest ever\")" },
  { name: "wacky contest", terms: "(\"wacky contest\" OR \"pie-eating\" OR \"costume contest\" OR \"weirdest\" OR \"silly olympics\")" },
  { name: "lost and found", terms: "(\"message in a bottle\" OR \"time capsule\" OR \"returned after\" OR \"lost wallet\" OR \"found after\" OR \"reunited with\")" },
  { name: "mix-up", terms: "(\"mistaken for\" OR \"wrong address\" OR \"accidentally delivered\" OR \"case of mistaken identity\" OR mix-up)" },
  { name: "oddly specific", terms: "(\"world's smallest\" OR \"world's largest\" OR \"only one of its kind\" OR \"unlike anything\")" },
  { name: "unlikely friendship", terms: "(\"unlikely friendship\" OR \"best friends\" OR adopted OR reunited) (dog OR cat OR goat OR duck OR animal)" },
  { name: "hilarious fail", terms: "(hilarious OR blooper OR \"goes wrong\" OR \"not according to plan\") -injur* -hospital*" },
];

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
  "-flood -disaster -storm -outage -layoffs -bankruptcy -indicted -trial " +
  "-fossil -fossils -archaeolog* -archeolog* -dinosaur -excavat* -unearthed -ancient -skeleton -bones -remains -discovery -discovered -scientists -researchers -paleontolog*";

// Top local story for a free-text location, biased toward genuinely odd
// or funny stories using today's single rotating TONE theme (see
// THEMES/todaysTheme above) rather than an event category — a tone word
// like "viral" or "on the loose" is a much better filter for "something
// to laugh over together" than a category like "festival" or "art",
// which mostly surfaces flat, press-release-style local news instead.
// Unlike the weather/weatherkit path, there's no looser fallback query
// here on purpose: if nothing genuinely on-theme turns up, this returns
// null (no story shown that day) rather than falling back to an
// unfiltered "top local headline", which would defeat the point.
export async function topLocalStory(location: string): Promise<LocalStory> {
  const q = (location || "").trim();
  if (!q) return null;
  const theme = todaysTheme();
  // Cache key includes the date + theme so a cache entry can never survive
  // across the app's day boundary and serve yesterday's story.
  const cacheKey = todayKeyPT() + "|" + theme.name + "|" + q;
  const cached = newsCache.get(cacheKey);
  if (cached && Date.now() - cached.at < NEWS_TTL) return cached.value;
  const value = await fetchTopStory(q + " " + theme.terms + " " + EXCLUDE_TERMS);
  // Temporary diagnostic — same idea as weatherkit.ts's, to confirm from
  // the Railway logs whether this is actually pulling real stories, and
  // which theme is active for the day.
  console.log(
    "[localnews] " + q + " (theme=" + theme.name + ") -> " +
    (value ? "ok: " + JSON.stringify(value.headline) : "no on-theme story found")
  );
  newsCache.set(cacheKey, { at: Date.now(), value });
  return value;
}
