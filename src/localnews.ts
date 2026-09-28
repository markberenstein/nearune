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

// Bias terms for the "fun local story" search — local happenings, art and
// comedy scenes, genuinely lighthearted stuff. Deliberately drops ambiguous
// words like "bizarre", "weird", "event" or "viral" that match just as
// easily onto a dark headline ("bizarre crash", "shooting at event") as a
// fun one — see EXCLUDE_TERMS below for the other half of that fix.
const FUN_TERMS =
  "(fun OR quirky OR zany OR offbeat OR wacky OR whimsical OR " +
  "feel-good OR heartwarming OR delightful OR charming OR uplifting OR " +
  "festival OR \"pop-up\" OR exhibit OR mural OR parade OR carnival OR " +
  "art OR artist OR gallery OR comedy OR comedian OR \"stand-up\" OR " +
  "\"street performer\" OR busker OR mascot OR \"local hero\")";

// Excluded so a story merely mentioning "event" or "festival" in passing
// (a shooting AT an event, a crash NEAR a festival) can't sneak through —
// Google News search supports "-" exclusion the same way its web search does.
const EXCLUDE_TERMS =
  "-crime -shooting -shot -killed -dead -death -died -murder -stabbing " +
  "-robbery -arrest -arrested -crash -accident -fire -explosion -war " +
  "-attack -assault -abuse -scandal -lawsuit -controversy -protest " +
  "-flood -disaster -storm -outage -layoffs -bankruptcy -indicted -trial";

// Top local story for a free-text location, biased toward lighter/fun
// stories and away from anything dark. Tries a strict version first (fun
// terms + dark-topic exclusions), loosens slightly if that comes up empty,
// and returns null — rather than falling back to an unfiltered "top local
// headline" — if nothing lighthearted turns up at all, since showing a
// grim headline here would defeat the point.
export async function topLocalStory(location: string): Promise<LocalStory> {
  const q = (location || "").trim();
  if (!q) return null;
  const cached = newsCache.get(q);
  if (cached && Date.now() - cached.at < NEWS_TTL) return cached.value;
  let value = await fetchTopStory(q + " " + FUN_TERMS + " " + EXCLUDE_TERMS);
  if (!value) value = await fetchTopStory(q + " " + FUN_TERMS);
  // Temporary diagnostic — same idea as weatherkit.ts's, to confirm from
  // the Railway logs whether this is actually pulling real stories.
  console.log("[localnews] " + q + " -> " + (value ? "ok: " + JSON.stringify(value.headline) : "no story found"));
  newsCache.set(q, { at: Date.now(), value });
  return value;
}
