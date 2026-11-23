// Nearune — Bun HTTP server. Room-scoped: "/" is the original room (same
// as the single-file version always was), "/r/<roomId>" is any other room,
// and "/new" lets anyone spin up a fresh private room for themselves.

import { roomExists, readSideFile, writeSideFile } from "./storage";
import { screenText } from "./moderation";
import { startStatsSchedule, refreshStats } from "./stats";
import { isPerson, type PersonKey, type State } from "./types";
import {
  loadState,
  saveState,
  createRoom,
  deleteRoom,
  puzzleImageKey,
  localPuzzlePath,
  photoKey,
  localPhotoPath,
  videoKey,
  localVideoPath,
  useS3,
  s3,
  ensurePuzzleMigrated,
  addToEmailIndex,
  lookupEmailIndex,
  removeFromEmailIndex,
  listRoomIds,
  loadRoomAliases,
  addRoomAlias,
  roomSlug,
} from "./storage";
import { resolveTranslation, translateEmailStrings } from "./translate";
import { cloneVoice, deleteVoice, synthesizeSpeech, parseVoiceSample, defaultVoiceId } from "./voice";
import { aiGuessMatches, moderateContent, guessPlaceFromImage, voiceGenderForName } from "./ai";
import { regionAbbr } from "./usstates";
import { resolveTimezoneFromLocation, resolveLocationInfo, isBlockedLocation, isCityLevelLocation, searchPlaces, canonicalPlaceLabel } from "./geo";
import { currentWeather } from "./weather";
import { topLocalStory } from "./localnews";
import { newRound } from "./nhie";
import { topSongs, previewClip } from "./music";
import { topMovies } from "./movies";
import { PUZZLE_TOTAL, puzzleUnlockedCount, json, isValidEmail, readJson, sendEmail, todayKeyPT, todayKeyFor, guessMatches, advanceQueue, forClient, hashEmail, unansweredCount, isSoloRoom, effectiveLocation, normalizeInstagramHandle } from "./util";
import { APP_STORE_BADGE_B64 } from "./badge";
import { GOOGLE_PLAY_BADGE_SVG, GOOGLE_PLAY_BADGE_PNG_B64, GOOGLE_PLAY_URL } from "./play-badge";
import { buildPageHtml, buildNewRoomPage, buildRecoverPage, buildPrivacyPage, buildSupportPage, buildTermsPage, buildChildSafetyPage, buildManifestJson, buildServiceWorkerJs } from "./page";

// The app's question lists live in the page script; a question sent with an
// invite is only shown on the invite page if it appears there word for word.
let knownQuestionSource = "";
function isKnownQuestion(q: string): boolean {
  if (!knownQuestionSource) { try { knownQuestionSource = buildPageHtml("", todayKeyPT()); } catch { return false; } }
  return q.length >= 10 && knownQuestionSource.includes(JSON.stringify(q));
}
import { rateLimit, clientIp } from "./rate-limit";
import { buildGetPage } from "./get-page";
import { buildInvitePage } from "./invite-page";
import { buildHomePage } from "./home-page";
import { friendJoin, friendStatus, friendCancel, friendBlock, friendSetPush, friendRequeue, type FriendProfile } from "./friend";
import { recordFunnel, recordLanding, recordTime, recordRoomUse, isValidFunnelDevice, isFunnelStep } from "./funnel";
import { startQaSchedule, lastQaReport, runQa, roomQaOnce } from "./qa";
const tzBackfillAt = new Map<string, number>();
import { sendPush, pushConfigured, vapidPublicKey, anyPushConfigured, setBadgeResolver } from "./push";
// Deferred invites: network -> invite destination for 48 hours (see
// /api/deferred-invite). Saved so an app update doesn't drop them; the
// network address itself is never stored, only a one-way hash of it.
const deferredInvites = new Map<string, { dest: string; at: number }>();
const DEFERRED_FILE = "side/deferred-invites.json";
function deferredKey(ip: string): string {
  return new Bun.CryptoHasher("sha256").update((Bun.env.EMAIL_HASH_SECRET || "nearune") + "|deferred|" + ip).digest("hex").slice(0, 32);
}
let deferredSaveTimer: any = null;
function saveDeferredSoon() {
  if (deferredSaveTimer) return;
  deferredSaveTimer = setTimeout(() => {
    deferredSaveTimer = null;
    writeSideFile(DEFERRED_FILE, JSON.stringify(Object.fromEntries(deferredInvites))).catch(() => {});
  }, 2000);
}
readSideFile(DEFERRED_FILE).then((t) => {
  if (!t) return;
  try {
    const cut = Date.now() - 48 * 60 * 60 * 1000;
    const o = JSON.parse(t);
    for (const k of Object.keys(o)) if (o[k] && o[k].at > cut && typeof o[k].dest === "string" && !deferredInvites.has(k)) deferredInvites.set(k, o[k]);
  } catch {}
}).catch(() => {});
setInterval(() => { const cut = Date.now() - 48 * 60 * 60 * 1000; let ch = false; for (const [k, v] of deferredInvites) if (v.at < cut) { deferredInvites.delete(k); ch = true; } if (ch) saveDeferredSoon(); }, 10 * 60 * 1000);

// Vulgar / NSFW screen for text people write. Returns a Response to send back
// when the text is rejected (friend rooms), otherwise null. Every hit is
// recorded for the admin page.
async function moderate(roomId: string, who: string, kind: string, text: string, confirmed = false): Promise<Response | null> {
  const word = screenText(text);
  if (!word) return null;
  // Rooms between people who know each other: warn first and let the writer
  // edit. Nothing is saved or logged until they choose to post it anyway.
  if (!confirmed && (await loadState(roomId)).origin !== "friend") {
    return new Response(JSON.stringify({ error: "flagged_confirm" }), { status: 409, headers: { "content-type": "application/json" } });
  }
  let friend = false;
  await saveState(roomId, (s) => {
    friend = s.origin === "friend";
    if (!s.flags) s.flags = [];
    if (s.flags.length < 100) s.flags.push({ at: new Date().toISOString(), who, kind, word, excerpt: text.slice(0, 120) });
  });
  console.log("[moderation] room=" + roomId + " kind=" + kind + " who=" + who + " word=" + word + (friend ? " blocked" : " logged"));
  return friend ? new Response(JSON.stringify({ error: "content_blocked" }), { status: 422, headers: { "content-type": "application/json" } }) : null;
}


// Counts rooms created today (Pacific time). Scanned once per day / process
// start, then incremented as rooms are created.
const regToday = { day: "", n: 0 };
function pacificDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
// Slack heads-up at every 10th new room of the day (10, 20, ... 100). Needs a
// Slack "Incoming Webhook" URL in SLACK_WEBHOOK_URL; without one this does
// nothing. Fire-and-forget so it can never slow down or break room creation.
function notifyRoomMilestone(n: number): void {
  const hook = Bun.env.SLACK_WEBHOOK_URL;
  if (!hook || n < 10 || n % 10 !== 0) return;
  const cap = parseInt(Bun.env.REGISTRATION_DAILY_CAP || "50", 10) || 50;
  const text = ":tada: Nearune: " + n + " new rooms created today (" + pacificDay(new Date()) + ")." + (n >= cap ? " Daily cap of " + cap + " reached \u2014 new rooms are paused until tomorrow." : "");
  fetch(hook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) })
    .then((r) => { if (!r.ok) console.error("[slack] milestone post failed status=" + r.status); })
    .catch((e) => console.error("[slack] milestone post error", e));
}

// Slack note to #nearune-app (the SLACK_WEBHOOK_URL webhook) when someone's
// sign-up is turned away because their city is in a blocked country. The
// phone retries a few times, so one note per room and country per 30 minutes.
const signupBlockedSent = new Map<string, number>();
function notifySignupBlocked(room: string, country: string, via: string): void {
  const hook = Bun.env.SLACK_WEBHOOK_URL;
  if (!hook) return;
  const k = room + "|" + country;
  const last = signupBlockedSent.get(k) || 0;
  if (Date.now() - last < 30 * 60 * 1000) return;
  signupBlockedSent.set(k, Date.now());
  if (signupBlockedSent.size > 500) signupBlockedSent.clear();
  let countryName = country || "a blocked country";
  try { if (country) countryName = (new Intl.DisplayNames(["en"], { type: "region" }).of(country) || country) + " (" + country + ")"; } catch {}
  const when = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date());
  const text = ":no_entry: Nearune sign-up blocked: city is in " + countryName + ". Room " + room + ", " + via + ", " + when + " PT.";
  fetch(hook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) })
    .then((r) => { if (!r.ok) console.error("[slack] signup-blocked post failed status=" + r.status); })
    .catch((e) => console.error("[slack] signup-blocked post error", e));
}

// Invite link activity, posted to #nearune-app so Mark can see whether the
// person who got an invite ever taps it, and where they stop:
//   preview = the link was pasted into a chat app (WhatsApp, iMessage...)
//   opened  = a person tapped it and saw the invite page
//   store / accept / web = which button they tapped on the invite page
//   joined  = they finished joining the room
// One note per room and step per 20 minutes (link previews load repeatedly).
const inviteEventSent = new Map<string, number>();
function waitedSince(iso: any): string {
  const t = Date.parse(String(iso || ""));
  if (!isFinite(t)) return "";
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  return m < 60 ? m + " min" : Math.floor(m / 60) + " h " + (m % 60) + " min";
}
function inviteDevice(ua: string): string {
  const os = /iPad/i.test(ua) ? "iPad" : /iPhone|iPod/i.test(ua) ? "iPhone" : /Android/i.test(ua) ? "Android" : /Windows/i.test(ua) ? "Windows" : /Macintosh|Mac OS X/i.test(ua) ? "Mac" : "other device";
  const app = /; ?wv\)/.test(ua) && !/Instagram|FBAN|FBAV|FB_IAB|WhatsApp|Line\//i.test(ua) ? "Nearune app" : /Instagram/i.test(ua) ? "Instagram" : /FBAN|FBAV|FB_IAB/i.test(ua) ? "Facebook" : /WhatsApp/i.test(ua) ? "WhatsApp" : /Line\//i.test(ua) ? "LINE" : /CriOS|Chrome\//i.test(ua) ? "Chrome" : /Firefox|FxiOS/i.test(ua) ? "Firefox" : /Safari\//i.test(ua) ? "Safari" : "";
  return app ? os + ", " + app : os;
}
const PREVIEW_BOTS: [RegExp, string][] = [
  [/WhatsApp/i, "WhatsApp"], [/facebookexternalhit|Facebot/i, "Messenger/Instagram/iMessage"], [/Twitterbot/i, "iMessage/X"],
  [/TelegramBot/i, "Telegram"], [/Slackbot/i, "Slack"], [/Discordbot/i, "Discord"], [/LinkedInBot/i, "LinkedIn"],
  [/SkypeUriPreview|Teams/i, "Skype/Teams"], [/Snapchat/i, "Snapchat"], [/Viber/i, "Viber"], [/Line\//i, "LINE"],
  [/Googlebot|bingbot|Applebot|bot\b|crawler|spider|preview/i, "a link preview"],
];
function previewBotName(ua: string): string {
  // WhatsApp's in-app browser is a real person; its preview fetcher has no "Mozilla".
  if (/WhatsApp/i.test(ua) && /Mozilla/i.test(ua) && /Mobile/i.test(ua) && !/WhatsApp\/[\d.]+ [AW]$/i.test(ua)) return "";
  for (const [re, name] of PREVIEW_BOTS) if (re.test(ua)) return name;
  return "";
}
function notifyInviteEvent(room: string, step: string, st: any, extra: string): void {
  const k = room + "|" + step;
  const last = inviteEventSent.get(k) || 0;
  if (Date.now() - last < 20 * 60 * 1000) return;
  inviteEventSent.set(k, Date.now());
  if (inviteEventSent.size > 1000) inviteEventSent.clear();
  const ppl = (st && st.people) || {};
  const inviterKey = (["mark", "nikita"] as const).find((p) => ppl[p] && ppl[p].confirmed && !(st.pendingInvite && st.pendingInvite[p]));
  const inviter = inviterKey ? String(ppl[inviterKey].name || "Someone") : "Someone";
  const f = (st && st.funnel) || {};
  const sentIso = f.invite_shared || f.invite_emailed || "";
  const waited = waitedSince(sentIso);
  const what =
    step === "preview" ? ":speech_balloon: " + inviter + "'s invite link was pasted into " + extra + " (the chat loaded its preview)" :
    step === "opened" ? ":eyes: " + inviter + "'s invite was opened (" + extra + ")" :
    step === "store" ? ":arrow_down: Invite to " + inviter + "'s room: tapped Get the app (" + extra + ")" :
    step === "accept" ? ":arrow_down: Invite to " + inviter + "'s room: tapped Accept invite, going to the app store (" + extra + ")" :
    step === "web" ? ":globe_with_meridians: Invite to " + inviter + "'s room: tapped Accept invite, joining in the browser (" + extra + ")" :
    step === "joined" ? ":tada: " + extra + " joined " + inviter + "'s room" :
    "Invite to " + inviter + "'s room: " + step;
  const text = what + ". Room " + room + (waited ? ", " + waited + " after the invite was sent" : "") + ".";
  console.log("[invite-event] room=" + room + " step=" + step + (extra ? " " + JSON.stringify(extra) : ""));
  const hook = Bun.env.SLACK_WEBHOOK_URL;
  if (!hook) return;
  fetch(hook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) })
    .then((r) => { if (!r.ok) console.error("[slack] invite-event post failed status=" + r.status); })
    .catch((e) => console.error("[slack] invite-event post error", e));
}

async function roomsCreatedToday(): Promise<number> {
  const day = pacificDay(new Date());
  if (regToday.day !== day) {
    let n = 0;
    try {
      for (const id of await listRoomIds()) {
        if (!id) continue;
        const st = await loadState(id);
        // Only rooms someone actually signed up in count toward the cap;
        // a tap on "Invite your first Nearune partner" that went nowhere doesn't.
        const signedUp = Object.values(st.people || {}).some((p: any) => p && p.name);
        if (signedUp && st.createdAt && pacificDay(new Date(st.createdAt)) === day) n++;
      }
    } catch {}
    regToday.day = day;
    regToday.n = n;
  }
  return regToday.n;
}


const FUNNEL_STEPS = new Set([
  "reg_screen", "reg_city", "reg_name", "reg_email", "reg_clicked",
  "reg_err_city", "reg_err_name", "reg_err_relationship", "reg_err_server",
  "confirm_screen", "invite_screen", "invite_step",
  // The invite actually went out: link copied or shared, or email sent.
  "invite_shared", "invite_emailed",
  // Question first: picked who it's for, saw today's question, typed, tapped Send.
  "fq_who", "fq_question", "fq_typed", "fq_sent",
]);

const PORT = Number(Bun.env.PORT) || 3000;

function parseRoom(pathname: string): { roomId: string; restPath: string } {
  const m = pathname.match(/^\/r\/([a-zA-Z0-9]{1,40})(\/.*)?$/);
  if (m) return { roomId: m[1], restPath: m[2] && m[2].length > 0 ? m[2] : "/" };
  return { roomId: "", restPath: pathname };
}

// Sign-up trouble log. Any failed (4xx/5xx) call on the create / register /
// invite / accept steps is written as one line with the room, step, status,
// the error code, and the coarse device + language — never names, emails,
// locations or other request content. Lets us see where a visitor stalled.
// Room name typed by the first person on the setup screen (the home screen's
// first tile creates the room with no name). Only applies while nobody has
// signed up and the room has no name. Sets the title, and when the name
// makes a usable code, a friendlier room code ("oursky", or "oursky47" if
// taken) — the original id keeps working.
async function applySignupRoomName(roomId: string, raw: unknown): Promise<"ok" | "blocked" | "skip"> {
  const nm = typeof raw === "string" ? raw.trim().slice(0, 40) : "";
  if (!nm || !roomId) return "skip";
  const cur = await loadState(roomId);
  if (cur.roomName || Object.values(cur.people || {}).some((p: any) => p && p.confirmed)) return "skip";
  const verdict = await moderateContent({ text: nm });
  console.log("[room-name] \"" + nm + "\" screening=" + verdict + " (setup)");
  if (verdict === "blocked") return "blocked";
  const stem = roomSlug(nm);
  let code = "";
  if (stem.length >= 4 && stem !== roomId) {
    for (let i = 0; i < 12 && !code; i++) {
      const cand = i === 0 ? stem : stem + String(10 + Math.floor(Math.random() * 90));
      if (await addRoomAlias(cand, roomId)) code = cand;
    }
  }
  await saveState(roomId, (s) => { if (!s.roomName) s.roomName = nm; if (code && !s.roomCode) s.roomCode = code; });
  return "ok";
}

const SIGNUP_PATHS = new Set(["/api/create-room", "/api/register", "/api/invite", "/api/accept-invite", "/api/confirm", "/api/geo"]);
function logSignupFailure(req: Request, pathname: string, res: Response): void {
  try {
    const { roomId, restPath } = parseRoom(pathname);
    const step = pathname === "/api/create-room" ? pathname : restPath;
    if (!SIGNUP_PATHS.has(step) || res.status < 400) return;
    const ua = req.headers.get("user-agent") || "";
    const device = /iPad/i.test(ua) ? "iPad" : /iPhone|iPod/i.test(ua) ? "iPhone" : /Android/i.test(ua) ? "Android" : /Windows/i.test(ua) ? "Windows" : /Macintosh|Mac OS X/i.test(ua) ? "Mac" : "other";
    // The Android app runs in Android's WebView, whose user agent also says Chrome and Safari but adds "; wv)" — that
    // marked every Android app user as "Android web". (Facebook and Instagram's own browsers are WebViews too: still web.)
    const kind = /; ?wv\)/.test(ua) && !/Instagram|FBAN|FBAV|FB_IAB|WhatsApp|Line\//i.test(ua) ? "app" : /Safari\//.test(ua) || /Chrome\//.test(ua) || /Firefox\//.test(ua) ? "web" : "app";
    const lang = (req.headers.get("accept-language") || "").split(",")[0].trim().slice(0, 12) || "?";
    res.clone().json().then((b: any) => {
      const country = b && typeof b.country === "string" ? b.country.slice(0, 2) : "";
      console.log("[signup-fail] room=" + (roomId || "main") + " step=" + step + " status=" + res.status + " error=" + ((b && b.error) || "?") + (country ? " country=" + country : "") + " via=" + device + " " + kind + " " + lang);
      if (b && b.error === "region_unavailable") notifySignupBlocked(roomId || "main", country, device + " " + kind + " " + lang);
    }).catch(() => {
      console.log("[signup-fail] room=" + (roomId || "main") + " step=" + step + " status=" + res.status + " via=" + device + " " + kind + " " + lang);
    });
  } catch {}
}

await loadRoomAliases();

Bun.serve({
  port: PORT,
  idleTimeout: 60,
  async fetch(req, server) {
    const res = await handleRequest(req, server);
    const path = new URL(req.url).pathname;
    logSignupFailure(req, path, res);
    // Private pages (rooms, invites, the app's own screens) must never be
    // listed by search engines, even if a link to one is shared publicly.
    if (NOINDEX_PATH.test(path)) {
      try { res.headers.set("X-Robots-Tag", "noindex, nofollow"); } catch (e) {}
    }
    // Public pages: tell search engines which address is the main one, so
    // /get/, /get?utm=... and the Railway domain all count as nearune.ai/get.
    const publicPath = path.length > 1 ? path.replace(/\/+$/, "") : path;
    if (res.status === 200 && SITEMAP_PATHS.includes(publicPath)) {
      try { res.headers.set("Link", '<' + CANONICAL_ORIGIN + publicPath + '>; rel="canonical"'); } catch (e) {}
    }
    // Google Analytics only on the download pages ads point to — never inside
    // rooms or the app (which loads nearune.ai), so answers are never seen.
    if (res.status === 200 && ANALYTICS_PATHS.includes(publicPath)) {
      try {
        const html = await res.text();
        const headers = new Headers(res.headers);
        return new Response(html.replace(/<head>/i, "<head>" + GOOGLE_TAG), { status: 200, headers });
      } catch (e) {}
    }
    return res;
  },
});

