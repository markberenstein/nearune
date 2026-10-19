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
import { recordClaude } from "./usage";

export type LocalStory = { headline: string; source: string; url: string; access?: "free" | "unverified" } | null;

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

function allItems(xml: string, max: number): { title: string; link: string }[] {
  const out: { title: string; link: string }[] = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) && out.length < max) {
    const itemXml = m[1];
    const titleMatch = itemXml.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/);
    if (!titleMatch) continue;
    out.push({ title: decodeEntities(titleMatch[1].trim()), link: linkMatch ? linkMatch[1].trim() : "" });
  }
  return out;
}

// Google News throttles bursts (HTTP 503/429), which happens right after a
// restart when every cache is empty. Requests are paced one at a time, and a
// throttled one is retried after a pause.
let gnChain: Promise<unknown> = Promise.resolve();
let gnThrottledAt = 0;
function gnFetch(url: string): Promise<Response> {
  const run = async (): Promise<Response> => {
    let res = await fetch(url);
    for (const wait of [3000, 8000]) {
      if (res.status !== 503 && res.status !== 429) break;
      gnThrottledAt = Date.now();
      await new Promise((r) => setTimeout(r, wait));
      res = await fetch(url);
    }
    if (res.status === 503 || res.status === 429) gnThrottledAt = Date.now();
    await new Promise((r) => setTimeout(r, 800));
    return res;
  };
  const p = gnChain.then(run, run);
  gnChain = p.catch(() => {});
  return p;
}
// Last story found for each place, shown when a fresh search comes up empty
// (or Google is throttling) so a place is not left with nothing.
const lastGood = new Map<string, LocalStory>();

async function fetchCandidates(query: string): Promise<{ headline: string; source: string; url: string }[]> {
  try {
    const url = "https://news.google.com/rss/search?q=" + encodeURIComponent(query) + "&hl=en-US&gl=US&ceid=US:en";
    const res = await gnFetch(url);
    if (!res.ok) {
      console.log("[localnews] fetch " + JSON.stringify(query) + " -> HTTP " + res.status + " " + res.statusText);
      return [];
    }
    const xml = await res.text();
    const items = allItems(xml, 12);
    // Google News titles are usually "Headline - Source" — split on the
    // LAST " - " so a hyphen inside the headline itself doesn't break it.
    return items.filter((it) => it.title).map((it) => {
      const idx = it.title.lastIndexOf(" - ");
      return { headline: idx > 0 ? it.title.slice(0, idx) : it.title, source: idx > 0 ? it.title.slice(idx + 3) : "", url: it.link };
    });
  } catch (err: any) {
    console.log("[localnews] fetch " + JSON.stringify(query) + " -> threw: " + (err && err.message ? err.message : String(err)));
    return [];
  }
}

// Grim, political, promotional or dull headlines that slip past the search
// exclusions (these are checked on the headline text itself).
// Outlets that hard-paywall or meter most articles: skip them so the story opens for everyone.
const PAYWALLED = /(chronicle|mercury news|east bay times|san jose spotlight|new york times|nytimes|wall street journal|wsj|washington post|financial times|bloomberg|the athletic|los angeles times|latimes|boston globe|newsday|telegraph|the times|economist|business insider|wired|the information|seattle times|chicago tribune|denver post|baltimore sun|orlando sentinel|sun sentinel|miami herald|tampa bay times|star tribune|dallas morning|houston chronicle|atlantic|new yorker|politico pro|barron|forbes|insider|bild|le monde|le figaro|nikkei|haaretz|jerusalem post|the hindu|hindustan times|indian express|economic times|business standard|livemint|business today|moneycontrol|firstpost|scroll\.in|the print|theprint|kyiv independent plus|deccan herald|outlook business|hindu businessline|the week|straits times|south china morning post|scmp|sydney morning herald|the age|the australian|herald sun|courier mail|globe and mail|toronto star|national post|irish times|japan times|nation media|financial express|\bmint\b)/i;
const BAD_HEADLINE = /\b(dies|died|dead|death|killed|kill|murder|shooting|shot|stabb|crash|fatal|victim|tragedy|tragic|police say|arrest|charged|sentenced|court|lawsuit|trump|biden|election|vote|senate|congress|governor|mayor says|war|attack|abuse|assault|missing|body found|overdose|obituary|lottery|powerball|stock|earnings|forecast|weather alert|weekend events|things to do|top \d+|best of|sale|coupon|deal|score|recap|playoff|vs\.?)\b/i;

// Asks Claude Haiku to pick the single most delightful, genuinely quirky
// story from the candidates (or none). Returns an index, or null.
async function pickQuirkiest(place: string, headlines: string[], strict = true): Promise<number | null> {
  const key = Bun.env.ANTHROPIC_API_KEY;
  if (!key || headlines.length === 0) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 10,
        system:
          "You pick one news headline for two people who live far apart to smile over together. " +
          "Choose the headline that is funniest: absurd, deadpan, delightfully odd or a charming local mishap, with a wink of humor. Prefer humor over merely sweet; heartwarming is the tiebreaker. It must be about something that actually happened near " + place + ". " +
          "It must be lighthearted and safe: no death, injury, crime, politics, disasters, ads, listicles, sports results or weather alerts. " +
          (strict
            ? "Reply with only the number of the best headline, or NONE if none is genuinely fun."
            : "Reply with only the number of the lightest, most pleasant headline. Reply NONE only if every headline is grim, political or an ad."),
        messages: [{ role: "user", content: headlines.map((h, i) => (i + 1) + ". " + h).join("\n") }],
      }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    recordClaude("news", data);
    const text = String(data?.content?.[0]?.text || "").trim();
    const n = parseInt(text, 10);
    return Number.isFinite(n) && n >= 1 && n <= headlines.length ? n - 1 : null;
  } catch { return null; }
}


// Opens the story link the way a reader would and says whether it looks free.
// "paywalled" = the page blocks readers or carries paywall markers; "unverified" =
// the link could not be resolved (Google News links often hand off with
// JavaScript), which is accepted but reported as such on the admin page.
async function checkArticleAccess(url: string): Promise<"free" | "paywalled" | "unverified"> {
  if (!url) return "unverified";
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 7000);
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctl.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        "accept": "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    clearTimeout(timer);
    const finalUrl = res.url || url;
    let host = "";
    try { host = new URL(finalUrl).hostname; } catch {}
    if (/(^|\.)(news|consent)\.google\.com$/.test(host)) return "unverified";
    if (PAYWALLED.test(host)) return "paywalled";
    if ([401, 402, 403, 451].includes(res.status)) return "paywalled";
    if (!res.ok) return "unverified";
    const html = (await res.text()).slice(0, 400000);
    if (/"isAccessibleForFree"\s*:\s*(false|"false")/i.test(html)) return "paywalled";
    if (/(subscribe to (continue|read|unlock)|subscription (is )?required|already a subscriber|sign in to (continue|read)|log in to (continue|read)|register to (continue|read)|premium (content|article|story)|unlock (this|the) (article|story)|you have reached your (free|monthly)|paywall)/i.test(html)) return "paywalled";
    return "free";
  } catch {
    return "unverified";
  }
}

// Headlines already shown per place, so the same story never repeats.
const seenStories = new Map<string, string[]>();

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
  const seen = seenStories.get(q) || [];
  let value: LocalStory = null;
  const idx = THEMES.findIndex((t) => t.name === theme.name);
  const city = q.split(",")[0].trim() || q;
  // Tiers, strictest first, so every place still gets a story most days:
  // today's theme, a second theme, then looser "quirky" searches that go back
  // a month and use just the city name (a long "City, State, Country" label
  // rarely matches headlines). Looser tiers let Claude settle for the
  // lightest pleasant story rather than demanding a laugh.
  const tiers: { query: string; strict: boolean }[] = [
    { query: q + " " + theme.terms + " " + EXCLUDE_TERMS + " when:14d", strict: true },
    { query: q + " " + THEMES[(idx + 3) % THEMES.length].terms + " " + EXCLUDE_TERMS + " when:14d", strict: true },
    { query: city + " (viral OR quirky OR unusual OR funny OR bizarre OR heartwarming OR adorable) " + EXCLUDE_TERMS + " when:30d", strict: false },
    { query: city + " (festival OR tradition OR \"local favorite\" OR \"first-ever\" OR unveils OR celebrates) " + EXCLUDE_TERMS + " when:30d", strict: false },
  ];
  for (const tier of tiers) {
    const cands = (await fetchCandidates(tier.query))
      .filter((c) => !BAD_HEADLINE.test(c.headline) && !PAYWALLED.test(c.source) && !PAYWALLED.test(c.url) && c.headline.length >= 25 && !seen.includes(c.headline));
    // Pick the best story, open it, and if it turns out to be paywalled drop it and
    // pick again (up to 3 tries per tier) so a story nobody can read is never shown.
    let pool = cands;
    for (let attempt = 0; attempt < 3 && pool.length; attempt++) {
      let pick: number | null;
      if (!Bun.env.ANTHROPIC_API_KEY) pick = 0; // No Claude key: take the first candidate.
      else pick = await pickQuirkiest(q, pool.map((c) => c.headline), tier.strict);
      if (pick === null) break; // Claude said NONE: move to the next tier.
      const cand = pool[pick];
      const access = await checkArticleAccess(cand.url);
      if (access === "paywalled") {
        console.log("[localnews] " + q + " -> skipped paywalled story " + JSON.stringify(cand.headline) + " [" + cand.source + "]");
        pool = pool.filter((_, i) => i !== pick);
        continue;
      }
      value = { ...cand, access };
      break;
    }
    if (value) break;
  }
  console.log(
    "[localnews] " + q + " (theme=" + theme.name + ") -> " +
    (value ? "ok: " + JSON.stringify(value.headline) + " [" + value.source + "]" : "no on-theme story found")
  );
  if (value) { seenStories.set(q, [...seen, value.headline].slice(-30)); lastGood.set(q, value); }
  const throttled = Date.now() - gnThrottledAt < 2 * 60 * 1000;
  if (!value && lastGood.get(q)) {
    // Fresh search found nothing (or was throttled): keep showing the last good story.
    value = lastGood.get(q)!;
    console.log("[localnews] " + q + " -> reusing last good story" + (throttled ? " (Google throttled)" : ""));
  }
  // A miss is only cached briefly so a later open (or the daily check) retries:
  // 10 minutes normally, about a minute when Google was throttling.
  newsCache.set(cacheKey, { at: value ? Date.now() : Date.now() - NEWS_TTL + (throttled ? 60 : 600) * 1000, value });
  return value;
}