// Never Have I Ever pool for a room. Make-a-friend matches just met, so
// they get the new-friends pool (no shared past, nothing romantic) even
// if the room was made before the match code saved relationship on it.
function roomRelationship(s: any): any {
  if (s.origin === "friend") return "friend_match";
  return s.relationship;
}

const NOINDEX_PATH = /^\/(r|j)\/|^\/(home|new|recover)\/?$|^\/api\/|^\/admin/;
// Public pages listed for search engines.
const CANONICAL_ORIGIN = "https://nearune.ai";
const ANALYTICS_PATHS = ["/get", "/military"];
const GOOGLE_TAG = '<script async src="https://www.googletagmanager.com/gtag/js?id=G-C8J788WTJR"></script>' +
  "<script>window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', 'G-C8J788WTJR');</script>";
const SITEMAP_PATHS = ["/get","/military", "/support", "/privacy", "/terms", "/child-safety"];

async function handleRequest(req: Request, server: any): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/robots.txt") {
      const origin0 = ((req.headers.get("x-forwarded-proto") || "").split(",")[0].trim() || url.protocol.replace(":", "")) + "://" + url.host;
      const body = [
        "User-agent: *",
        // Rooms, invites and app screens are kept out of search with a
        // noindex header instead of a Disallow line: a crawler has to load a
        // page to see its noindex, and link-preview bots (WhatsApp, iMessage)
        // must still be able to read invite pages.
        "Disallow: /api/",
        "Disallow: /admin",
        "Allow: /",
        "",
        "Sitemap: " + origin0 + "/sitemap.xml",
        "",
      ].join("\n");
      return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
    }
    if (req.method === "GET" && url.pathname === "/sitemap.xml") {
      const origin0 = ((req.headers.get("x-forwarded-proto") || "").split(",")[0].trim() || url.protocol.replace(":", "")) + "://" + url.host;
      const body = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        SITEMAP_PATHS.map((p) => "  <url><loc>" + origin0 + p + "</loc></url>").join("\n") + "\n</urlset>\n";
      return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
    }
    // Behind Railway's proxy req.url is plain http; links we hand out (invite,
    // confirm, etc.) must use the public https origin instead.
    const fwdProto = (req.headers.get("x-forwarded-proto") || "").split(",")[0].trim();
    const publicOrigin = fwdProto ? fwdProto + "://" + url.host : url.origin;
    const { roomId, restPath } = parseRoom(url.pathname);

    // Short invite links: /j/<room>/<token> redirects to the full
    // /r/<room>/?invite=<who>&token=<token> form the app already understands.
    const shortInvite = url.pathname.match(/^\/j\/([a-zA-Z0-9]{1,40})\/([a-zA-Z0-9-]{6,64})\/?$/);
    if (req.method === "GET" && shortInvite) {
      const [, sRoom, sToken] = shortInvite;
      if (!(await roomExists(sRoom))) return new Response(null, { status: 302, headers: { location: "/new?notfound=1" } });
      const sState = await loadState(sRoom);
      let sWho = "";
      for (const k of ["mark", "nikita"] as const) {
        if (sState.pendingInvite && sState.pendingInvite[k] && sState.pendingInvite[k]!.token === sToken && inviteLive(sState.pendingInvite[k]!)) sWho = k;
      }
      const dest = "/r/" + sRoom + "/" + (sWho ? "?invite=" + sWho + "&token=" + sToken : "");
      try {
        const jUa = req.headers.get("user-agent") || "";
        const bot = previewBotName(jUa);
        if (bot) notifyInviteEvent(sRoom, "preview", sState, bot);
        else notifyInviteEvent(sRoom, "opened", sState, inviteDevice(jUa) + (sWho ? "" : ", link had expired"));
      } catch {}
      // The inviter's first name is shown on the landing page and in the link
      // preview ("Mark invited you to Nearune").
      const sOther = sWho === "mark" ? "nikita" : "mark";
      const sInviter = sState.people && sState.people[sOther] && sState.people[sOther]!.confirmed ? sState.people[sOther]!.name : "";
      // A peek at the room: the inviter's city and clock, today's question,
      // and whether they've already answered it.
      const sInv = sWho ? sState.pendingInvite![sWho as PersonKey]! : null;
      const sToday = todayKeyFor(sState);
      const sP = sState.people && sState.people[sOther];
      const sAnswered = !!(sState.answers && sState.answers[sToday] && (sState.answers[sToday] as any)[sOther]);
      const preview = sInv && sInv.q && sP && sP.confirmed
        ? { question: sInv.q, isToday: sInv.qKey === sToday, city: effectiveLocation(sP as any, sToday) || "", tz: sP.tz || "", answered: sAnswered && sInv.qKey === sToday }
        : null;
      return new Response(buildInvitePage({ origin: publicOrigin, inviter: sInviter, roomId: sRoom, dest, preview }), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }
    const roomPrefix = roomId ? "/r/" + roomId : "";
    const HOUR = 60 * 60 * 1000;

    // Deferred invite: someone opens an invite link in Safari, taps the App
    // Store badge, installs Nearune, then opens the app — which starts on the
    // home screen with no idea which room they were invited to. When the badge
    // is tapped we hold the invite for 48 hours against the visitor's network
    // address (memory only, never saved), and a brand-new install on the same
    // network asks once for it and goes straight to the invite.
    if (req.method === "POST" && url.pathname === "/api/deferred-invite") {
      if (!rateLimit("deferred-set:" + clientIp(req, server), 20, HOUR)) return json({ ok: false }, { status: 429 });
      const db = await readJson(req);
      const dest = typeof db?.dest === "string" ? db.dest : "";
      // an invite still to accept, or (after joining in the browser) the room itself with who they are in it
      if (!/^\/r\/[a-z0-9]{1,40}\/\?invite=(mark|nikita)&token=[a-zA-Z0-9-]{6,64}$/.test(dest) && !/^\/r\/[a-z0-9]{1,40}\/\?viewer=(mark|nikita)$/.test(dest)) return json({ ok: false }, { status: 400 });
      deferredInvites.set(deferredKey(clientIp(req, server)), { dest, at: Date.now() });
      saveDeferredSoon();
      return json({ ok: true });
    }
    if (req.method === "GET" && url.pathname === "/api/deferred-invite") {
      const dk = deferredKey(clientIp(req, server));
      const hit = deferredInvites.get(dk);
      if (hit && Date.now() - hit.at < 48 * HOUR) { deferredInvites.delete(dk); saveDeferredSoon(); return json({ dest: hit.dest }); }
      return json({ dest: null });
    }

    // Typing a room code on the Join screen: if that room is waiting for a
    // partner, go straight to its invite (name, city, language); otherwise
    // just open the room. A made-up code goes back with "not found".
    if (req.method === "GET" && url.pathname === "/api/join-code") {
      if (!rateLimit("join-code:" + clientIp(req, server), 30, HOUR)) return json({ error: "rate_limited" }, { status: 429 });
      const jc = (url.searchParams.get("code") || "").trim().toLowerCase();
      if (!/^[a-z0-9]{4,40}$/.test(jc) || !(await roomExists(jc))) return json({ dest: "/new?notfound=1" });
      const jst = await loadState(jc);
      if (jst.origin !== "friend") {
        for (const k of ["mark", "nikita"] as const) {
          const inv = jst.pendingInvite && jst.pendingInvite[k];
          if (inv && inv.token && inviteLive(inv) && !(jst.people && jst.people[k] && jst.people[k]!.confirmed)) return json({ dest: "/j/" + jc + "/" + inv.token });
        }
      }
      return json({ dest: "/r/" + jc + "/" });
    }

    if (req.method === "GET" && url.pathname === "/api/music-preview") {
      if (!rateLimit("music-preview:" + clientIp(req, server), 120, HOUR)) return json({ error: "rate_limited" }, { status: 429 });
      const clip = await previewClip(url.searchParams.get("t") || "", url.searchParams.get("a") || "", { id: url.searchParams.get("i") || "", cc: url.searchParams.get("c") || "" });
      if (!clip) return json({ error: "no_preview" }, { status: 404 });
      return new Response(clip.bytes, { headers: { "content-type": clip.type, "cache-control": "public, max-age=3600", "accept-ranges": "none" } });
    }

    // Approximate city from the visitor's internet connection, used only to
    // fill in the sign-up form's city box ahead of time (they can change it).
    // Nothing is stored. Looked up with ipapi.co; any failure returns empty.
    if (req.method === "GET" && url.pathname === "/api/ip-city") {
      if (!rateLimit("ip-city:" + clientIp(req, server), 20, HOUR)) return json({ label: "" });
      return json({ label: await approxCity(clientIp(req, server)) });
    }

    if (req.method === "POST" && url.pathname === "/api/create-room") {
      // Caps how many fresh rooms one visitor can spin up — a real couple
      // needs one, ever.
      if (!rateLimit("create-room:" + clientIp(req, server), 5, HOUR)) {
        return json({ error: "rate_limited" }, { status: 429 });
      }
      // Guardrails: a manual kill switch (REGISTRATIONS_PAUSED=1) and a daily
      // cap (REGISTRATION_DAILY_CAP, default 50 new rooms per Pacific day).
      // Only creating a NEW room is gated — existing rooms and invited
      // partners joining them are never blocked.
      const waitMsg = "Nearune is getting a lot of love today, and we're working to catch up before welcoming more new rooms. Please check back tomorrow — we'd love to have you!";
      if (Bun.env.REGISTRATIONS_PAUSED === "1" || Bun.env.REGISTRATIONS_PAUSED === "true") {
        return json({ error: "registrations_paused", message: waitMsg }, { status: 503 });
      }
      const cap = parseInt(Bun.env.REGISTRATION_DAILY_CAP || "50", 10) || 50;
      if ((await roomsCreatedToday()) >= cap) {
        return json({ error: "registrations_paused", message: waitMsg }, { status: 503 });
      }
      // Optional room name from the first partner ("Our Sky" -> oursky, or oursky47 if taken).
      // Screened like any other user text; only an explicit block refuses it.
      const reqBody = await readJson(req);
      const rawName = typeof reqBody?.name === "string" ? reqBody.name.trim().slice(0, 40) : "";
      let useName = "";
      if (rawName) {
        const verdict = await moderateContent({ text: rawName });
        console.log("[room-name] \"" + rawName + "\" screening=" + verdict);
        if (verdict === "blocked") return json({ error: "inappropriate_name" }, { status: 400 });
        // Only an explicit BLOCK refuses the name. If screening is down or gave
        // no clear answer, still honor the name — it only becomes this room's
        // own link, so a failed check shouldn't silently swap in random words.
        useName = rawName;
      }
      // Coarse hint about who made the room (no IP stored): device, app vs web,
      // browser language. Lets the admin tell a real visitor from a test.
      const ua = req.headers.get("user-agent") || "";
      const device = /iPad/i.test(ua) ? "iPad" : /iPhone|iPod/i.test(ua) ? "iPhone" : /Android/i.test(ua) ? "Android" : /Windows/i.test(ua) ? "Windows" : /Macintosh|Mac OS X/i.test(ua) ? "Mac" : /Linux/i.test(ua) ? "Linux" : "other";
      // The Android app runs in Android's WebView, whose user agent also says Chrome and Safari but adds "; wv)" — that
    // marked every Android app user as "Android web". (Facebook and Instagram's own browsers are WebViews too: still web.)
    const kind = /; ?wv\)/.test(ua) && !/Instagram|FBAN|FBAV|FB_IAB|WhatsApp|Line\//i.test(ua) ? "app" : /Safari\//.test(ua) || /Chrome\//.test(ua) || /Firefox\//.test(ua) ? "web" : "app";
      const lang = (req.headers.get("accept-language") || "").split(",")[0].trim().slice(0, 12) || "?";
      const via = device + " " + kind + " " + lang;
      const id = await createRoom(useName, via, useName || undefined);
      // Not counted as a room yet: it only becomes one (gets a number, shows
      // on the admin page, counts toward the daily cap) once someone signs
      // up in it. Abandoned ones are removed after 24 hours.
      console.log("[room-created] " + id + " via " + via + " (waiting for sign-up)");
      return json({ roomId: id });
    }

    // "My rooms": the opening page. The room list lives on the device itself.
    if (req.method === "GET" && url.pathname === "/home") {
      return new Response(buildHomePage(), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }

    // Make a friend: anonymous matching with the next person who taps it.
    if (req.method === "POST" && url.pathname === "/api/friend/join") {
      if (!rateLimit("friend-join:" + clientIp(req, server), 8, HOUR)) return json({ error: "rate_limited" }, { status: 429 });
      const fb = await readJson(req);
      const device = typeof fb?.device === "string" ? fb.device : "";
      if (!/^[A-Za-z0-9]{16,64}$/.test(device)) return json({ error: "invalid" }, { status: 400 });
      if (fb?.adult !== true) return json({ error: "adult_required" }, { status: 400 });
      if (Bun.env.REGISTRATIONS_PAUSED === "1" || Bun.env.REGISTRATIONS_PAUSED === "true") {
        return json({ error: "registrations_paused" }, { status: 503 });
      }
      // Name, city and language (from the Make a friend sheet) so the room is
      // created with this person already signed up.
      let profile: FriendProfile | undefined;
      const fp = fb?.profile;
      if (fp && typeof fp === "object") {
        const pName = typeof fp.name === "string" ? fp.name.trim().slice(0, 80) : "";
        const pLoc = typeof fp.location === "string" ? fp.location.trim().slice(0, 80) : "";
        const pLang = typeof fp.language === "string" ? fp.language.trim().slice(0, 40) : "";
        const pTz = typeof fp.tz === "string" ? fp.tz.trim().slice(0, 60) : "";
        if (!pName || !pLoc || !pLang) return json({ error: "profile_required" }, { status: 400 });
        const pBlocked = await isBlockedLocation(pLoc);
        if (pBlocked) return json({ error: "region_unavailable", country: pBlocked }, { status: 403 });
        if (!(await isCityLevelLocation(pLoc))) return json({ error: "city_required" }, { status: 400 });
        const resolvedTz = await resolveTimezoneFromLocation(pLoc);
        profile = { name: pName, location: pLoc, language: pLang, ...((resolvedTz || pTz) ? { tz: resolvedTz || pTz } : {}) };
      }
      const fr = await friendJoin(device, profile);
      console.log("[friend] join status=" + fr.status + (fr.status === "matched" ? " room=" + fr.roomId + " signedUp=" + fr.signedUp : "") + (profile ? " withProfile" : ""));
      return json(fr);
    }
    // In-app tip completed (Apple handles the payment; this is only a log line
    // so tips show up in the server logs). No personal data.
    // Anonymous new-user funnel step (random device ID + step name only).
    if (req.method === "POST" && url.pathname === "/api/journey") {
      if (!rateLimit("funnel:" + clientIp(req, server), 400, HOUR)) return json({ ok: true });
      const fb2 = await readJson(req);
      if (fb2 && (fb2.step === "lp_view" || fb2.step === "lp_tap" || fb2.step === "lp_play")) {
        const lpPage = fb2.page === "military" ? "military" : fb2.page === "get" ? "get" : fb2.page === "get (new)" ? "get (new)" : "";
        const lpSrc = typeof fb2.source === "string" ? fb2.source.toLowerCase().replace(/[^a-z0-9 ._()-]/g, "").slice(0, 40) || "direct" : "direct";
        if (lpPage) await recordLanding(lpPage, lpSrc, fb2.step === "lp_view" ? "view" : fb2.step === "lp_play" ? "play" : "tap");
        return json({ ok: true });
      }
      if (fb2 && fb2.step === "time" && isValidFunnelDevice(fb2.device)) {
        const secs = Math.max(0, Math.min(600, Math.round(Number(fb2.seconds) || 0)));
        if (secs > 0) await recordTime(fb2.device, secs, fb2.platform === "app" ? "app" : "web");
        return json({ ok: true });
      }
      if (fb2 && isValidFunnelDevice(fb2.device) && isFunnelStep(fb2.step)) {
        await recordFunnel(fb2.device, fb2.step, fb2.platform === "app" ? "app" : "web", fb2.existing === true);
      }
      return json({ ok: true });
    }
    // Which button the invited person tapped on the invite page (see notifyInviteEvent).
    if (req.method === "POST" && url.pathname === "/api/invite-event") {
      if (!rateLimit("invite-event:" + clientIp(req, server), 60, HOUR)) return json({ ok: true });
      const ie = await readJson(req);
      const ieRoom = typeof ie?.room === "string" && /^[a-zA-Z0-9]{1,40}$/.test(ie.room) ? ie.room : "";
      const ieStep = ie?.step === "store" || ie?.step === "accept" || ie?.step === "web" ? ie.step : "";
      if (ieRoom && ieStep && (await roomExists(ieRoom))) {
        const ieState = await loadState(ieRoom);
        notifyInviteEvent(ieRoom, ieStep, ieState, inviteDevice(req.headers.get("user-agent") || ""));
      }
      return json({ ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/tip-log") {
      if (!rateLimit("tip-log:" + clientIp(req, server), 20, HOUR)) return json({ ok: true });
      const tb = await readJson(req);
      const product = typeof tb?.product === "string" ? tb.product.replace(/[^a-z0-9._]/gi, "").slice(0, 60) : "";
      console.log("[tip] in-app tip " + (product || "unknown"));
      return json({ ok: true });
    }
    if (req.method === "GET" && url.pathname === "/api/friend/status") {
      if (!rateLimit("friend-status:" + clientIp(req, server), 900, HOUR)) return json({ error: "rate_limited" }, { status: 429 });
      const t = url.searchParams.get("ticket") || "";
      if (!/^[a-f0-9]{24}$/.test(t)) return json({ status: "none" });
      return json(await friendStatus(t));
    }
    if (req.method === "POST" && url.pathname === "/api/friend/push") {
      if (!rateLimit("friend-push:" + clientIp(req, server), 30, HOUR)) return json({ error: "rate_limited" }, { status: 429 });
      const pb = await readJson(req);
      const t = typeof pb?.ticket === "string" ? pb.ticket : "";
      const sub = pb?.subscription;
      const kind = sub && (sub.kind === "fcm" ? "fcm" : sub.kind === "apns" ? "apns" : "");
      if (!/^[a-f0-9]{24}$/.test(t) || !kind || typeof sub.token !== "string" || !sub.token || sub.token.length > 4096) return json({ error: "invalid" }, { status: 400 });
      const okp = await friendSetPush(t, { kind: kind as "apns" | "fcm", token: sub.token });
      return json({ ok: okp });
    }
    if (req.method === "POST" && url.pathname === "/api/friend/cancel") {
      const cb = await readJson(req);
      const t = typeof cb?.ticket === "string" ? cb.ticket : "";
      if (/^[a-f0-9]{24}$/.test(t)) await friendCancel(t);
      return json({ ok: true });
    }

    if (req.method === "GET" && url.pathname === "/new") {
      return new Response(buildNewRoomPage(), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }

    if (req.method === "GET" && url.pathname === "/recover") {
      return new Response(buildRecoverPage(), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }

    if (req.method === "POST" && url.pathname === "/api/recover-access") {
      const body = await readJson(req);
      const email = typeof body?.email === "string" ? body.email.trim().slice(0, 200) : "";
      // Always answer the same way whether or not the email matches, so this
      // can't be used to probe which addresses are registered.
      const generic = { ok: true };
      if (!isValidEmail(email)) return json(generic);
      if (!rateLimit("recover-ip:" + clientIp(req, server), 10, HOUR) || !rateLimit("recover-email:" + email.toLowerCase(), 3, HOUR)) {
        return json(generic);
      }
      const entries = await lookupEmailIndex(await hashEmail(email));
      if (entries.length > 0) {
        const links = entries
          .map((e) => publicOrigin + (e.roomId ? "/r/" + e.roomId : ""))
          .filter((v, i, arr) => arr.indexOf(v) === i);
        const list = links.map((l) => "<li><a href=\"" + l + "\">" + l + "</a></li>").join("");
        await sendEmail(
          email,
          "Your Nearune link",
          "<p>Here's your Nearune room:</p><ul>" + list + "</ul>" +
            "<p style=\"color:#888;font-size:0.9em\">Didn't request this? You can ignore this email.</p>"
        );
      }
      return json(generic);
    }

    if (req.method === "GET" && (url.pathname === "/military" || url.pathname === "/military/")) {
      return new Response(buildGetPage("military"), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
      });
    }
    if (req.method === "GET" && (url.pathname === "/get" || url.pathname === "/get/")) {
      return new Response(buildGetPage(), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
      });
    }

    if (req.method === "GET" && url.pathname === "/privacy") {
      return new Response(buildPrivacyPage(), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }

    if (req.method === "GET" && url.pathname === "/support") {
      return new Response(buildSupportPage(), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }

    if (req.method === "GET" && url.pathname === "/terms") {
      return new Response(buildTermsPage(), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }

    if (req.method === "GET" && url.pathname === "/child-safety") {
      return new Response(buildChildSafetyPage(), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }

    if (req.method === "GET" && restPath === "/manifest.json") {
      return new Response(buildManifestJson(roomId), {
        headers: { "content-type": "application/manifest+json", "cache-control": "no-store" },
      });
    }

    if (req.method === "GET" && restPath === "/sw.js") {
      return new Response(buildServiceWorkerJs(), {
        headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store", "service-worker-allowed": "/" },
      });
    }

    if (req.method === "GET" && url.pathname === "/api/push-public-key") {
      return json({ key: vapidPublicKey, configured: pushConfigured });
    }

    if (req.method === "POST" && restPath === "/api/push-subscribe") {
      const body = await readJson(req);
      const who = body && body.who;
      const subscription = body && body.subscription;
      if (!isPerson(who) || !subscription) {
        return json({ error: "invalid" }, { status: 400 });
      }
      if (subscription.kind === "apns" || subscription.kind === "fcm") {
        if (typeof subscription.token !== "string" || !subscription.token) {
          return json({ error: "invalid" }, { status: 400 });
        }
        const nativeKind = subscription.kind === "fcm" ? "fcm" : "apns";
        await saveState(roomId, (s) => {
          if (!s.pushSubs) s.pushSubs = {};
          s.pushSubs[who] = { kind: nativeKind, token: subscription.token };
        });
        return json({ ok: true });
      }
      if (
        typeof subscription.endpoint !== "string" ||
        !subscription.keys ||
        typeof subscription.keys.p256dh !== "string" ||
        typeof subscription.keys.auth !== "string"
      ) {
        return json({ error: "invalid" }, { status: 400 });
      }
      await saveState(roomId, (s) => {
        if (!s.pushSubs) s.pushSubs = {};
        s.pushSubs[who] = { endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } };
      });
      return json({ ok: true });
    }

    if (req.method === "POST" && restPath === "/api/push-unsubscribe") {
      const body = await readJson(req);
      const who = body && body.who;
      if (!isPerson(who)) return json({ error: "invalid" }, { status: 400 });
      await saveState(roomId, (s) => {
        if (s.pushSubs) delete s.pushSubs[who];
      });
      return json({ ok: true });
    }

    // Support tool: change one person's saved location. Needs the x-cron-secret header.
    // Body: { name, from, to } updates every person with that name and current location.
    if (req.method === "POST" && url.pathname === "/api/admin/set-location") {
      const secret = Bun.env.CRON_SECRET;
      if (!secret || (req.headers.get("x-cron-secret") || "") !== secret) return json({ error: "forbidden" }, { status: 403 });
      const b = await readJson(req);
      const nm = String(b?.name || "").trim(), from = String(b?.from || "").trim().toLowerCase(), to = String(b?.to || "").trim().slice(0, 80);
      if (!nm || !from || !to) return json({ error: "invalid" }, { status: 400 });
      const tz = await resolveTimezoneFromLocation(to);
      let changed = 0;
      for (const id of await listRoomIds()) {
        const st = await loadState(id);
        for (const k of ["mark", "nikita"] as PersonKey[]) {
          const p: any = st.people?.[k];
          if (p && String(p.name || "").trim() === nm && String(p.location || "").trim().toLowerCase() === from) {
            await saveState(id, (s) => { const q: any = s.people?.[k]; if (q) { q.location = to; if (tz) q.tz = tz; } });
            changed++;
          }
        }
      }
      return json({ ok: true, changed, tz });
    }

    // Admin tool: skip a room's current Never Have I Ever prompt and start a
    // fresh round from the room's own set (friend matches get the next
    // getting-to-know-you prompt). Same secret as the reminder.
    if (req.method === "POST" && url.pathname === "/api/admin/nhie-refresh") {
      const secret = Bun.env.CRON_SECRET;
      if (!secret || (req.headers.get("x-cron-secret") || "") !== secret) return json({ error: "forbidden" }, { status: 403 });
      const nb = await readJson(req);
      const rid = typeof nb?.roomId === "string" ? nb.roomId : "";
      if (!rid || !(await roomExists(rid))) return json({ error: "invalid" }, { status: 400 });
      const st = await saveState(rid, (s) => { s.nhie = newRound(s.nhie, roomRelationship(s)); });
      console.log("[admin] nhie refreshed room=" + rid + " round=" + (st.nhie && st.nhie.round));
      return json({ ok: true, round: st.nhie && st.nhie.round, text: st.nhie && st.nhie.text });
    }

    // Admin tool: end a room (without erasing it). Same secret as the reminder.
    if (req.method === "POST" && url.pathname === "/api/admin/close") {
      const secret = Bun.env.CRON_SECRET;
      if (!secret || (req.headers.get("x-cron-secret") || "") !== secret) return json({ error: "forbidden" }, { status: 403 });
      const cb = await readJson(req);
      const rid = typeof cb?.roomId === "string" ? cb.roomId : "";
      if (!rid) return json({ error: "invalid" }, { status: 400 });
      await saveState(rid, (s) => { s.closed = true; s.closedBy = "admin"; });
      console.log("[admin] closed room " + rid);
      return json({ ok: true });
    }

    // Admin tool: change a room's display name (title only; the room code and
    // links stay the same). Blank removes the name.
    if (req.method === "POST" && url.pathname === "/api/admin/rename") {
      const secret = Bun.env.CRON_SECRET;
      if (!secret || (req.headers.get("x-cron-secret") || "") !== secret) return json({ error: "forbidden" }, { status: 403 });
      const rb = await readJson(req);
      const rid = typeof rb?.roomId === "string" ? rb.roomId : "";
      const nm = typeof rb?.name === "string" ? rb.name.trim().slice(0, 40) : "";
      const newCode = typeof rb?.code === "string" ? rb.code.trim().toLowerCase() : "";
      if (!rid || !(await roomExists(rid))) return json({ error: "invalid" }, { status: 400 });
      if (newCode) {
        // A friendlier room code. The old code keeps working as the stored id.
        if (!/^[a-z0-9]{4,40}$/.test(newCode)) return json({ error: "bad_code" }, { status: 400 });
        if (!(await addRoomAlias(newCode, rid))) return json({ error: "code_taken" }, { status: 409 });
      }
      await saveState(rid, (s) => { if (nm) s.roomName = nm; else delete s.roomName; if (newCode) s.roomCode = newCode; });
      console.log("[admin] renamed room " + rid + " -> " + (nm || "(no name)") + (newCode ? " code " + newCode : ""));
      return json({ ok: true });
    }

    // Admin tool: correct a person's registered city (and timezone). Body:
    // { roomId, who, location }.
    if (req.method === "POST" && url.pathname === "/api/admin/location") {
      const secret = Bun.env.CRON_SECRET;
      if (!secret || (req.headers.get("x-cron-secret") || "") !== secret) return json({ error: "forbidden" }, { status: 403 });
      const lb = await readJson(req);
      const rid = typeof lb?.roomId === "string" ? lb.roomId : "";
      const who = lb?.who;
      let loc = typeof lb?.location === "string" ? lb.location.trim().slice(0, 80) : "";
      if (!rid || !isPerson(who) || !loc || !(await roomExists(rid))) return json({ error: "invalid" }, { status: 400 });
      if (!(await isCityLevelLocation(loc))) return json({ error: "city_required" }, { status: 400 });
      loc = await canonicalPlaceLabel(loc);
      const tzNew = await resolveTimezoneFromLocation(loc);
      let found = false;
      await saveState(rid, (s) => {
        const p = s.people && s.people[who];
        if (!p) return;
        found = true;
        p.location = loc;
        if (tzNew) p.tz = tzNew;
      });
      if (!found) return json({ error: "no_person" }, { status: 404 });
      console.log("[admin] location room=" + rid + " who=" + who + " -> " + loc + (tzNew ? " (" + tzNew + ")" : ""));
      return json({ ok: true, location: loc });
    }

    // Admin tool: email a "finish registering" reminder to someone whose email
    // sign-up is still unconfirmed. Called by the nearune-admin service with
    // the x-cron-secret header. Body: { roomId, who }.
    // Admin Home "Refresh now": run the stats snapshot on demand.
    if (req.method === "POST" && url.pathname === "/api/admin/stats-refresh") {
      const secret = Bun.env.CRON_SECRET;
      if (!secret || (req.headers.get("x-cron-secret") || "") !== secret) return json({ error: "forbidden" }, { status: 403 });
      // Waits up to 45s (under the 60s idle limit); a slower run keeps going and saves when done.
      const run = refreshStats().then(() => "done", (e: any) => "error: " + String(e?.message || e).slice(0, 120));
      const res = await Promise.race([run, new Promise<string>((r) => setTimeout(() => r("pending"), 45_000))]);
      if (res === "done") return json({ ok: true });
      if (res === "pending") return json({ ok: true, pending: true });
      return json({ error: res }, { status: 500 });
    }

    // Admin Home "Remind" button: one notification to the person who set up
    // the room (the inviter), about sending or re-sending their invite. Same
    // wording as the automatic invite reminders. At most once every 20 hours.
    if (req.method === "POST" && url.pathname === "/api/admin/invite-remind") {
      const secret = Bun.env.CRON_SECRET;
      if (!secret || (req.headers.get("x-cron-secret") || "") !== secret) return json({ error: "forbidden" }, { status: 403 });
      const b = await readJson(req);
      const rid = typeof b?.roomId === "string" ? b.roomId : "";
      if (!rid) return json({ error: "invalid" }, { status: 400 });
      const st: any = await loadState(rid);
      const keys = (["mark", "nikita"] as PersonKey[]).filter((k) => st.people && st.people[k] && st.people[k].confirmed);
      if (st.closed || st.origin === "friend" || keys.length !== 1) return json({ error: "nothing_pending" }, { status: 409 });
      const inviterKey = keys[0];
      const sub = st.pushSubs && st.pushSubs[inviterKey];
      if (!sub) return json({ error: "no_push" }, { status: 409 });
      if (st.adminInviteRemindAt && Date.now() - Date.parse(st.adminInviteRemindAt) < 20 * 60 * 60 * 1000) return json({ error: "too_soon" }, { status: 429 });
      const f = st.funnel || {};
      const sent = !!(f.invite_shared || f.invite_emailed);
      const wA = invitedLabel(st.relationship);
      const title = sent ? cap(wA) + " hasn't seen today's question yet" : "Who do you wish you talked to more?";
      const body = sent
        ? "A quick note from you can help. Tap to send your link again, so you can start answering together."
        : "Your room is ready. Send it to them, and today's question opens for you both.";
      const res = await sendPush(sub, { title, body, tag: "invite-nudge", url: "/r/" + rid + "/?resend=1" } as any);
      console.log("[invite-remind] room=" + rid + " ok=" + res.ok);
      if (res.gone) await saveState(rid, (s) => { if (s.pushSubs) delete s.pushSubs[inviterKey]; });
      if (!res.ok) return json({ error: res.gone ? "no_push" : "send_failed" }, { status: 502 });
      await saveState(rid, (s) => { s.adminInviteRemindAt = new Date().toISOString(); });
      return json({ ok: true });
    }

    if (req.method === "POST" && url.pathname === "/api/admin/remind") {
      const secret = Bun.env.CRON_SECRET;
      if (!secret || (req.headers.get("x-cron-secret") || "") !== secret) return json({ error: "forbidden" }, { status: 403 });
      const b = await readJson(req);
      const rid = typeof b?.roomId === "string" ? b.roomId : "";
      const w = b?.who;
      if (!rid || !isPerson(w)) return json({ error: "invalid" }, { status: 400 });
      const st = await loadState(rid);
      const pp = st.people && st.people[w];
      const pc = st.pendingConfirm && st.pendingConfirm[w];
      if (!pp || pp.emailVerified !== false || !pc) return json({ error: "nothing_pending" }, { status: 409 });
      if (!pc.email) return json({ error: "no_email_kept" }, { status: 409 });
      if ((pc.reminders || 0) >= 3) return json({ error: "max_reminders" }, { status: 429 });
      if (pc.remindedAt && Date.now() - new Date(pc.remindedAt).getTime() < 20 * 60 * 60 * 1000) return json({ error: "too_soon" }, { status: 429 });
      const fwd = req.headers.get("x-forwarded-proto");
      const origin = fwd ? fwd + "://" + url.host : url.origin;
      const rPrefix = rid ? "/r/" + rid : "";
      const link = origin + rPrefix + "/api/confirm?who=" + w + "&token=" + pc.token;
      const [subjR, hiR, bodyR, linkR, footR] = await translateEmailStrings(
        [
          "Finish setting up Nearune",
          "Hi",
          "You started setting up Nearune but haven't confirmed your email yet. It takes one tap:",
          "Confirm your email",
          "Not you, or already done? You can ignore this email.",
        ],
        pp.language
      );
      const rr = await sendEmail(
        pc.email,
        subjR,
        "<p>" + hiR + " " + pp.name + ",</p><p>" + bodyR + "</p>" +
          "<p><a href=\"" + link + "\">" + linkR + "</a></p>" +
          "<p style=\"color:#888;font-size:0.9em\">" + footR + "</p>"
      );
      console.log("[remind] room=" + (rid || "main") + " who=" + w + " ok=" + rr.ok + (rr.ok ? "" : " error=" + rr.error));
      if (rr.ok) {
        await saveState(rid, (s) => {
          const e = s.pendingConfirm && s.pendingConfirm[w];
          if (e) { e.reminders = (e.reminders || 0) + 1; e.remindedAt = new Date().toISOString(); }
        });
      }
      return json({ ok: rr.ok, error: rr.error });
    }

    if (req.method === "POST" && url.pathname === "/api/cron/daily-push") {
      const secret = Bun.env.CRON_SECRET;
      const given = req.headers.get("x-cron-secret") || "";
      if (!secret || given !== secret) return json({ error: "forbidden" }, { status: 403 });
      if (!anyPushConfigured) return json({ ok: true, sent: 0, note: "push not configured" });
      const ids = await listRoomIds();
      let sent = 0;
      for (const id of ids) {
        try {
          const state = await loadState(id);
          if (!state.pushSubs) continue;
          const today = todayKeyFor(state);
          if (state.pushLastMorningKey === today) continue;
          const count = unansweredCount(state, today);
          if (count > 0) {
            for (const who of ["mark", "nikita"] as PersonKey[]) {
              const a = state.answers[today];
              const answered = !!(a && a[who] && a[who]!.text);
              const sub = state.pushSubs[who];
              if (answered || !sub) continue;
              const res = await sendPush(sub, {
                title: "Today's question is up",
                body: "Your Nearune question for today is ready.",
                badge: count,
                tag: "morning",
              });
              if (res.ok) sent++;
              if (res.gone) {
                await saveState(id, (s) => {
                  if (s.pushSubs) delete s.pushSubs[who];
                });
              }
            }
          }
          await saveState(id, (s) => {
            s.pushLastMorningKey = today;
          });
        } catch (err) {
          console.error("[cron-push] room " + id + " failed", err);
        }
      }
      return json({ ok: true, sent });
    }

    // Room visibility and the delete-room action now live in the separate
    // nearune-admin service (admin-app/), which reads this same storage —
    // see that service for the /admin equivalent.

    if (req.method === "GET" && restPath === "/") {
      // A made-up or mistyped room code must not open a blank sign-up screen
      // (registering there would quietly create a stray room).
      if (roomId && !(await roomExists(roomId))) return new Response(null, { status: 302, headers: { location: "/new?notfound=1" } });
      // Date-tag icon URLs so iOS treats each day's icon as a fresh resource.
      const html = buildPageHtml(roomId, todayKeyPT());
      return new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, must-revalidate" },
      });
    }

    if (req.method === "GET" && url.pathname === "/api/qa") {
      // Summary only (counts and check names, no room data).
      return json(lastQaReport() || (await runQa()));
    }

    if (req.method === "GET" && restPath === "/api/state") {
      let state = await loadState(roomId);
      // Existing users: a room with anyone located in (or traveling to) a blocked country is closed.
      try {
        for (const k of ["mark", "nikita"] as PersonKey[]) {
          const p: any = state.people?.[k];
          if (!p) continue;
          if (await isBlockedLocation(String(p.location || "")) || (p.travelLocation && await isBlockedLocation(String(p.travelLocation)))) {
            return json({ error: "region_unavailable" }, { status: 403 });
          }
        }
      } catch {}
      // Self-heal: a person with a saved location but no timezone (the
      // lookup failed at registration) would otherwise show UTC clocks.
      // Resolve it now, at most once every 10 minutes per room.
      try {
        const missing = (["mark", "nikita"] as PersonKey[]).filter((k) => state.people?.[k]?.location && !state.people?.[k]?.tz);
        const last = tzBackfillAt.get(roomId) || 0;
        if (missing.length && Date.now() - last > 10 * 60 * 1000) {
          tzBackfillAt.set(roomId, Date.now());
          const found: Partial<Record<PersonKey, string>> = {};
          for (const k of missing) {
            const tz = await resolveTimezoneFromLocation(state.people![k]!.location!);
            if (tz) found[k] = tz;
          }
          if (Object.keys(found).length) {
            state = await saveState(roomId, (s) => {
              for (const k of Object.keys(found) as PersonKey[]) {
                if (s.people?.[k] && !s.people[k]!.tz) s.people[k]!.tz = found[k];
              }
            });
          }
        }
      } catch (e) { /* never block state on a timezone lookup */ }
      try { roomQaOnce(roomId, state); } catch (e) {}
      const out: any = forClient(state);
      // Never Have I Ever: a viewer may always see their OWN answer (never the partner's).
      try {
        const who = url.searchParams.get("who");
        const mine = (who === "mark" || who === "nikita") ? (state as any).nhie?.votes?.[who] : undefined;
        if (mine && out.nhie) out.nhie.mine = mine;
      } catch {}
      return json(out);
    }

    if (req.method === "POST" && restPath === "/api/delete-room") {
      // No password auth exists in this app — possessing the room link is
      // already the same trust level everything else here relies on, so
      // that's the bar for this too. Removes both people from the recovery
      // index (if they registered one), then wipes the room's data entirely.
      const cur = await loadState(roomId);
      if (cur.people) {
        for (const key of Object.keys(cur.people) as PersonKey[]) {
          const hash = cur.people[key]?.emailHash;
          if (hash) removeFromEmailIndex(hash, roomId, key).catch(() => {});
        }
      }
      await deleteRoom(roomId);
      return json({ ok: true });
    }

    if (req.method === "POST" && restPath === "/api/answer") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const { date, who, text } = body || {};
      if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !isPerson(who) || typeof text !== "string" || !text.trim()) {
        return json({ error: "invalid" }, { status: 400 });
      }
      const trimmed = text.trim().slice(0, 4000);
      const blockedA = await moderate(roomId, who, "answer", trimmed, body.confirmFlagged === true);
      if (blockedA) return blockedA;
      const state = await saveState(roomId, (s) => {
        if (!s.answers[date]) s.answers[date] = {};
        const prev = s.answers[date][who];
        s.answers[date][who] = {
          text: trimmed,
          at: prev?.at || new Date().toISOString(),
          ...(prev ? { editedAt: new Date().toISOString() } : {}),
        };
      });
      // Nudge whoever hasn't answered yet, and sync badges to the shared
      // "how many of you two still need to answer today" count (0/1/2) —
      // both people's badges always show the same number. Fire-and-forget —
      // a slow or failed push shouldn't delay the answer response, and a
      // dead subscription is cleaned up in the background rather than
      // blocking this request.
      if (anyPushConfigured && state.pushSubs) {
        const count = unansweredCount(state, date);
        if (count > 0) {
          const answererName = state.people?.[who]?.name || "Your partner";
          for (const other of (["mark", "nikita"] as PersonKey[]).filter((k) => k !== who)) {
            const a = state.answers[date];
            const answered = !!(a && a[other] && a[other]!.text);
            const sub = state.pushSubs[other];
            if (answered || !sub) continue;
            sendPush(sub, {
              title: answererName + " answered today's question",
              body: "Your turn on Nearune.",
              badge: count,
              tag: "partner-answered",
            })
              .then((res) => {
                if (res.gone) {
                  saveState(roomId, (s) => {
                    if (s.pushSubs) delete s.pushSubs[other];
                  }).catch(() => {});
                }
              })
              .catch(() => {});
          }
          // The answerer's own native badge still shows the pre-answer
          // count — a real alert push only went to whoever hasn't answered
          // yet, and native has no client-side badge API to update it
          // locally otherwise. Won't show as a visible banner in practice:
          // this fires immediately after the person's own answer request
          // completes, so their app is in the foreground, and the app has
          // no `presentationOptions` configured, which means iOS presents
          // nothing for a foregrounded notification — only the badge
          // updates. Only needed for APNs; web subs sync locally via the
          // poll loop.
          const ownSub = state.pushSubs[who];
          if (ownSub && ownSub.kind === "apns") {
            // Same words as the line under their answer in the room.
            const otherKey = (["mark", "nikita"] as PersonKey[]).find((k) => k !== who)!;
            const otherName = state.people?.[otherKey]?.name;
            sendPush(ownSub, {
              title: "Answer saved",
              body: otherName ? "Sent — waiting for " + otherName + " to answer too." : "Sent — they'll see it when they join.",
              badge: count,
              tag: "own-answered",
            })
              .then((res) => {
                if (res.gone) {
                  saveState(roomId, (s) => {
                    if (s.pushSubs) delete s.pushSubs[who];
                  }).catch(() => {});
                }
              })
              .catch(() => {});
          }
        } else {
          // Both answers are in — clear both native badges to 0. Native has
          // no client-side badge API (no navigator.setAppBadge in
          // Capacitor's WebView), so a push is the only way to update it —
          // but a silent (content-available) push is low-priority and iOS
          // can throttle its delivery for an unpredictable amount of time,
          // which isn't good enough for "the badge should clear now". A
          // real alert push is delivered immediately, so this sends one to
          // both people, collapsed under one tag so re-editing an answer
          // afterward doesn't pile up repeat notifications. Web
          // subscriptions already sync their own badge client-side, so this
          // only targets APNs.
          for (const person of ["mark", "nikita"] as PersonKey[]) {
            const sub = state.pushSubs[person];
            if (!sub || (sub.kind !== "apns" && sub.kind !== "fcm")) continue;
            const solo = isSoloRoom(state);
            sendPush(sub, {
              title: solo ? "Answer saved" : "You're all caught up",
              body: solo ? "Invite someone on Nearune to see their answer too." : "Both answers are in for today on Nearune.",
              badge: 0,
              tag: "day-complete",
            })
              .then((res) => {
                if (res.gone) {
                  saveState(roomId, (s) => {
                    if (s.pushSubs) delete s.pushSubs[person];
                  }).catch(() => {});
                }
              })
              .catch(() => {});
          }
        }
      }
      recordRoomUse(roomId, "answer");
      return json(forClient(state));
    }

    // "Make a friend" rooms are joined only through the invite token the
    // matcher issued: no open registration, and no inviting third parties.
    if (req.method === "POST" && (restPath === "/api/register" || restPath === "/api/invite")) {
      if ((await loadState(roomId)).origin === "friend") return json({ error: "not_allowed" }, { status: 403 });
    }

    // Leave a "Make a friend" room, optionally reporting the other person.
    // Ends the room for both, and those two devices are never paired again.
    if (req.method === "POST" && restPath === "/api/leave-friend") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const who = body.who;
      if (!isPerson(who)) return json({ error: "invalid" }, { status: 400 });
      const cur = await loadState(roomId);
      if (cur.origin !== "friend") return json({ error: "not_friend_room" }, { status: 400 });
      const wasClosed = !!cur.closed;
      const report = body.report === true;
      const about: PersonKey = who === "mark" ? "nikita" : "mark";
      const note = typeof body.note === "string" ? body.note.slice(0, 300) : undefined;
      const state = await saveState(roomId, (s) => {
        s.closed = true;
        if (!s.closedBy) s.closedBy = who;
        if (report) s.reported = true;
        if (!s.reports) s.reports = [];
        s.reports.push({ by: who, about, kind: report ? "friend-report" : "friend-leave", note, at: new Date().toISOString() });
        if (s.reports.length > 50) s.reports = s.reports.slice(-50);
      });
      await friendBlock(cur.friendDevices && cur.friendDevices.mark, cur.friendDevices && cur.friendDevices.nikita);
      // A plain leave (not a report) before the other person answered anything:
      // they did nothing wrong, so they go back to the front of the line.
      if (!report && !wasClosed) {
        const stayerAnswered = Object.values((cur as any).answers || {}).some((day: any) => day && day[about]);
        const sp: any = cur.people && (cur.people as any)[about];
        if (!stayerAnswered) {
          await friendRequeue(cur.friendDevices && (cur.friendDevices as any)[about],
            sp && sp.name && sp.location ? { name: sp.name, location: sp.location, language: sp.language || "English", ...(sp.tz ? { tz: sp.tz } : {}) } : undefined);
          console.log("[friend-leave] room=" + roomId + " other person requeued at front");
        }
      }
      console.log("[friend-leave] room=" + roomId + " by=" + who + " report=" + report + (note ? " note=" + JSON.stringify(note) : ""));
      return json(forClient(state));
    }

    // Report objectionable content from your partner (photo, answer,
    // comment, puzzle, …). Logged for the app owner — visible in the server
    // logs and stored (not sent to browsers) on the room.
    if (req.method === "POST" && restPath === "/api/report") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const { who, kind, note } = body || {};
      if (!isPerson(who) || typeof kind !== "string") return json({ error: "invalid" }, { status: 400 });
      const about: PersonKey = who === "mark" ? "nikita" : "mark";
      const cleanKind = kind.slice(0, 30);
      const cleanNote = typeof note === "string" ? note.slice(0, 300) : undefined;
      const state = await saveState(roomId, (s) => {
        if (!s.reports) s.reports = [];
        s.reports.push({ by: who, about, kind: cleanKind, note: cleanNote, at: new Date().toISOString() });
        if (s.reports.length > 50) s.reports = s.reports.slice(-50);
      });
      console.log("[report] room=" + (roomId || "legacy") + " by=" + who + " about=" + about + " kind=" + cleanKind + (cleanNote ? " note=" + JSON.stringify(cleanNote) : ""));
      return json(forClient(state));
    }

    // Block / unblock your partner: hides their photo, answers, comments and
    // puzzle from YOUR screen only.
    if (req.method === "POST" && restPath === "/api/block") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const { who, blocked } = body || {};
      if (!isPerson(who) || typeof blocked !== "boolean") return json({ error: "invalid" }, { status: 400 });
      const state = await saveState(roomId, (s) => {
        if (!s.blocked) s.blocked = {};
        if (blocked) s.blocked[who] = true; else delete s.blocked[who];
      });
      return json(forClient(state));
    }

    if (req.method === "POST" && restPath === "/api/comment") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const { date, who, text } = body || {};
      if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !isPerson(who) || typeof text !== "string" || !text.trim()) {
        return json({ error: "invalid" }, { status: 400 });
      }
      const trimmed = text.trim().slice(0, 300);
      const blockedC = await moderate(roomId, who, "comment", trimmed, body.confirmFlagged === true);
      if (blockedC) return blockedC;
      const state = await saveState(roomId, (s) => {
        if (!s.comments[date]) s.comments[date] = [];
        s.comments[date].push({ who, text: trimmed, at: new Date().toISOString() });
      });
      return json(forClient(state));
    }

    if (req.method === "GET" && restPath === "/api/geo") {
      const location = url.searchParams.get("location") || "";
      const info = await resolveLocationInfo(location);
      const city = await isCityLevelLocation(location);
      let places = await searchPlaces(location);
      let suggested = false;
      // Nothing matches as typed (a misspelling): offer the places for the corrected spelling.
      if (!places.length && info.corrected) { places = await searchPlaces(info.corrected); suggested = places.length > 0; }
      return json({ ...info, city, places, suggested });
    }

    // "Use my current location": turns browser coordinates into a "City, Region, Country" label.
    // Coordinates are rounded to about a kilometre and not stored.
    if (req.method === "GET" && restPath === "/api/reverse-geo") {
      if (!rateLimit("reverse-geo:" + clientIp(req, server), 20, 60 * 60 * 1000)) return json({ error: "rate_limited" }, { status: 429 });
      const lat = Number(url.searchParams.get("lat")), lon = Number(url.searchParams.get("lon"));
      if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return json({ error: "invalid" }, { status: 400 });
      try {
        const r = await fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=en&lat=" + lat.toFixed(2) + "&lon=" + lon.toFixed(2), { headers: { "user-agent": "Nearune/1.0 (https://nearune.ai)" } });
        if (!r.ok) return json({ label: null });
        const d: any = await r.json();
        const a = d?.address || {};
        const city = a.city || a.town || a.village || a.municipality || a.hamlet || a.suburb || "";
        if (!city) return json({ label: null });
        {
          const cc3 = String(a.country_code || "").toUpperCase();
          const st = a.state || a.region || "";
          return json({ label: [city, regionAbbr(cc3, st), cc3 || a.country || ""].filter(Boolean).join(", ") });
        }
      } catch { return json({ label: null }); }
    }

    // SANDBOX EXPERIMENT: current weather at the OTHER person's registered
    // location — used to tint the app's background. `who` is the person
    // asking, so this looks up their partner.
    // Both people's weather in one call — the client picks which one to
    // display (its own partner's, by default, or the previewed person's
    // partner's, in the click-to-preview experiment), which needs no extra
    // round trip this way since currentWeather() is cached per location
    // server-side regardless.
    if (req.method === "GET" && restPath === "/api/weather") {
      const state = await loadState(roomId);
      const today = todayKeyFor(state);
      const [markWeather, nikitaWeather] = await Promise.all([
        currentWeather(effectiveLocation(state.people?.mark, today)),
        currentWeather(effectiveLocation(state.people?.nikita, today)),
      ]);
      return json({ weather: { mark: markWeather, nikita: nikitaWeather } });
    }

    // SANDBOX EXPERIMENT: top local news story (biased toward genuinely
    // odd/funny real stories — see localnews.ts) at each person's
    // effective location (their travel city if they've set one and it
    // hasn't expired, their registered home city otherwise — see
    // util.ts's effectiveLocation) — same shape and caching approach as
    // /api/weather above, no API key required.
    if (req.method === "GET" && restPath === "/api/news") {
      const state = await loadState(roomId);
      const today = todayKeyFor(state);
      const [markNews, nikitaNews] = await Promise.all([
        topLocalStory(effectiveLocation(state.people?.mark, today)),
        topLocalStory(effectiveLocation(state.people?.nikita, today)),
      ]);
      return json({ news: { mark: markNews, nikita: nikitaNews } });
    }

    // Top songs chart (see music.ts) at each person's effective location —
    // same shape/caching approach as /api/weather and /api/news above, no
    // API key required. Country-level, not city-level (see music.ts for
    // why) — `limit` lets the client ask for the full top-5 at once rather
    // than needing a second round trip when someone expands the list.
    if (req.method === "GET" && restPath === "/api/music") {
      const state = await loadState(roomId);
      const today = todayKeyFor(state);
      const [markMusic, nikitaMusic] = await Promise.all([
        topSongs(effectiveLocation(state.people?.mark, today), 5),
        topSongs(effectiveLocation(state.people?.nikita, today), 5),
      ]);
      return json({ music: { mark: markMusic, nikita: nikitaMusic } });
    }

    // Top movies chart (see movies.ts) — same shape as /api/music above.
    if (req.method === "GET" && restPath === "/api/movies") {
      const state = await loadState(roomId);
      const today = todayKeyFor(state);
      const [markMovies, nikitaMovies] = await Promise.all([
        topMovies(effectiveLocation(state.people?.mark, today), 5),
        topMovies(effectiveLocation(state.people?.nikita, today), 5),
      ]);
      return json({ movies: { mark: markMovies, nikita: nikitaMovies } });
    }

    // Sets or clears a traveling override of where THIS person is shown as
    // being, for their partner's weather/local-lore widgets AND clock (see
    // types.ts's travel* fields and util.ts's effectiveLocation/
    // effectiveTz/isTraveling) — their real registered location/timezone,
    // the daily question rollover, and everything else are untouched. An
    // empty location clears it outright, back to home. `from`/`until` are
    // optional date keys (YYYY-MM-DD): `from` schedules travel ahead of
    // time instead of starting it immediately, and `showEarly` (only
    // meaningful with a future `from`) opts into the override appearing
    // TRAVEL_EARLY_DAYS days before `from` rather than exactly on it, so
    // the partner gets a few days' heads-up. Leaving out `until` means it
    // stays set until explicitly cleared.
    if (req.method === "POST" && restPath === "/api/travel") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const { who } = body || {};
      if (!isPerson(who)) return json({ error: "invalid" }, { status: 400 });
      let location = typeof body?.location === "string" ? body.location.trim().slice(0, 80) : "";
      const locBlocked = location ? await isBlockedLocation(location) : "";
      if (locBlocked) return json({ error: "region_unavailable", country: locBlocked }, { status: 403 });
      if (location && !(await isCityLevelLocation(location))) return json({ error: "city_required" }, { status: 400 });
      if (location) location = await canonicalPlaceLabel(location);
      const asDateKey = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : "");
      const from = asDateKey(body?.from);
      const until = asDateKey(body?.until);
      const showEarly = !!body?.showEarly;
      const travelLanguage = typeof body?.language === "string" ? body.language.trim().slice(0, 40) : "";
      // Resolved up front (needs a network call) rather than inside
      // saveState's mutator, which must stay synchronous — same geocoding
      // lookup registration uses (see geo.ts), so a travel city gets a
      // real timezone for the clock without anyone typing one by hand.
      const travelTz = location ? await resolveTimezoneFromLocation(location) : null;
      const state = await saveState(roomId, (s) => {
        if (!s.people || !s.people[who]) return;
        if (!location) {
          delete s.people[who]!.travelLocation;
          delete s.people[who]!.travelTz;
          delete s.people[who]!.travelFrom;
          delete s.people[who]!.travelUntil;
          delete s.people[who]!.travelShowEarly;
          delete s.people[who]!.travelLanguage;
          return;
        }
        s.people[who]!.travelLocation = location;
        if (travelTz) s.people[who]!.travelTz = travelTz;
        else delete s.people[who]!.travelTz;
        if (from) s.people[who]!.travelFrom = from;
        else delete s.people[who]!.travelFrom;
        if (until) s.people[who]!.travelUntil = until;
        else delete s.people[who]!.travelUntil;
        if (from && showEarly) s.people[who]!.travelShowEarly = true;
        else delete s.people[who]!.travelShowEarly;
        if (travelLanguage && travelLanguage !== s.people[who]!.language) s.people[who]!.travelLanguage = travelLanguage;
        else delete s.people[who]!.travelLanguage;
      });
      return json(forClient(state));
    }

    // Turn military (24-hour) time on or off for this person's clock.
    if (req.method === "POST" && restPath === "/api/military") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const who = body.who;
      if (!isPerson(who)) return json({ error: "invalid" }, { status: 400 });
      const on = body.on === true;
      const state = await saveState(roomId, (s) => {
        if (!s.people || !s.people[who]) return;
        if (on) s.people[who]!.military = true;
        else delete s.people[who]!.military;
      });
      return json(forClient(state));
    }

    // A section of the room page failed to draw on someone's device. The page
    // skips that section and keeps going; this just writes the error to the
    // log so it can be fixed. No personal data, capped length.
    if (req.method === "POST" && restPath === "/api/client-error") {
      if (!rateLimit("clienterr:" + clientIp(req, server), 30, HOUR)) return json({ ok: false }, { status: 429 });
      const ce = await readJson(req);
      const clip = (v: any, n: number) => String(v == null ? "" : v).replace(/[\r\n]+/g, " | ").slice(0, n);
      console.log("[client-error] room=" + (roomId || "main") + " who=" + clip(ce?.who, 10) + " part=" + clip(ce?.part, 30) + " msg=" + clip(ce?.msg, 200) + " at=" + clip(ce?.stack, 400) + " ua=" + clip(req.headers.get("user-agent"), 120));
      return json({ ok: true });
    }

    // Anonymous sign-up funnel: records the first time a room reaches each
    // step of the registration screens, so the admin view can show where
    // people give up. Whitelisted step names only; no personal data.
    if (req.method === "POST" && restPath === "/api/funnel") {
      if (!rateLimit("funnel:" + clientIp(req, server), 60, HOUR)) return json({ ok: false }, { status: 429 });
      const body = await readJson(req);
      const step = typeof body?.step === "string" ? body.step : "";
      if (!FUNNEL_STEPS.has(step)) return json({ ok: false }, { status: 400 });
      const cur = await loadState(roomId);
      // Only rooms that were really created (never conjure a room from a made-up id).
      if (roomId && !cur.createdAt) return json({ ok: false }, { status: 404 });
      if (cur.funnel && cur.funnel[step]) return json({ ok: true });
      await saveState(roomId, (s) => {
        if (!s.funnel) s.funnel = {};
        if (!s.funnel[step]) s.funnel[step] = new Date().toISOString();
      });
      return json({ ok: true });
    }

    if (req.method === "POST" && restPath === "/api/status") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const { who, text } = body || {};
      if (!isPerson(who) || typeof text !== "string") {
        return json({ error: "invalid" }, { status: 400 });
      }
      const trimmed = text.trim().slice(0, 60);
      const state = await saveState(roomId, (s) => {
        s.status[who] = { text: trimmed, at: new Date().toISOString() };
      });
      return json(forClient(state));
    }

    if (req.method === "POST" && restPath === "/api/register") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const who = body && body.who;
      const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
      // "contact" is either an email or an Instagram handle (older cached
      // clients still send "email", which keeps working).
      const contact =
        typeof body?.contact === "string" ? body.contact.trim().slice(0, 200)
        : typeof body?.email === "string" ? body.email.trim().slice(0, 200) : "";
      const email = isValidEmail(contact) ? contact : "";
      const handle = email ? null : normalizeInstagramHandle(contact);
      const location = typeof body?.location === "string" ? body.location.trim().slice(0, 80) : "";
      const language = typeof body?.language === "string" ? body.language.trim().slice(0, 40) : "";
      const browserTz = typeof body?.tz === "string" ? body.tz.trim().slice(0, 60) : "";
      const relationship =
        body?.relationship === "significant_other" ||
        body?.relationship === "family" ||
        body?.relationship === "friend" ||
        body?.relationship === "its_complicated"
          ? body.relationship
          : undefined;
      const military = body?.military === true;
      // Email / Instagram is optional: a contact that is given must still be
      // valid, but none at all is fine (the person just can't recover the
      // room by email later, so they keep their Nearune link).
      if (!isPerson(who) || !name || (contact && !email && !handle)) {
        return json({ error: "invalid" }, { status: 400 });
      }
      const locBlocked = await isBlockedLocation(location);
      if (locBlocked) return json({ error: "region_unavailable", country: locBlocked }, { status: 403 });
      if (!(await isCityLevelLocation(location))) return json({ error: "city_required" }, { status: 400 });
      // Optional room name typed by the first person on the setup screen.
      if ((await applySignupRoomName(roomId, body?.roomName)) === "blocked") {
        return json({ error: "inappropriate_name" }, { status: 400 });
      }
      if (!email) {
        // Instagram-handle sign-up: nothing is emailed (there's no address),
        // so there's nothing to confirm and nothing that could be used to
        // spam anyone — an IP limit is enough. The handle is just a label
        // shown to the partner; it can't be verified, which is why this
        // path has no email recovery (see types.ts's PersonProfile.instagram).
        if (!rateLimit("register-ip:" + clientIp(req, server), 10, HOUR)) {
          return json({ error: "rate_limited" }, { status: 429 });
        }
        const curH = await loadState(roomId);
        if (curH.people && curH.people[who] && curH.people[who]!.confirmed) {
          return json({ error: "already_registered" }, { status: 409 });
        }
        const tzH = (await resolveTimezoneFromLocation(location)) || browserTz;
        const stateH = await saveState(roomId, (s) => {
          if (!s.people) s.people = {};
          s.people[who] = { name, location, language, tz: tzH || undefined, confirmed: true, joinedAt: (s.people[who] && s.people[who]!.joinedAt) || new Date().toISOString(), ...(handle ? { instagram: handle } : {}), ...(military ? { military: true } : {}) };
          if (s.pendingConfirm) delete s.pendingConfirm[who];
          if (relationship && !s.relationship) s.relationship = relationship;
        });
        roomSignedUp(roomId);
        return json({ ...forClient(stateH), _viaHandle: true });
      }
      // Two limits: how many confirm emails this visitor can trigger, and
      // how many any single inbox can be sent regardless of who's asking —
      // the second one is what actually stops someone using this as a way
      // to spam a stranger's email address.
      if (!rateLimit("register-ip:" + clientIp(req, server), 10, HOUR) || !rateLimit("register-email:" + email.toLowerCase(), 3, HOUR)) {
        return json({ error: "rate_limited" }, { status: 429 });
      }
      const cur = await loadState(roomId);
      if (cur.people && cur.people[who] && cur.people[who]!.confirmed && cur.people[who]!.emailVerified !== false) {
        return json({ error: "already_registered" }, { status: 409 });
      }
      // The typed location is the source of truth for timezone when it
      // resolves to a real place; the registering device's own timezone is
      // only a fallback (covers an empty/unrecognized location, or the
      // geocoding lookup being unreachable).
      const resolvedTz = await resolveTimezoneFromLocation(location);
      const tz = resolvedTz || browserTz;
      // Re-registering with the same address (Resend confirmation) keeps the
      // same token, so an earlier email's link keeps working instead of
      // being cut off by the newer one.
      const emailHash0 = await hashEmail(email);
      const sameEmailPending =
        cur.people && cur.people[who] && cur.people[who]!.emailHash === emailHash0 && cur.pendingConfirm && cur.pendingConfirm[who];
      const token = sameEmailPending ? cur.pendingConfirm![who]!.token : crypto.randomUUID();
      // Keyed hash only — the address itself is never stored on the person's
      // profile, just this one-way fingerprint (see hashEmail).
      const emailHash = await hashEmail(email);
      const state = await saveState(roomId, (s) => {
        if (!s.people) s.people = {};
        s.people[who] = { name, location, language, tz: tz || undefined, confirmed: true, emailVerified: false, emailHash, joinedAt: (s.people[who] && s.people[who]!.joinedAt) || new Date().toISOString(), ...(military ? { military: true } : {}) };
        if (!s.pendingConfirm) s.pendingConfirm = {};
        const prevPc = s.pendingConfirm[who];
        s.pendingConfirm[who] = {
          token, at: new Date().toISOString(), email,
          reminders: sameEmailPending && prevPc ? prevPc.reminders : undefined,
          remindedAt: sameEmailPending && prevPc ? prevPc.remindedAt : undefined,
        };
        // Only whoever registers first sets this for the room — the second
        // person's own registration (or re-registering after a bounced
        // confirm) never overwrites an already-chosen relationship.
        if (relationship && !s.relationship) s.relationship = relationship;
      });
      roomSignedUp(roomId);
      const confirmUrl = publicOrigin + roomPrefix + "/api/confirm?who=" + who + "&token=" + token;
      // Sent in whichever language this person just picked on the
      // registration form (translateEmailStrings falls back to English,
      // string-by-string, if that language is unset/unrecognized or a
      // translation call fails) — "Hi" and the name are kept separate so
      // the name itself is never run through a translator.
      const [subjT, hiT, setupT, confirmLinkT, step2T, footerT] = await translateEmailStrings(
        [
          "Confirm your Nearune account",
          "Hi",
          "You're almost set up:",
          "Confirm your email",
          "Go to the Nearune link to complete your partner's information",
          "Don't see this arriving right away next time? Check your spam folder.",
        ],
        language
      );
      const r = await sendEmail(
        email,
        subjT,
        "<p>" + hiT + " " + name + ",</p>" +
          "<p>" + setupT + "</p>" +
          "<ol><li><a href=\"" + confirmUrl + "\">" + confirmLinkT + "</a></li>" +
          "<li>" + step2T + "</li></ol>" +
          "<p style=\"color:#888;font-size:0.9em\">" + footerT + "</p>"
      );
      // Lets this person recover their room link later if they lose it.
      addToEmailIndex(emailHash, { roomId, who }).catch(() => {});
      // Same pattern /api/invite already uses below: the link goes back only
      // to the browser that just submitted this request, so exposing it
      // here is no bigger a surface than the invite link already is — and
      // it's what lets registration finish immediately if the email is
      // slow, misdelivered, or (in a sandbox with no email provider
      // configured) never sent at all.
      return json({ ...forClient(state), _emailSent: r.ok, _emailError: r.error, _confirmUrl: confirmUrl });
    }

    if (req.method === "GET" && restPath === "/api/confirm") {
      const who = url.searchParams.get("who") || "";
      const token = url.searchParams.get("token") || "";
      let ok = false;
      if (isPerson(who)) {
        const cur = await loadState(roomId);
        if (cur.pendingConfirm && cur.pendingConfirm[who] && cur.pendingConfirm[who]!.token === token) {
          await saveState(roomId, (s) => {
            if (s.people && s.people[who]) { s.people[who]!.confirmed = true; s.people[who]!.emailVerified = true; }
            if (s.pendingConfirm) delete s.pendingConfirm[who];
          });
          ok = true;
        } else if (cur.people && cur.people[who] && cur.people[who]!.confirmed && cur.people[who]!.emailVerified !== false) {
          // Already confirmed (link clicked twice, or an email app pre-opened
          // it): that's a success, not an expired link.
          ok = true;
        }
      }
      // ?viewer=<who> lets the client auto-select this person as "you" on
      // load — without it, clicking the confirm link in a browser context
      // that doesn't share localStorage with wherever they registered (e.g.
      // an email app's in-app browser) drops them on the "who's here?"
      // picker instead of straight into their next step.
      const backUrl = publicOrigin + roomPrefix + "/" + (ok ? "?viewer=" + who : "");
      const html = ok
        ? "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Confirmed</title></head><body style=\"font-family:sans-serif;text-align:center;padding:60px 24px;color:#2B211B\"><h1>Confirmed 🎉</h1><p style=\"font-size:1.15rem;line-height:1.5\">You're all set. Switch back to the <strong>Nearune app</strong> to keep going.</p><p style=\"margin-top:40px;font-size:0.9rem;color:#6F6054\">Using Nearune in your browser instead? <a href=\"" + backUrl + "\" style=\"color:#6F6054\">Continue in browser</a></p></body></html>"
        : "<!doctype html><body style=\"font-family:sans-serif;text-align:center;padding:60px 20px\"><h1>Link expired</h1><p>Request a new one from the app.</p></body>";
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    if (req.method === "POST" && restPath === "/api/invite") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const who = body && body.who;
      const contact =
        typeof body?.contact === "string" ? body.contact.trim().slice(0, 200)
        : typeof body?.email === "string" ? body.email.trim().slice(0, 200) : "";
      // via === "link": no email or handle — just hand back a link (with the
      // room code) for the inviter to send by text, WhatsApp, etc.
      const viaLink = body && body.via === "link";
      const email = viaLink ? "" : isValidEmail(contact) ? contact : "";
      const handle = viaLink || email ? null : normalizeInstagramHandle(contact);
      if (!isPerson(who) || (!viaLink && !email && !handle)) {
        return json({ error: "invalid" }, { status: 400 });
      }
      if (!rateLimit("invite-ip:" + clientIp(req, server), 10, HOUR) || (email && !rateLimit("invite-email:" + email.toLowerCase(), 3, HOUR))) {
        return json({ error: "rate_limited" }, { status: 429 });
      }
      const cur = await loadState(roomId);
      if (!cur.people || !cur.people[who] || !cur.people[who]!.confirmed) {
        return json({ error: "not_confirmed" }, { status: 403 });
      }
      // Sending an invite BY EMAIL waits until this person's own email is
      // confirmed (keeps unverified sign-ups from emailing strangers).
      // Link and Instagram-handle invites work right away.
      if (email && cur.people[who]!.emailVerified === false) {
        return json({ error: "email_unverified" }, { status: 403 });
      }
      const other: PersonKey = who === "mark" ? "nikita" : "mark";
      if (cur.people[other] && cur.people[other]!.confirmed) {
        return json({ error: "already_registered" }, { status: 409 });
      }
      // 12 hex chars keeps the shareable link short; invites are rate-limited.
      // A resend keeps the same token, so the link in an earlier email or
      // message never stops working just because a newer one was sent.
      // An invite link works for 3 days from when it was made (INVITE_TTL_MS);
      // re-sending it doesn't restart the clock, and an expired one is
      // replaced with a fresh link here.
      const priorInvite = cur.pendingInvite && cur.pendingInvite[other];
      const priorLive = !!(priorInvite && priorInvite.token && Date.now() - Date.parse(priorInvite.at) < INVITE_TTL_MS);
      const token = priorLive ? priorInvite!.token : crypto.randomUUID().replace(/-/g, "").slice(0, 12);
      const madeAt = priorLive ? priorInvite!.at : new Date().toISOString();
      // Today's question for the invite page: only kept if it's one of
      // Nearune's own questions (never free text from the request).
      const qRaw = typeof body?.q === "string" ? body.q.trim().slice(0, 300) : "";
      const qKey = typeof body?.qKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.qKey) ? body.qKey : "";
      const q = qRaw && qKey && isKnownQuestion(qRaw) ? qRaw : "";
      const state = await saveState(roomId, (s) => {
        if (!s.pendingInvite) s.pendingInvite = {};
        const base: any = handle
          ? { token, at: madeAt, instagram: handle }
          : viaLink
            ? { token, at: madeAt, link: true }
            : { token, at: madeAt };
        if (q) { base.q = q; base.qKey = qKey; }
        else if (priorLive && priorInvite!.q) { base.q = priorInvite!.q; base.qKey = priorInvite!.qKey; }
        s.pendingInvite[other] = base;
      });
      const inviteUrl = roomId
        ? publicOrigin + "/j/" + roomId + "/" + token
        : publicOrigin + roomPrefix + "/?invite=" + other + "&token=" + token;
      if (viaLink) {
        console.log("[invite] room=" + (roomId || "main") + " via=link");
        return json({ ...forClient(state), _viaHandle: true, _viaLink: true, _inviteUrl: inviteUrl, _appStoreUrl: Bun.env.APP_STORE_URL || "" });
      }
      if (handle) {
        // Nothing to email — the link goes back to this browser and the
        // inviter sends it themselves (e.g. as an Instagram DM).
        console.log("[invite] room=" + (roomId || "main") + " via=instagram");
        return json({ ...forClient(state), _viaHandle: true, _inviteUrl: inviteUrl, _appStoreUrl: Bun.env.APP_STORE_URL || "" });
      }
      const inviterName = String(cur.people[who]!.name || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as any)[c]);
      const r = await sendEmail(
        email,
        inviterName + " invited you to Nearune",
        "<p style=\"font-size:16px\">" + inviterName + " invited you to Nearune: one question a day, just for the two of you. It's free.</p>" +
          "<p style=\"margin:20px 0\"><a href=\"" + inviteUrl + "\" style=\"background:#A9532C;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:700;display:inline-block\">Accept " + inviterName + "'s invite</a></p>" +
          (roomId ? "<p style=\"font-size:15px\">Your room code: <b>" + roomId + "</b><br><span style=\"font-size:14px\">If the link doesn't open the app, open Nearune, tap <b>Open an existing room</b> and enter this code.</span></p>" : "") +
          (Bun.env.APP_STORE_URL
            ? "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin:18px 0\"><tr>" +
              "<td style=\"padding-right:14px;vertical-align:middle\"><a href=\"" + Bun.env.APP_STORE_URL + "\"><img src=\"" + publicOrigin + "/apple-touch-icon.png\" width=\"64\" height=\"64\" alt=\"Nearune\" style=\"border-radius:14px;display:block;border:0\"></a></td>" +
              "<td style=\"vertical-align:middle\"><div style=\"font-size:15px;margin-bottom:8px\">Get the Nearune app</div>" +
              "<a href=\"" + Bun.env.APP_STORE_URL + "\" style=\"display:inline-block;margin:0 8px 6px 0\"><img src=\"" + publicOrigin + "/app-store-badge.png\" width=\"160\" alt=\"Download on the App Store\" style=\"display:block;border:0;height:auto\"></a>" +
              "<a href=\"" + GOOGLE_PLAY_URL + "\" style=\"display:inline-block;margin:0 0 6px 0\"><img src=\"" + publicOrigin + "/google-play-badge.png\" width=\"182\" alt=\"Get it on Google Play\" style=\"display:block;border:0;height:auto\"></a></td>" +
              "</tr></table>"
            : "") +
          "<p style=\"font-size:14px\">Already have the app? Copy the link above, open Nearune and tap <b>Paste my invite</b>. Nearune only reads the link you just copied.</p>" +
          "<p>Prefer not to install anything? Use Nearune in your browser at <a href=\"https://nearune.ai\">nearune.ai</a>.</p>" +
          "<p style=\"color:#888;font-size:0.9em\">Don't see this arriving right away next time? Check your spam folder.</p>"
      );
      console.log("[invite] room=" + (roomId || "main") + " via=email sent=" + r.ok + (r.ok ? "" : " error=" + JSON.stringify(String(r.error || "").slice(0, 200))));
      return json({ ...forClient(state), _emailSent: r.ok, _emailError: r.error, _inviteUrl: inviteUrl, _appStoreUrl: Bun.env.APP_STORE_URL || "" });
    }

    if (req.method === "POST" && restPath === "/api/accept-invite") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const token = typeof body?.token === "string" ? body.token : "";
      const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
      const location = typeof body?.location === "string" ? body.location.trim().slice(0, 80) : "";
      const language = typeof body?.language === "string" ? body.language.trim().slice(0, 40) : "";
      const browserTz = typeof body?.tz === "string" ? body.tz.trim().slice(0, 60) : "";
      if (!token || !name) return json({ error: "invalid" }, { status: 400 });
      const locBlocked = await isBlockedLocation(location);
      if (locBlocked) return json({ error: "region_unavailable", country: locBlocked }, { status: 403 });
      if (!(await isCityLevelLocation(location))) return json({ error: "city_required" }, { status: 400 });
      const cur = await loadState(roomId);
      let who: PersonKey | null = null;
      (["mark", "nikita"] as PersonKey[]).forEach((k) => {
        if (cur.pendingInvite && cur.pendingInvite[k] && cur.pendingInvite[k]!.token === token) who = k;
      });
      if (!who) return json({ error: "invalid_token" }, { status: 400 });
      if (!inviteLive(cur.pendingInvite![who]!)) return json({ error: "invite_expired" }, { status: 410 });
      const resolvedTz = await resolveTimezoneFromLocation(location);
      const tz = resolvedTz || browserTz;
      const state = await saveState(roomId, (s) => {
        if (!s.people) s.people = {};
        const invitedHandle = s.pendingInvite && s.pendingInvite[who!] && s.pendingInvite[who!]!.instagram;
        s.people[who!] = { name, location, language, tz: tz || undefined, confirmed: true, ...(invitedHandle ? { instagram: invitedHandle } : {}) };
        if (s.pendingInvite) delete s.pendingInvite[who!];
      });
      console.log("[invite-accepted] room=" + (roomId || "main") + " who=" + who);
      try { notifyInviteEvent(roomId || "main", "joined", { ...state, pendingInvite: { [who!]: { token } } }, name); } catch {}
      // Let the person who sent the invite know their partner is in —
      // otherwise the only way they'd find out is having the app open when
      // the 6s poll happens to catch it. Push only (not email): we never
      // keep a raw email on file past sending the original invite, so
      // there's nothing to email this back to.
      const inviter: PersonKey = who === "mark" ? "nikita" : "mark";
      const inviterSub = state.pushSubs && state.pushSubs[inviter];
      if (inviterSub) {
        const today = todayKeyFor(state);
        sendPush(inviterSub, {
          title: "Your Nearune partner joined!",
          body: name + " just joined Nearune — today's question is ready for you both.",
          badge: unansweredCount(state, today),
          tag: "partner-joined",
        }).then((res) => {
          if (res.gone) {
            saveState(roomId, (s) => {
              if (s.pushSubs) delete s.pushSubs[inviter];
            }).catch(() => {});
          }
        }).catch(() => {});
      }
      return json({ who, ...forClient(state) });
    }

    // The photo puzzle is off in "Make a friend" rooms (strangers).
    if (req.method === "POST" && restPath.startsWith("/api/puzzle-")) {
      if ((await loadState(roomId)).origin === "friend") return json({ error: "puzzle_disabled" }, { status: 403 });
    }

    if (req.method === "POST" && restPath === "/api/puzzle-batch") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const who = body && body.who;
      const items = body && body.items;
      if (!isPerson(who) || !Array.isArray(items) || items.length < 1 || items.length > 10) {
        return json({ error: "invalid" }, { status: 400 });
      }
      const parsed: { id: string; answer: string; question: string; bytes: Uint8Array }[] = [];
      for (const item of items) {
        const dataUrl = item && item.dataUrl;
        const answer = item && item.answer;
        const question = item && item.question;
        const match = typeof dataUrl === "string" ? dataUrl.match(/^data:image\/jpeg;base64,(.+)$/) : null;
        const trimmedAnswer = typeof answer === "string" ? answer.trim().slice(0, 200) : "";
        const trimmedQuestion = typeof question === "string" ? question.trim().slice(0, 200) : "";
        if (!match || !trimmedAnswer || !trimmedQuestion) return json({ error: "invalid" }, { status: 400 });
        let bytes: Uint8Array;
        try {
          bytes = Buffer.from(match[1], "base64");
        } catch {
          return json({ error: "invalid" }, { status: 400 });
        }
        if (bytes.length > 6 * 1024 * 1024) return json({ error: "too_large" }, { status: 400 });
        parsed.push({ id: crypto.randomUUID(), answer: trimmedAnswer, question: trimmedQuestion, bytes });
      }
      const current = await loadState(roomId);
      // A new batch can be loaded once the current picture is finished (solved
      // or every piece unlocked) and nothing is still queued behind it.
      const curRevealed = !!current.puzzleCurrentId && (!!current.puzzleSolved || puzzleUnlockedCount(current) >= PUZZLE_TOTAL);
      const curQueued = !!(current.puzzleQueue && current.puzzleQueue.length > 0);
      if (curQueued || (current.puzzleCurrentId && !curRevealed)) {
        return json({ error: "in_progress" }, { status: 409 });
      }
      const verdicts = await Promise.all(parsed.map((p) => moderateContent({ image: p.bytes, text: p.question + " " + p.answer })));
      if (verdicts.indexOf("blocked") >= 0) return json({ error: "inappropriate" }, { status: 422 });
      if (verdicts.indexOf("unavailable") >= 0) return json({ error: "moderation_unavailable" }, { status: 503 });
      for (const p of parsed) {
        if (useS3 && s3) {
          await s3.file(puzzleImageKey(roomId, p.id)).write(p.bytes, { type: "image/jpeg" });
        } else {
          await Bun.write(localPuzzlePath(roomId, p.id), p.bytes);
        }
      }
      const state = await saveState(roomId, (s) => {
        const first = parsed[0];
        const rest = parsed.slice(1).map((p) => ({ id: p.id, answer: p.answer, question: p.question }));
        s.puzzleCurrentId = first.id;
        s.puzzleAnswer = first.answer;
        if (first.question) s.puzzleQuestion = first.question; else delete s.puzzleQuestion;
        s.puzzleSetBy = who;
        s.puzzleRoundStartDate = todayKeyFor(s);
        s.puzzleBonusCredits = 0;
        delete s.puzzleRoundBase;
        s.puzzleSolved = false;
        s.puzzlePendingBonus = false;
        s.puzzleQueue = rest;
        s.puzzleQueueBy = who;
        s.puzzleQueueAt = new Date().toISOString();
        s.puzzleQueueTotal = parsed.length;
        delete s.puzzleLastGuessDate;
        delete s.puzzleLastGuessBy;
        delete s.puzzleLastGuessText;
        delete s.puzzleLastGuessCorrect;
      });
      recordRoomUse(roomId, "puzzle_uploaded");
      return json(forClient(state));
    }

    if (req.method === "POST" && restPath === "/api/puzzle-place") {
      if (!rateLimit("puzzle-place:" + roomId, 40, HOUR)) return json({ place: null });
      const body = await readJson(req);
      const m = body && typeof body.dataUrl === "string" ? body.dataUrl.match(/^data:image\/jpeg;base64,(.+)$/) : null;
      if (!m) return json({ place: null });
      let bytes: Uint8Array;
      try { bytes = Buffer.from(m[1], "base64"); } catch { return json({ place: null }); }
      if (bytes.length < 200) return json({ place: null });
      return json({ place: await guessPlaceFromImage(bytes) });
    }

    // Never Have I Ever: answer the current phrase. "round" guards against a
    // stale tab answering a phrase that has already moved on.
    if (req.method === "POST" && restPath === "/api/nhie-vote") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const { who, choice, round } = body || {};
      if (!isPerson(who) || (choice !== "never" && choice !== "have")) return json({ error: "invalid" }, { status: 400 });
      const state = await saveState(roomId, (s) => {
        if (!s.nhie) s.nhie = newRound(undefined, roomRelationship(s));
        if (s.nhie.round !== round) return;
        if (!s.nhie.votes) s.nhie.votes = {};
        s.nhie.votes[who] = choice;
      });
      recordRoomUse(roomId, "nhie_vote");
      return json(forClient(state));
    }

    // Starts the next phrase. Only moves on once both have answered (or when
    // there is no round yet), and only from the round the caller was looking
    // at, so two quick taps never skip a phrase.
    if (req.method === "POST" && restPath === "/api/nhie-next") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const { who, round } = body || {};
      if (!isPerson(who)) return json({ error: "invalid" }, { status: 400 });
      const state = await saveState(roomId, (s) => {
        if (!s.nhie) { s.nhie = newRound(undefined, roomRelationship(s)); return; }
        const v = s.nhie.votes || {};
        if (s.nhie.round === round && v.mark && v.nikita) s.nhie = newRound(s.nhie, roomRelationship(s));
      });
      return json(forClient(state));
    }

    // Never Have I Ever: a short note on a revealed round (current one once
    // both have answered, or any past one).
    if (req.method === "POST" && restPath === "/api/nhie-comment") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const { who, round, text } = body || {};
      const trimmed = typeof text === "string" ? text.trim().slice(0, 300) : "";
      if (!isPerson(who) || !Number.isInteger(round) || round < 1 || !trimmed) return json({ error: "invalid" }, { status: 400 });
      const blockedN = await moderate(roomId, who, "nhie-comment", trimmed, body.confirmFlagged === true);
      if (blockedN) return blockedN;
      const state = await saveState(roomId, (s) => {
        if (!s.nhie || round > s.nhie.round) return;
        const v = s.nhie.votes || {};
        if (round === s.nhie.round && !v[who as PersonKey]) return;
        if (!s.nhie.comments) s.nhie.comments = {};
        const list = s.nhie.comments[String(round)] || (s.nhie.comments[String(round)] = []);
        if (list.length >= 50) return;
        list.push({ who, text: trimmed, at: new Date().toISOString() });
      });
      return json(forClient(state));
    }

    if (req.method === "POST" && restPath === "/api/badge-sync") {
      // Self-heal for the native app-icon badge: the clear/set push is only
      // sent at the moment an answer lands, and if it is missed the icon
      // stays wrong. The open app asks for a resend of the true count.
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const who = body && body.who;
      if (!isPerson(who)) return json({ error: "invalid" }, { status: 400 });
      if (!rateLimit("badge-sync:" + roomId + ":" + who, 20, 10 * 60 * 1000)) return json({ ok: true, skipped: true });
      const cur = await loadState(roomId);
      const sub = cur.pushSubs && cur.pushSubs[who];
      if (!anyPushConfigured || !sub || sub.kind !== "apns") return json({ ok: true, skipped: true });
      const count = unansweredCount(cur, todayKeyFor(cur));
      sendPush(sub, { title: "", body: "", badge: count, tag: "badge-sync", silent: true })
        .then((res) => {
          if (res.gone) {
            saveState(roomId, (s) => { if (s.pushSubs) delete s.pushSubs[who]; }).catch(() => {});
          }
        })
        .catch(() => {});
      return json({ ok: true, count });
    }

    if (req.method === "POST" && restPath === "/api/puzzle-edit") {
      // The person who set the current picture can fix its question/answer
      // until it is solved. The answer stays server-side (never sent back).
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const who = body && body.who;
      const q = typeof body?.question === "string" ? body.question.trim().slice(0, 200) : "";
      const a = typeof body?.answer === "string" ? body.answer.trim().slice(0, 200) : "";
      if (!isPerson(who) || !q || !a) return json({ error: "invalid" }, { status: 400 });
      const cur = await loadState(roomId);
      if (!cur.puzzleCurrentId || cur.puzzleSetBy !== who) return json({ error: "not_setter" }, { status: 403 });
      if (cur.puzzleSolved) return json({ error: "already_solved" }, { status: 409 });
      const verdict = await moderateContent({ text: q + " " + a });
      if (verdict === "blocked") return json({ error: "inappropriate" }, { status: 422 });
      if (verdict === "unavailable") return json({ error: "moderation_unavailable" }, { status: 503 });
      const state = await saveState(roomId, (s) => {
        if (s.puzzleCurrentId && s.puzzleSetBy === who && !s.puzzleSolved) {
          s.puzzleQuestion = q;
          s.puzzleAnswer = a;
        }
      });
      return json(forClient(state));
    }

    if (req.method === "POST" && restPath === "/api/puzzle-advance") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const who = body && body.who;
      if (!isPerson(who)) return json({ error: "invalid" }, { status: 400 });
      const state = await saveState(roomId, (s) => {
        advanceQueue(s);
      });
      return json(forClient(state));
    }

    if (req.method === "POST" && restPath === "/api/voice-sample") {
      // Cloning costs real money per call and a bad actor could otherwise
      // hammer this — capped well above any legitimate re-recording need.
      if (!rateLimit("voice-sample:" + roomId, 10, 24 * HOUR)) {
        return json({ error: "rate_limited" }, { status: 429 });
      }
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const who = body && body.who;
      const dataUrl = body && body.dataUrl;
      if (!isPerson(who) || typeof dataUrl !== "string") return json({ error: "invalid" }, { status: 400 });
      // Same checks the morning QA runs (parseVoiceSample in voice.ts).
      const sample = parseVoiceSample(dataUrl);
      if (!sample.ok) return json({ error: sample.error }, { status: 400 });
      const mimeType = sample.mimeType;
      const bytes = sample.bytes;
      const existing = await loadState(roomId);
      const oldVoiceId = existing.people && existing.people[who] && existing.people[who]!.voiceId;
      const label = "nearune-" + (roomId || "legacy") + "-" + who;
      const result = await cloneVoice(bytes, mimeType, label);
      if (!result.ok) return json({ error: result.error }, { status: 502 });
      const state = await saveState(roomId, (s) => {
        if (!s.people) s.people = {};
        if (!s.people[who]) s.people[who] = { name: "", location: "", language: "", confirmed: true };
        s.people[who]!.voiceId = result.voiceId;
      });
      // Old clone is no longer referenced by anything — clean it up at the
      // provider rather than letting clones accumulate there forever.
      if (oldVoiceId && oldVoiceId !== result.voiceId) deleteVoice(oldVoiceId).catch(() => {});
      recordRoomUse(roomId, "voice_recorded");
      return json(forClient(state));
    }

    // Clears a saved voice sample without recording a new one — e.g. the
    // sample on file was recorded by the wrong person (device identity was
    // on someone else's slot at the time) and needs to come off entirely
    // rather than being replaced with another recording right away. Once
    // cleared, speak/speakAs fall back to the plain default voice until
    // that person records a real sample of their own.
    if (req.method === "POST" && restPath === "/api/voice-sample-delete") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const who = body && body.who;
      if (!isPerson(who)) return json({ error: "invalid" }, { status: 400 });
      const existing = await loadState(roomId);
      const oldVoiceId = existing.people && existing.people[who] && existing.people[who]!.voiceId;
      const state = await saveState(roomId, (s) => {
        if (s.people && s.people[who]) delete s.people[who]!.voiceId;
      });
      if (oldVoiceId) deleteVoice(oldVoiceId).catch(() => {});
      return json(forClient(state));
    }

    // SANDBOX EXPERIMENT: "share a recent photo" — one photo per person,
    // overwritten each time (see storage.ts's photoKey/PersonProfile.photoAt),
    // same resize-client-side-then-base64-POST approach as /api/voice-sample
    // and /api/puzzle-batch above.
    // Photo sharing is off in "Make a friend" rooms (strangers).
    if (req.method === "POST" && (restPath === "/api/photo-upload" || restPath === "/api/photo-caption" || restPath === "/api/video-upload")) {
      if ((await loadState(roomId)).origin === "friend") return json({ error: "photos_disabled" }, { status: 403 });
    }

    if (req.method === "POST" && restPath === "/api/photo-upload") {
      if (!rateLimit("photo-upload:" + roomId, 30, HOUR)) {
        return json({ error: "rate_limited" }, { status: 429 });
      }
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const who = body && body.who;
      const dataUrl = body && body.dataUrl;
      if (!isPerson(who) || typeof dataUrl !== "string") return json({ error: "invalid" }, { status: 400 });
      const match = dataUrl.match(/^data:image\/jpeg;base64,(.+)$/);
      if (!match) return json({ error: "invalid" }, { status: 400 });
      let bytes: Uint8Array;
      try {
        bytes = Buffer.from(match[1], "base64");
      } catch {
        return json({ error: "invalid" }, { status: 400 });
      }
      if (bytes.length < 200) return json({ error: "invalid" }, { status: 400 });
      if (bytes.length > 6 * 1024 * 1024) return json({ error: "too_large" }, { status: 400 });
      {
        const capText = typeof body.caption === "string" ? body.caption.trim().slice(0, 200) : "";
        const verdict = await moderateContent({ image: bytes, text: capText });
        if (verdict === "blocked") return json({ error: "inappropriate" }, { status: 422 });
        if (verdict === "unavailable") return json({ error: "moderation_unavailable" }, { status: 503 });
      }
      if (useS3 && s3) {
        await s3.file(photoKey(roomId, who)).write(bytes, { type: "image/jpeg" });
      } else {
        await Bun.write(localPhotoPath(roomId, who), bytes);
      }
      const state = await saveState(roomId, (s) => {
        if (!s.people) s.people = {};
        if (!s.people[who]) s.people[who] = { name: "", location: "", language: "", confirmed: true };
        s.people[who]!.photoAt = new Date().toISOString();
        const cap = typeof body.caption === "string" ? body.caption.trim().slice(0, 200) : "";
        if (cap) s.people[who]!.photoCaption = cap; else delete s.people[who]!.photoCaption;
        delete s.people[who]!.photoKind;
        delete s.people[who]!.videoType;
      });
      deleteSharedVideo(roomId, who).catch(() => {});
      return json(forClient(state));
    }

    // Share a video instead of a photo (same one-per-person slot). Sent as a
    // form: the video file, plus up to 3 still frames the phone took from it
    // (start, middle, end). Every frame and the comment are checked by the
    // same moderation as photos; the first frame becomes the thumbnail.
    if (req.method === "POST" && restPath === "/api/video-upload") {
      if (!rateLimit("photo-upload:" + roomId, 30, HOUR)) {
        return json({ error: "rate_limited" }, { status: 429 });
      }
      let form: FormData;
      try { form = await req.formData(); } catch { return json({ error: "invalid" }, { status: 400 }); }
      const who = String(form.get("who") || "");
      if (!isPerson(who)) return json({ error: "invalid" }, { status: 400 });
      const video = form.get("video");
      if (!video || typeof video === "string") return json({ error: "invalid" }, { status: 400 });
      const vType = String((video as File).type || "video/mp4").split(";")[0];
      if (!/^video\/[a-z0-9.+-]+$/i.test(vType)) return json({ error: "invalid" }, { status: 400 });
      if ((video as File).size < 1000) return json({ error: "invalid" }, { status: 400 });
      if ((video as File).size > 60 * 1024 * 1024) return json({ error: "too_large" }, { status: 400 });
      const frames: Uint8Array[] = [];
      for (const f of form.getAll("frame")) {
        if (f && typeof f !== "string" && (f as File).size > 200 && (f as File).size < 4 * 1024 * 1024) frames.push(new Uint8Array(await (f as File).arrayBuffer()));
      }
      if (!frames.length) return json({ error: "invalid" }, { status: 400 });
      const capText = String(form.get("caption") || "").trim().slice(0, 200);
      for (let i = 0; i < Math.min(frames.length, 3); i++) {
        const verdict = await moderateContent({ image: frames[i], text: i === 0 ? capText : "" });
        if (verdict === "blocked") return json({ error: "inappropriate" }, { status: 422 });
        if (verdict === "unavailable") return json({ error: "moderation_unavailable" }, { status: 503 });
      }
      const vBytes = new Uint8Array(await (video as File).arrayBuffer());
      if (useS3 && s3) {
        await s3.file(videoKey(roomId, who)).write(vBytes, { type: vType });
        await s3.file(photoKey(roomId, who)).write(frames[0], { type: "image/jpeg" });
      } else {
        await Bun.write(localVideoPath(roomId, who), vBytes);
        await Bun.write(localPhotoPath(roomId, who), frames[0]);
      }
      const state = await saveState(roomId, (s) => {
        if (!s.people) s.people = {};
        if (!s.people[who]) s.people[who] = { name: "", location: "", language: "", confirmed: true };
        s.people[who]!.photoAt = new Date().toISOString();
        s.people[who]!.photoKind = "video";
        s.people[who]!.videoType = vType;
        delete s.people[who]!.videoV;
        if (capText) s.people[who]!.photoCaption = capText; else delete s.people[who]!.photoCaption;
      });
      // Convert in the background so the sender doesn't wait; the original
      // plays meanwhile on phones that support it.
      const sharedAt = state.people && state.people[who] ? state.people[who]!.photoAt || "" : "";
      convertSharedVideo(roomId, who, sharedAt, vBytes).catch((e) => console.log("[video] convert failed: " + (e?.message || e)));
      return json(forClient(state));
    }

    // Who the room is for (partner, family, friend...), chosen on the invite
    // card now that sign-up only asks for a name and city. Picks the daily
    // question set. Can be changed until the invited person joins.
    if (req.method === "POST" && restPath === "/api/relationship") {
      const body = await readJson(req);
      const rel = body && body.relationship;
      if (!isPerson(body?.who) || !["significant_other", "family", "friend", "its_complicated"].includes(rel)) return json({ error: "invalid" }, { status: 400 });
      const cur = await loadState(roomId);
      if (cur.origin === "friend") return json({ error: "invalid" }, { status: 400 });
      const bothIn = cur.people && cur.people.mark && cur.people.mark.confirmed && cur.people.nikita && cur.people.nikita.confirmed;
      if (bothIn && cur.relationship) return json(forClient(cur));
      const st = await saveState(roomId, (s) => { s.relationship = rel; });
      return json(forClient(st));
    }

    // Share a link (one per person, replaced each time) with an optional
    // comment. Off in "Make a friend" rooms, like photos. The link and the
    // comment go through the same text moderation as photo comments.
    if (req.method === "POST" && (restPath === "/api/link-share" || restPath === "/api/link-delete")) {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const who = body.who;
      if (!isPerson(who)) return json({ error: "invalid" }, { status: 400 });
      if (restPath === "/api/link-delete") {
        const st = await saveState(roomId, (s) => {
          if (s.people && s.people[who]) { delete s.people[who]!.linkUrl; delete s.people[who]!.linkNote; delete s.people[who]!.linkAt; }
        });
        return json(forClient(st));
      }
      if ((await loadState(roomId)).origin === "friend") return json({ error: "links_disabled" }, { status: 403 });
      if (!rateLimit("link-share:" + roomId, 30, HOUR)) return json({ error: "rate_limited" }, { status: 429 });
      let raw = typeof body.url === "string" ? body.url.trim() : "";
      if (raw && !/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = "https://" + raw;
      let u: URL;
      try { u = new URL(raw); } catch { return json({ error: "bad_link" }, { status: 400 }); }
      if ((u.protocol !== "https:" && u.protocol !== "http:") || !u.hostname.includes(".") || raw.length > 600) return json({ error: "bad_link" }, { status: 400 });
      const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) : "";
      const verdict = await moderateContent({ text: (note ? note + "\n" : "") + "Link: " + u.toString() });
      if (verdict === "blocked") return json({ error: "inappropriate" }, { status: 422 });
      if (verdict === "unavailable") return json({ error: "moderation_unavailable" }, { status: 503 });
      const st = await saveState(roomId, (s) => {
        if (!s.people) s.people = {};
        if (!s.people[who]) s.people[who] = { name: "", location: "", language: "", confirmed: true };
        s.people[who]!.linkUrl = u.toString();
        s.people[who]!.linkAt = new Date().toISOString();
        if (note) s.people[who]!.linkNote = note; else delete s.people[who]!.linkNote;
      });
      return json(forClient(st));
    }

    // Streams a shared video. Phones fetch video in pieces (byte ranges),
    // and iPhones won't play a video whose server ignores those requests.
    if (req.method === "GET" && restPath === "/api/video") {
      const who = url.searchParams.get("who") || "";
      if (!isPerson(who)) return new Response("Not found", { status: 404 });
      try {
        const st = await loadState(roomId);
        const vType = (st.people && st.people[who] && st.people[who]!.videoType) || "video/mp4";
        const file: any = useS3 && s3 ? s3.file(videoKey(roomId, who)) : Bun.file(localVideoPath(roomId, who));
        if (!(await file.exists())) return new Response("Not found", { status: 404 });
        const size: number = useS3 && s3 ? (await file.stat()).size : file.size;
        const baseHeaders: Record<string, string> = { "content-type": vType, "accept-ranges": "bytes", "cache-control": "private, max-age=31536000, immutable" };
        const range = req.headers.get("range");
        const m = range && range.match(/^bytes=(\d*)-(\d*)$/);
        if (m && (m[1] || m[2])) {
          let start = m[1] ? parseInt(m[1], 10) : Math.max(0, size - parseInt(m[2], 10));
          let end = m[1] && m[2] ? parseInt(m[2], 10) : size - 1;
          if (!m[1]) end = size - 1;
          end = Math.min(end, size - 1);
          if (start > end || start >= size) return new Response(null, { status: 416, headers: { "content-range": "bytes */" + size } });
          const chunk = await file.slice(start, end + 1).arrayBuffer();
          return new Response(chunk, { status: 206, headers: { ...baseHeaders, "content-range": "bytes " + start + "-" + end + "/" + size, "content-length": String(end - start + 1) } });
        }
        return new Response(file.stream ? file.stream() : await file.arrayBuffer(), { headers: { ...baseHeaders, "content-length": String(size) } });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    }

    // Edit the comment under an already-shared photo.
    if (req.method === "POST" && restPath === "/api/photo-caption") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const who = body.who;
      if (!isPerson(who) || typeof body.caption !== "string") return json({ error: "invalid" }, { status: 400 });
      const cap = body.caption.trim().slice(0, 200);
      if (cap) {
        const verdict = await moderateContent({ text: cap });
        if (verdict === "blocked") return json({ error: "inappropriate" }, { status: 422 });
        if (verdict === "unavailable") return json({ error: "moderation_unavailable" }, { status: 503 });
      }
      const state = await saveState(roomId, (s) => {
        if (s.people && s.people[who] && s.people[who]!.photoAt) {
          if (cap) s.people[who]!.photoCaption = cap; else delete s.people[who]!.photoCaption;
        }
      });
      return json(forClient(state));
    }

    // Removes a shared photo without replacing it — same idea as
    // /api/voice-sample-delete above.
    if (req.method === "POST" && restPath === "/api/photo-delete") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const who = body && body.who;
      if (!isPerson(who)) return json({ error: "invalid" }, { status: 400 });
      const state = await saveState(roomId, (s) => {
        if (s.people && s.people[who]) { delete s.people[who]!.photoAt; delete s.people[who]!.photoCaption; delete s.people[who]!.photoKind; delete s.people[who]!.videoType; }
      });
      deleteSharedVideo(roomId, who).catch(() => {});
      try {
        if (useS3 && s3) await s3.file(photoKey(roomId, who)).delete();
        else await Bun.file(localPhotoPath(roomId, who)).delete();
      } catch {}
      return json(forClient(state));
    }

    if (req.method === "GET" && restPath === "/api/photo") {
      const who = url.searchParams.get("who") || "";
      if (!isPerson(who)) return new Response("Not found", { status: 404 });
      try {
        if (useS3 && s3) {
          const file = s3.file(photoKey(roomId, who));
          if (!(await file.exists())) return new Response("Not found", { status: 404 });
          const bytes = await file.arrayBuffer();
          return new Response(bytes, {
            headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" },
          });
        } else {
          const f = Bun.file(localPhotoPath(roomId, who));
          if (!(await f.exists())) return new Response("Not found", { status: 404 });
          const bytes = await f.arrayBuffer();
          return new Response(bytes, {
            headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" },
          });
        }
      } catch {
        return new Response("Not found", { status: 404 });
      }
    }

    if (req.method === "POST" && restPath === "/api/speak") {
      // Each call is a real text-to-speech request against a paid API — cap
      // it well above normal use (someone tapping 🔊 on every line of a long
      // conversation) without making it a hard wall for ordinary use.
      if (!rateLimit("speak:" + roomId, 120, HOUR)) {
        return json({ error: "rate_limited" }, { status: 429 });
      }
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const who = body && body.who;
      const text = typeof (body && body.text) === "string" ? body.text.slice(0, 2000).trim() : "";
      if (!text) return json({ error: "invalid" }, { status: 400 });
      const current = await loadState(roomId);
      const person = isPerson(who) && current.people ? current.people[who] : undefined;
      // Their own recorded voice, or a stock voice until they record one.
      let voiceId = person && person.voiceId;
      const own = !!voiceId;
      if (!voiceId) voiceId = await defaultVoiceId(person && person.name ? await voiceGenderForName(person.name) : "neutral");
      const audio = await synthesizeSpeech(text, voiceId);
      if (!audio) return json({ error: "synth_failed" }, { status: 502 });
      recordRoomUse(roomId, "voice_played");
      return new Response(audio, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store", "x-nearune-voice": own ? "own" : "stock" } });
    }

    if (req.method === "POST" && restPath === "/api/puzzle-guess") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const { who, text } = body || {};
      if (!isPerson(who) || typeof text !== "string" || !text.trim()) {
        return json({ error: "invalid" }, { status: 400 });
      }
      const trimmed = text.trim().slice(0, 120);
      const today = todayKeyFor(await loadState(roomId));

      // guessMatches() (exact/substring) is the fast, free first check.
      // aiGuessMatches() is the generous fallback — catches a paraphrase,
      // synonym, or typo-past-what-substring-forgives that's still clearly
      // the right answer. It's a network call, so it has to happen here,
      // before the atomic save below, rather than inside saveState()'s
      // synchronous mutator. If the puzzle changes out from under us
      // between this peek and the save (new photo loaded, guess already
      // answered elsewhere), the guard checks inside the mutator still
      // protect against a guess landing on the wrong puzzle — that one
      // unlucky request just falls back to the plain guessMatches() check,
      // same as before this existed.
      const peeked = await loadState(roomId);
      const peekedAnswer = peeked.puzzleAnswer;
      let correct = peekedAnswer ? guessMatches(trimmed, peekedAnswer) : false;
      if (!correct && peekedAnswer) {
        const aiVerdict = await aiGuessMatches(trimmed, peekedAnswer);
        if (aiVerdict === true) correct = true;
      }

      let rejected = false;
      const state = await saveState(roomId, (s) => {
        if (!s.puzzleAnswer || s.puzzleSolved || puzzleUnlockedCount(s) >= PUZZLE_TOTAL) return;
        if (s.puzzleSetBy && who === s.puzzleSetBy) { rejected = true; return; }
        if (s.puzzleLastGuessDate === today) return;
        const finalCorrect = s.puzzleAnswer === peekedAnswer ? correct : guessMatches(trimmed, s.puzzleAnswer);
        s.puzzleLastGuessDate = today;
        s.puzzleLastGuessBy = who;
        s.puzzleLastGuessText = trimmed;
        s.puzzleLastGuessCorrect = finalCorrect;
        if (finalCorrect) {
          s.puzzleSolved = true;
          s.puzzleSolvedCount = (s.puzzleSolvedCount || 0) + 1;
          s.puzzlePendingBonus = true;
        }
      });
      if (rejected) return json({ error: "setter_cannot_guess" }, { status: 403 });
      return json(forClient(state));
    }

    if (req.method === "GET" && restPath === "/api/puzzle-image") {
      const id = url.searchParams.get("id") || "";
      if (!/^[a-zA-Z0-9-]+$/.test(id)) return new Response("Not found", { status: 404 });
      try {
        if (useS3 && s3) {
          const file = s3.file(puzzleImageKey(roomId, id));
          if (!(await file.exists())) return new Response("Not found", { status: 404 });
          const bytes = await file.arrayBuffer();
          return new Response(bytes, {
            headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" },
          });
        } else {
          const f = Bun.file(localPuzzlePath(roomId, id));
          if (!(await f.exists())) return new Response("Not found", { status: 404 });
          const bytes = await f.arrayBuffer();
          return new Response(bytes, {
            headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" },
          });
        }
      } catch {
        return new Response("Not found", { status: 404 });
      }
    }

    if (req.method === "GET" && restPath === "/api/translate") {
      const text = (url.searchParams.get("text") || "").slice(0, 4000);
      const langCodeRe = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;
      const targetRaw = url.searchParams.get("target") || "en";
      const target = langCodeRe.test(targetRaw) ? targetRaw : "en";
      const altRaw = url.searchParams.get("alt") || "";
      const alt = langCodeRe.test(altRaw) ? altRaw : "";
      if (!text.trim()) return json({ translated: "" });
      const { translated, via, eff } = await resolveTranslation(text, target, alt);
      console.log("[translate] via=" + via + " eff=" + eff + " ok=" + !!translated);
      return json({ translated });
    }

    if (req.method === "GET" && restPath === "/api/geocode") {
      const lat = url.searchParams.get("lat");
      const lon = url.searchParams.get("lon");
      if (!lat || !lon) return json({ place: "" });
      try {
        const gUrl =
          "https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=" +
          encodeURIComponent(lat) +
          "&lon=" +
          encodeURIComponent(lon) +
          "&zoom=14&addressdetails=1";
        const res = await fetch(gUrl, { headers: { "User-Agent": "NearuneApp/1.0 (personal use)" } });
        if (!res.ok) return json({ place: "" });
        const data: any = await res.json();
        const addr = data.address || {};
        const place = addr.city || addr.town || addr.village || addr.suburb || addr.county || "";
        const region = addr.state || addr.country || "";
        const label = place && region ? place + ", " + region : place || "";
        return json({ place: label });
      } catch {
        return json({ place: "" });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/icon-upload") {
      const body = await readJson(req);
      const key = body && body.key;
      const dataUrl = body && body.dataUrl;
      if ((key !== "favicon" && key !== "touch") || typeof dataUrl !== "string") return json({ error: "invalid" }, { status: 400 });
      const match = dataUrl.match(/^data:image\/png;base64,(.+)$/);
      if (!match) return json({ error: "invalid" }, { status: 400 });
      let bytes: Uint8Array;
      try {
        bytes = Buffer.from(match[1], "base64");
      } catch {
        return json({ error: "invalid" }, { status: 400 });
      }
      if (bytes.length > 2 * 1024 * 1024) return json({ error: "too_large" }, { status: 400 });
      if (useS3 && s3) {
        await s3.file("brand/" + key + ".png").write(bytes, { type: "image/png" });
      } else {
        await Bun.write("./local-icon-" + key + ".png", bytes);
      }
      return json({ ok: true });
    }

    // Universal links: tells iOS that invite links (/j/...) and confirmation
    // links belong to the Nearune app. Must be served as plain JSON at exactly
    // this path, with no redirect. The Team ID comes from existing Apple vars.
    if (req.method === "GET" && url.pathname === "/.well-known/apple-app-site-association") {
      const teamId = Bun.env.APPLE_TEAM_ID || Bun.env.APNS_TEAM_ID || Bun.env.APPLE_WEATHERKIT_TEAM_ID || "";
      if (!teamId) return new Response("Not found", { status: 404 });
      const body = {
        applinks: {
          details: [
            { appIDs: [teamId + ".com.nearune.app"], components: [{ "/": "/j/*" }, { "/": "/r/*/api/confirm" }] },
          ],
        },
      };
      return new Response(JSON.stringify(body), { headers: { "content-type": "application/json", "cache-control": "public, max-age=300" } });
    }

    // Android app links: tells Android that invite links (/j/...) open the
    // Nearune app. The SHA-256 fingerprint(s) of the app's signing key come
    // from ANDROID_SHA256_FINGERPRINTS (comma-separated, from Play Console →
    // App integrity → App signing, plus the upload key if testing locally).
    if (req.method === "GET" && url.pathname === "/.well-known/assetlinks.json") {
      const fps = (Bun.env.ANDROID_SHA256_FINGERPRINTS || "").split(",").map((x) => x.trim()).filter(Boolean);
      if (!fps.length) return new Response("Not found", { status: 404 });
      const body = [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: "com.nearune.app", sha256_cert_fingerprints: fps } }];
      return new Response(JSON.stringify(body), { headers: { "content-type": "application/json", "cache-control": "public, max-age=300" } });
    }

    // The Never Have I Ever how-to clip. iOS needs Range support to play video.
    if (req.method === "GET" && url.pathname === "/nhie-howto.mp4") {
      const f = Bun.file(import.meta.dir + "/nhie-howto.mp4");
      if (!(await f.exists())) return new Response("Not found", { status: 404 });
      const size = f.size;
      const base = { "content-type": "video/mp4", "accept-ranges": "bytes", "cache-control": "public, max-age=86400" };
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") || "");
      if (m && (m[1] || m[2])) {
        let start = m[1] ? parseInt(m[1], 10) : Math.max(0, size - parseInt(m[2], 10));
        let end = m[1] && m[2] ? parseInt(m[2], 10) : size - 1;
        if (end >= size) end = size - 1;
        if (start > end || start >= size) return new Response(null, { status: 416, headers: { "content-range": "bytes */" + size } });
        return new Response(f.slice(start, end + 1), { status: 206, headers: { ...base, "content-range": "bytes " + start + "-" + end + "/" + size, "content-length": String(end - start + 1) } });
      }
      return new Response(f, { headers: { ...base, "content-length": String(size) } });
    }

    if (req.method === "GET" && url.pathname === "/google-play-badge.svg") {
      return new Response(GOOGLE_PLAY_BADGE_SVG, {
        headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" },
      });
    }

    if (req.method === "GET" && url.pathname === "/google-play-badge.png") {
      return new Response(Buffer.from(GOOGLE_PLAY_BADGE_PNG_B64, "base64"), {
        headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" },
      });
    }

    if (req.method === "GET" && url.pathname === "/app-store-badge.png") {
      return new Response(Buffer.from(APP_STORE_BADGE_B64, "base64"), {
        headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" },
      });
    }

    if (req.method === "GET" && (url.pathname === "/favicon.png" || url.pathname === "/favicon.ico" || url.pathname === "/apple-touch-icon.png")) {
      const key = url.pathname === "/apple-touch-icon.png" ? "touch" : "favicon";
      try {
        if (useS3 && s3) {
          const file = s3.file("brand/" + key + ".png");
          if (!(await file.exists())) return new Response("Not found", { status: 404 });
          return new Response(await file.arrayBuffer(), { headers: { "content-type": "image/png", "cache-control": "public, max-age=3600" } });
        }
        const f = Bun.file("./local-icon-" + key + ".png");
        if (!(await f.exists())) return new Response("Not found", { status: 404 });
        return new Response(await f.arrayBuffer(), { headers: { "content-type": "image/png", "cache-control": "public, max-age=3600" } });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    }

    if (req.method === "GET" && restPath === "/healthz") {
      return new Response("ok");
    }

    return new Response("Not found", { status: 404 });
}

console.log("Nearune listening on " + PORT + " (storage: " + (useS3 ? "s3" : "local file") + ")");
ensurePuzzleMigrated("").catch((err) => console.error("[puzzle-migrate] failed", err));

// Rooms where someone tapped "create" but nobody ever registered pile up in
// the admin list. Once a day, remove ones that are over 7 days old with no
// people, no answers and no puzzle. Rooms with any registered person, and the
// original room, are never touched.
// ---- Invite links: 3 days, with reminders on days 1, 2 and 3 ------------
// A partner invite link works for 3 days from when it was made. While it's
// waiting, the person who sent it (if they have notifications on) gets up to
// three reminders: after 1 day, 2 days, and on the last day before it
// expires. Then the link is deleted; the next time the inviter opens their
// room the app makes them a fresh link. Reminders only go out between 9 AM
// and 9 PM the inviter's time. Not for Make a friend rooms (those close on
// their own after 24 hours). Checked every 10 minutes. There's also one
// reminder 1 hour after the invite was sent if they still haven't joined.
const INVITE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const HOUR_NUDGE_MS = 60 * 60 * 1000;
function inviteLive(inv: { at: string }): boolean {
  const t = Date.parse(inv.at);
  return !isFinite(t) || Date.now() - t < INVITE_TTL_MS;
}
// Two sets of reminders. If the app saw the invite go out (link shared or
// copied, or emailed), they're written to someone who DID send it and is
// waiting on the person they invited. If it never went out, they're about
// sending it for the first time. Day 3 says how many hours are left.
type InviteNudge = { title: (h: number, w: string) => string; body: (h: number, w: string) => string };
// Reminders name the person, not the app: "your partner", "your friend".
// w is that phrase; cap() starts a sentence with it.
function invitedLabel(rel: string | undefined): string {
  return rel === "significant_other" ? "your partner" : rel === "family" ? "your family member" : rel === "friend" ? "your friend" : "the person you invited";
}
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const INVITE_NUDGE_AFTER = [24 * 60 * 60 * 1000, 48 * 60 * 60 * 1000, 60 * 60 * 60 * 1000];
const hrs = (h: number) => h + (h === 1 ? " hour" : " hours");
const INVITE_NUDGES_SENT: InviteNudge[] = [
  { title: (_h, w) => cap(w) + " hasn't seen today's question yet", body: () => "A quick note from you can help. Tap to send your link again, so you can start answering together." },
  { title: (_h, w) => "Still waiting on " + w, body: () => "It's been 2 days. Send them a little note with your link. One question a day keeps you close." },
  { title: (h) => "Your invite expires in " + hrs(h), body: (_h, w) => cap(w) + " hasn't joined yet. Send one last note so you don't miss starting together." },
];
const INVITE_NUDGES_UNSENT: InviteNudge[] = [
  { title: () => "Who do you wish you talked to more?", body: () => "Your room is ready. Send it to them, and today's question opens for you both." },
  { title: (_h, w) => w === "the person you invited" ? "Today's question is waiting for someone you miss" : "Today's question is waiting for " + w, body: () => "Send your link with one tap, so you can start answering together." },
  { title: (h) => "Your invite link expires in " + hrs(h), body: () => "Send it to someone you'd like to be closer to. After that, open Nearune for a fresh link." },
];
function localHour(tz: string | undefined): number {
  try { return Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz || "America/Los_Angeles" }).format(new Date())); } catch { return 12; }
}
async function inviteSweep(): Promise<void> {
  try {
    const now = Date.now();
    for (const id of await listRoomIds()) {
      let st: any;
      try { st = await loadState(id); } catch { continue; }
      if (st.origin === "friend" || st.closed || !st.pendingInvite) continue;
      for (const other of ["mark", "nikita"] as PersonKey[]) {
        const inv = st.pendingInvite[other];
        if (!inv || !inv.token) continue;
        if (st.people && st.people[other] && st.people[other].confirmed) continue;
        const age = now - Date.parse(inv.at);
        if (!isFinite(age)) continue;
        if (age >= INVITE_TTL_MS) {
          await saveState(id, (s) => {
            const cur = s.pendingInvite && s.pendingInvite[other];
            if (cur && cur.token === inv.token) delete s.pendingInvite![other];
          });
          console.log("[invite-expired] room=" + (id || "main") + " link made " + inv.at);
          continue;
        }
        const inviterKey: PersonKey = other === "mark" ? "nikita" : "mark";
        const sub = st.pushSubs && st.pushSubs[inviterKey];
        if (!sub) continue;
        // One hour after the invite went out with no join yet: one quick
        // reminder to the inviter, before the day 1/2/3 ones.
        {
          const f0 = st.funnel || {};
          const sentAt = Date.parse(String(f0.invite_shared || f0.invite_emailed || ""));
          const sinceSent = now - sentAt;
          if (isFinite(sentAt) && sinceSent >= HOUR_NUDGE_MS && age < INVITE_NUDGE_AFTER[0] && st.inviteHourNudgeToken !== inv.token && !(st.inviteNudgeToken === inv.token && st.inviteNudgeCount)) {
            const inv0 = st.people && st.people[inviterKey];
            const h0 = localHour(inv0 && inv0.tz);
            if (h0 >= 9 && h0 < 21) {
              const w0 = invitedLabel(st.relationship);
              const r0 = await sendPush(sub, { title: cap(w0) + " hasn't joined yet", body: "Today's question is waiting for you both. A quick note from you can help. Tap to send your link again.", tag: "invite-nudge", url: (id ? "/r/" + id : "") + "/?resend=1" } as any);
              if (r0.ok) {
                console.log("[invite-nudge] room=" + (id || "main") + " 1h");
                await saveState(id, (s) => { s.inviteHourNudgeToken = inv.token; });
              }
              if (r0.gone) await saveState(id, (s) => { if (s.pushSubs) delete s.pushSubs[inviterKey]; });
              continue;
            }
          }
        }
        const count = st.inviteNudgeToken === inv.token ? (st.inviteNudgeCount || 0) : 0;
        if (count >= INVITE_NUDGE_AFTER.length || age < INVITE_NUDGE_AFTER[count]) continue;
        const inviter = st.people && st.people[inviterKey];
        const h = localHour(inviter && inviter.tz);
        if (h < 9 || h >= 21) continue;
        const hoursLeft = Math.max(1, Math.ceil((INVITE_TTL_MS - age) / (60 * 60 * 1000)));
        const f = st.funnel || {};
        const wasSent = !!(f.invite_shared || f.invite_emailed || inv.instagram || !inv.link);
        const nudge = (wasSent ? INVITE_NUDGES_SENT : INVITE_NUDGES_UNSENT)[count];
        const wN = invitedLabel(st.relationship);
        const res = await sendPush(sub, { title: nudge.title(hoursLeft, wN), body: nudge.body(hoursLeft, wN), tag: "invite-nudge", url: (id ? "/r/" + id : "") + "/?resend=1" } as any);
        if (res.ok) {
          console.log("[invite-nudge] room=" + (id || "main") + " #" + (count + 1));
          await saveState(id, (s) => { s.inviteNudgeAt = new Date().toISOString(); s.inviteNudgeCount = count + 1; s.inviteNudgeToken = inv.token; });
        }
        if (res.gone) await saveState(id, (s) => { if (s.pushSubs) delete s.pushSubs[inviterKey]; });
      }
    }
  } catch (err) {
    console.error("[invite-sweep] failed", err);
  }
}
setTimeout(inviteSweep, 4 * 60 * 1000);
// Every 10 minutes, so the 1-hour reminder goes out close to the hour.
setInterval(inviteSweep, 10 * 60 * 1000);

// Rooms nobody ever signed up in (someone tapped "Invite your first Nearune
// partner" and left the form) are removed 24 hours after the last sign-up
// activity in them. Nothing was entered, so nothing is lost; if the person
// comes back later the app simply makes them a new room. Checked hourly.
async function purgeEmptyRooms(): Promise<void> {
  try {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    let removed = 0;
    for (const id of await listRoomIds()) {
      if (!id) continue;
      const st = await loadState(id);
      if (!st.createdAt) continue;
      const times = [new Date(st.createdAt).getTime()].concat(Object.values((st as any).funnel || {}).map((v: any) => new Date(String(v)).getTime()).filter((n: number) => isFinite(n)));
      if (Math.max(...times) > cutoff) continue;
      const people = Object.values(st.people || {}).filter(Boolean).length;
      const pending = Object.keys(st.pendingInvite || {}).length + Object.keys(st.pendingConfirm || {}).length;
      if (people > 0 || pending > 0 || Object.keys(st.answers || {}).length > 0 || st.puzzleCurrentId) continue;
      await deleteRoom(id);
      removed++;
      console.log("[room-purge] removed empty room " + id + " (created " + st.createdAt + ")");
    }
    if (removed) regToday.day = ""; // recount today's rooms next time
  } catch (err) {
    console.error("[room-purge] failed", err);
  }
}
// Emails kept for reminders are dropped after 7 days even if never confirmed.
async function purgeStaleEmails(): Promise<void> {
  try {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const id of await listRoomIds()) {
      const st = await loadState(id);
      for (const k of ["mark", "nikita"] as PersonKey[]) {
        const e = st.pendingConfirm && st.pendingConfirm[k];
        if (e && e.email && new Date(e.at).getTime() < cutoff) {
          await saveState(id, (s) => { const x = s.pendingConfirm && s.pendingConfirm[k]; if (x) delete x.email; });
          console.log("[email-purge] dropped kept email for room " + (id || "main") + " " + k);
        }
      }
    }
  } catch (err) {
    console.error("[email-purge] failed", err);
  }
}
// "Make a friend" no-shows: if one person signed up but their match hasn't
// within 24 hours of being matched, close the room and tell the person who
// showed up, so they can find a new friend instead of waiting forever.
const FRIEND_NO_SHOW_MS = 24 * 60 * 60 * 1000;
async function sweepFriendNoShows(): Promise<void> {
  try {
    const now = Date.now();
    for (const id of await listRoomIds()) {
      if (!id) continue;
      let st: any;
      try { st = await loadState(id); } catch { continue; }
      if (st.origin !== "friend" || st.closed) continue;
      const keys: PersonKey[] = ["mark", "nikita"];
      const joined = keys.filter((k) => st.people && st.people[k]);
      if (joined.length === 2) continue;
      const missing = keys.filter((k) => !(st.people && st.people[k]));
      const invAt = missing
        .map((k) => st.pendingInvite && (st.pendingInvite as any)[k] && (st.pendingInvite as any)[k].at)
        .filter(Boolean)
        .map((a: string) => new Date(a).getTime());
      const matchedAt = invAt.length ? Math.min(...invAt) : (st.createdAt ? new Date(st.createdAt).getTime() : NaN);
      if (!isFinite(matchedAt) || now - matchedAt < FRIEND_NO_SHOW_MS) continue;
      await saveState(id, (s) => { s.closed = true; s.closedBy = "no_show"; });
      console.log("[friend] no-show closed room=" + id + " joined=" + joined.length + " waited=" + Math.round((now - matchedAt) / 3600000) + "h");
      for (const k of joined) {
        const sub = st.pushSubs && st.pushSubs[k];
        if (!sub) continue;
        sendPush(sub, {
          title: "Your match didn't show up",
          body: "Sorry about that. Tap to find a new friend on Nearune.",
          tag: "friend-no-show",
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error("[friend-no-show] failed", err);
  }
}
// One-time apology notes (Nov 23, 2026; wording approved by Mark). Each listed room gets a note at the top of the room
// (until dismissed on that phone) and a push to anyone there who turned notifications on. Runs once, ever: a side
// file records that it was done, so restarts don't send it again.
const APOLOGY_FILE = "apology-2026-11-23.json";
const APOLOGIES: { rooms: string[]; title: string; body: string }[] = [
  {
    rooms: ["tidykite74", "cleverviolet46", "velvetlantern74", "breezyacorn62"],
    title: "Sorry about the invite trouble",
    body: "Yesterday Nearune wouldn't accept a phone number in the invite box. That's fixed: you can now text your invite straight from your room. Your link works for 3 days.",
  },
  {
    rooms: ["velvetmoon24", "mellowlotus85"],
    title: "Sorry, your match isn't coming back",
    body: "The person you were matched with left Nearune. Tap Make a friend again and we'll find you someone who's here, or start a room with someone you know.",
  },
];
async function sendApologiesOnce(): Promise<void> {
  try {
    if (await readSideFile(APOLOGY_FILE).catch(() => null)) return;
    const pushed = new Set<string>();
    let notes = 0, pushes = 0;
    for (const a of APOLOGIES) {
      for (const rid of a.rooms) {
        if (!(await roomExists(rid))) { console.log("[apology] room " + rid + " is gone, skipped"); continue; }
        const st = await saveState(rid, (s) => { s.notice = { id: APOLOGY_FILE, title: a.title, body: a.body, at: new Date().toISOString() }; });
        notes++;
        for (const who of ["mark", "nikita"] as PersonKey[]) {
          const sub: any = st.pushSubs && st.pushSubs[who];
          if (!sub) continue;
          const key = sub.token || sub.endpoint || "";
          if (!key || pushed.has(key)) continue;
          pushed.add(key);
          const res = await sendPush(sub, { title: a.title, body: a.body, tag: "apology", url: "/r/" + rid + "/" } as any);
          if (res.ok) pushes++;
          console.log("[apology] room " + rid + " " + who + " push " + (res.ok ? "sent" : "failed"));
        }
      }
    }
    await writeSideFile(APOLOGY_FILE, JSON.stringify({ at: new Date().toISOString(), notes, pushes }));
    console.log("[apology] done: " + notes + " room notes, " + pushes + " pushes sent");
  } catch (e) {
    console.error("[apology] failed", e);
  }
}
setTimeout(sendApologiesOnce, 90 * 1000);
setTimeout(sweepFriendNoShows, 3 * 60 * 1000);
setInterval(sweepFriendNoShows, 60 * 60 * 1000);
setTimeout(purgeStaleEmails, 6 * 60 * 1000);
setInterval(purgeStaleEmails, 24 * 60 * 60 * 1000);
setTimeout(purgeEmptyRooms, 5 * 60 * 1000);
setInterval(purgeEmptyRooms, 60 * 60 * 1000);

// ---- App-icon badge: always the true total, refreshed regularly ----------
// The icon number is the sum of the phone owner's OWN to-dos across all
// their rooms, the same things as the red badges on the home-screen tiles
// (home-page.ts's todoCount): today's question not answered yet, their turn
// at Never Have I Ever, and the puzzle waiting for a photo. It never counts
// what the other person still has to do. Scanned from storage (a short cache
// keeps a burst of pushes from re-reading every room).
function ownTodos(st: State, me: PersonKey): number {
  const other: PersonKey = me === "mark" ? "nikita" : "mark";
  if (st.closed || !st.people || !st.people[me] || !st.people[other]) return 0;
  let n = 0;
  const day = todayKeyFor(st);
  const a = st.answers && st.answers[day];
  if (!(a && a[me] && a[me]!.text)) n++;
  const votes = (st.nhie && st.nhie.votes) || {};
  if (votes[other] && !votes[me]) n++;
  if (st.origin !== "friend" && !st.puzzleCurrentId) n++;
  return n;
}
let badgeScan: { at: number; byToken: Map<string, number> } | null = null;
async function scanBadges(force = false): Promise<Map<string, number>> {
  if (!force && badgeScan && Date.now() - badgeScan.at < 3000) return badgeScan.byToken;
  const byToken = new Map<string, number>();
  const ids = await listRoomIds();
  for (const id of ids) {
    try {
      const st = await loadState(id);
      if (st.closed || !st.pushSubs) continue;
      for (const who of ["mark", "nikita"] as PersonKey[]) {
        const sub: any = st.pushSubs[who];
        if (!sub || sub.kind !== "apns" || !sub.token) continue;
        byToken.set(sub.token, (byToken.get(sub.token) || 0) + ownTodos(st, who));
      }
    } catch (e) {}
  }
  badgeScan = { at: Date.now(), byToken };
  return byToken;
}
setBadgeResolver(async (token) => {
  const m = await scanBadges();
  return m.has(token) ? m.get(token)! : null;
});
// Every 10 minutes, push the right number to any device whose icon is out of
// date (a missed push, a new day, an answer on another device).
const lastBadgeSent = new Map<string, number>();
async function badgeSweep() {
  if (!anyPushConfigured) return;
  try {
    const m = await scanBadges(true);
    for (const [token, n] of m) {
      if (lastBadgeSent.get(token) === n) continue;
      const r = await sendPush({ kind: "apns", token } as any, { title: "", body: "", badge: n, tag: "badge-sync", silent: true });
      if (r.ok) lastBadgeSent.set(token, n);
    }
  } catch (err) {
    console.error("[badge-sweep] failed", err);
  }
}
setTimeout(badgeSweep, 60 * 1000);
setInterval(badgeSweep, 10 * 60 * 1000);
// Forget what was last sent every 6 hours so a badge that was cleared by hand
// or never arrived gets corrected even when the number hasn't changed.
setInterval(() => lastBadgeSent.clear(), 6 * 60 * 60 * 1000);

startQaSchedule();
startStatsSchedule();


// Removes a person's shared video (when they share a photo instead, or
// remove what they shared).
async function deleteSharedVideo(roomId: string, who: PersonKey): Promise<void> {
  try {
    if (useS3 && s3) await s3.file(videoKey(roomId, who)).delete();
    else await Bun.file(localVideoPath(roomId, who)).delete();
  } catch {}
}


// Converts a shared video to H.264 + AAC in an MP4 (at most 1280px on the
// long side), the one format every iPhone and Android plays. iPhones often
// record HEVC, which many Android phones can't play. Runs ffmpeg (installed
// on Railway via RAILPACK_DEPLOY_APT_PACKAGES=ffmpeg). Swaps the stored file
// only if the person hasn't shared something else in the meantime.
async function convertSharedVideo(roomId: string, who: PersonKey, sharedAt: string, bytes: Uint8Array): Promise<void> {
  const ff = Bun.which("ffmpeg");
  if (!ff) { console.log("[video] ffmpeg not installed: video kept as uploaded"); return; }
  const tag = (roomId || "legacy") + "-" + who + "-" + Date.now();
  const inPath = "/tmp/nr-video-in-" + tag;
  const outPath = "/tmp/nr-video-out-" + tag + ".mp4";
  const started = Date.now();
  try {
    await Bun.write(inPath, bytes);
    const proc = Bun.spawn([ff, "-y", "-loglevel", "error", "-i", inPath, "-t", "61",
      "-vf", "scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", outPath], { stdout: "ignore", stderr: "pipe" });
    const killer = setTimeout(() => { try { proc.kill(); } catch {} }, 240000);
    const code = await proc.exited;
    clearTimeout(killer);
    if (code !== 0) {
      let err = "";
      try { err = (await new Response(proc.stderr).text()).slice(0, 300); } catch {}
      console.log("[video] ffmpeg exit " + code + ": " + err);
      return;
    }
    const out = new Uint8Array(await Bun.file(outPath).arrayBuffer());
    if (out.length < 1000) { console.log("[video] converted file empty"); return; }
    const now = await loadState(roomId);
    const p = now.people && now.people[who];
    if (!p || p.photoKind !== "video" || p.photoAt !== sharedAt) return; // replaced meanwhile
    if (useS3 && s3) await s3.file(videoKey(roomId, who)).write(out, { type: "video/mp4" });
    else await Bun.write(localVideoPath(roomId, who), out);
    await saveState(roomId, (s) => {
      const q = s.people && s.people[who];
      if (q && q.photoKind === "video" && q.photoAt === sharedAt) { q.videoType = "video/mp4"; q.videoV = Date.now(); }
    });
    console.log("[video] converted room=" + (roomId || "legacy") + " who=" + who + " " + Math.round(bytes.length / 1024) + "KB -> " + Math.round(out.length / 1024) + "KB in " + Math.round((Date.now() - started) / 1000) + "s");
  } finally {
    try { await Bun.file(inPath).delete(); } catch {}
    try { await Bun.file(outPath).delete(); } catch {}
  }
}


// ---- Permanent room numbers ---------------------------------------------
// Each room gets a number once someone signs up in it (#1, #2, ...), kept in
// the room and never changed, so the admin page's "Room 12" always means the
// same room. Rooms without one are numbered in the order they were made
// (the original room first). Runs right after a sign-up and hourly.
let numbering: Promise<void> = Promise.resolve();
function numberRooms(): Promise<void> {
  numbering = numbering.then(async () => {
    try {
      const rooms: { id: string; no?: number; created: number }[] = [];
      for (const id of await listRoomIds()) {
        let st: any;
        try { st = await loadState(id); } catch { continue; }
        if (!Object.values(st.people || {}).some((p: any) => p && p.name)) continue;
        rooms.push({ id, no: st.roomNo, created: id === "" ? 0 : (st.createdAt ? Date.parse(st.createdAt) : 1) });
      }
      let next = rooms.reduce((m, r) => Math.max(m, r.no || 0), 0) + 1;
      for (const r of rooms.filter((r) => !r.no).sort((a, b) => a.created - b.created || a.id.localeCompare(b.id))) {
        const n = next++;
        await saveState(r.id, (s) => { if (!s.roomNo) s.roomNo = n; });
        console.log("[room-number] " + (r.id || "main") + " is room #" + n);
      }
    } catch (err) {
      console.error("[room-number] failed", err);
    }
  });
  return numbering;
}
setTimeout(numberRooms, 2 * 60 * 1000);
setInterval(numberRooms, 60 * 60 * 1000);

// A room just got its first sign-up: number it, and recount today's rooms
// for the daily cap and the "N new rooms today" Slack note.
function roomSignedUp(roomId: string): void {
  numberRooms().catch(() => {});
  regToday.day = "";
  roomsCreatedToday().then((n) => notifyRoomMilestone(n)).catch(() => {});
}

// ---- Approximate city from the internet connection ----------------------
const ipCityCache = new Map<string, { at: number; label: string }>();
async function approxCity(ip: string): Promise<string> {
  if (!ip || ip === "unknown" || /^(127\.|10\.|192\.168\.|::1)/.test(ip)) return "";
  const hit = ipCityCache.get(ip);
  if (hit && Date.now() - hit.at < 60 * 60 * 1000) return hit.label;
  let label = "";
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 3000);
    const res = await fetch("https://ipapi.co/" + encodeURIComponent(ip) + "/json/", { signal: ctl.signal, headers: { "user-agent": "nearune.ai" } });
    clearTimeout(timer);
    if (res.ok) {
      const d: any = await res.json();
      const city = String(d.city || "").trim();
      if (city && !d.error) {
        label = d.country_code === "US" && d.region_code ? city + ", " + d.region_code : city + (d.country_name ? ", " + d.country_name : "");
      }
    }
  } catch {}
  ipCityCache.set(ip, { at: Date.now(), label });
  return label;
}
