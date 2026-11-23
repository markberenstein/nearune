import { topLocalStory, storyFits } from "./localnews";
// Admin snapshot: room counts, city-level user locations (no names), and
// ElevenLabs usage. Logged as one "[stats] {json}" line every hour on the hour
// Pacific (and shortly after boot); scheduled tasks read the latest line from
// the logs. The full run (QA, music, voice, local news, WeatherKit, usage
// checks) happens at 12:00 and 00:00 and after boot. The other hourly runs
// recount rooms and people and carry the checks over from the last full run,
// so every line has the same keys; "full" says which kind it is and "fullAt"
// when the carried-over checks ran.
import { listRoomIds, loadState, readSideFile, writeSideFile } from "./storage";
import { resolveCoords, resolveCountryCode } from "./geo";
import { topSongs, previewClip, trackRef } from "./music";
import { runQa } from "./qa";
import { weatherKitConfigured, weatherKitCurrentWeather } from "./weatherkit";
import { elevenLabsUsage, voiceSelfTest, parseVoiceSample, voiceWritePermissionTest, defaultVoiceId } from "./voice";
import { claudeUsageSummary } from "./usage";

// Railway project cost, via Railway's GraphQL API. Needs RAILWAY_API_TOKEN (an account token). Returns null when unset or on any failure.
async function railwayUsage() {
  const tok = Bun.env.RAILWAY_API_TOKEN;
  if (!tok) return null;
  const pid = Bun.env.RAILWAY_PROJECT_ID;
  if (!pid) return null;
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const meas = ["MEMORY_USAGE_GB", "CPU_USAGE", "NETWORK_TX_GB"];
  // $ per unit: memory per GB-minute, CPU per vCPU-minute, egress per GB.
  const rate: Record<string, number> = { MEMORY_USAGE_GB: 0.000231, CPU_USAGE: 0.000463, NETWORK_TX_GB: 0.05 };
  const gql = async (query: string) => {
    const r = await fetch("https://backboard.railway.com/graphql/v2", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + tok }, body: JSON.stringify({ query }) });
    const j: any = await r.json();
    if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 200));
    return j.data;
  };
  try {
    const m = JSON.stringify(meas).replace(/"/g, "");
    const cur = await gql("query { usage(projectId: \"" + pid + "\", measurements: " + m + ", startDate: \"" + start + "\") { measurement value } }");
    const est = await gql("query { estimatedUsage(projectId: \"" + pid + "\", measurements: " + m + ") { measurement estimatedValue } }");
    const sum = (rows: any[], f: string) => { const o: Record<string, number> = {}; for (const x of rows || []) o[x.measurement] = (o[x.measurement] || 0) + Number(x[f] || 0); return o; };
    const c = sum(cur.usage, "value"), e = sum(est.estimatedUsage, "estimatedValue");
    const cost = (o: Record<string, number>) => ({ memory: +(o.MEMORY_USAGE_GB * rate.MEMORY_USAGE_GB || 0).toFixed(2), cpu: +(o.CPU_USAGE * rate.CPU_USAGE || 0).toFixed(2), egress: +(o.NETWORK_TX_GB * rate.NETWORK_TX_GB || 0).toFixed(2) });
    const cc = cost(c), ee = cost(e);
    return { current: { ...cc, total: +(cc.memory + cc.cpu + cc.egress).toFixed(2) }, estimated: { ...ee, total: +(ee.memory + ee.cpu + ee.egress).toFixed(2) } };
  } catch (err: any) { return { error: String(err?.message || err).slice(0, 160) }; }
}

const coordCache = new Map<string, { lat: number; lon: number; city: string; country: string; region?: string; tz?: string } | null>();

// How far a room got through setup, in plain words (for the admin list).
function furthestStep(st: any, ppl: any[], answeredDays: number): string {
  const f = (st && st.funnel) || {};
  const allConfirmed = ppl.length >= 2 && ppl.every((p: any) => p.confirmed);
  if (answeredDays > 0) return "answered a question";
  if (allConfirmed) return "partner joined";
  if (f.invite_shared || f.invite_emailed) return "sent the invite";
  if (st && st.pendingInvite && Object.keys(st.pendingInvite).length > 0) return "invite ready, not sent yet";
  if (ppl.some((p: any) => p.confirmed)) return "registered";
  if (ppl.length > 0) return "registered, not confirmed";
  if (f.reg_clicked) return "clicked Continue (didn't finish)";
  if (f.reg_name) return "typed name";
  if (f.reg_city) return "typed city";
  if (f.reg_screen) return "saw the sign-up form";
  if (f.fq_friend) return "chose Make a friend instead";
  if (f.fq_sent) return "answered, didn't reach sign-up";
  if (f.fq_typed) return "typed an answer";
  if (f.fq_question) return "saw today's question";
  if (f.fq_who) return "saw who-it's-for";
  return "created room only";
}

// Last full snapshot, so the light hourly runs can carry its checks over.
let lastFull: any = null;

export async function computeStats(full = true) {
  const ids = await listRoomIds();
  let rooms = 0, active = 0, people = 0, answered = 0, bothWeek = 0;
  // Rooms where both people answered on at least one of the last 7 days
  // (the closest single number to "active users").
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const voiceIds: { room: number; who: string; id: string }[] = [];
  const roomList: { n: number; created: string | null; status: string; answeredDays: number; lastAnswer: string | null; furthest: string; funnel: Record<string, string>; people: { name: string; location: string; confirmed: boolean; notify?: boolean }[]; bothWeek?: boolean; remindedAt?: string | null }[] = [];
  const locByCountry = new Map<string, string>();
  const newsLocs = new Set<string>();
  const byCity = new Map<string, { city: string; country: string; region?: string; tz?: string; lat: number; lon: number; n: number; people: { name: string; partner: string; partnerLoc: string }[]; wk?: { ok: boolean; ms: number | null } }>();
  // Sign-up funnel for the last 24 hours: people who opened the sign-up form
  // vs. people who finished. Unfinished ones aren't rooms and aren't listed.
  let signupsStarted = 0, signupsFinished = 0;
  // Which app each signed-up person uses, from their notification sign-up
  // (iPhone app, Android app, or browser). People with notifications off
  // aren't counted, so the total can be lower than People.
  const platform = { ios: 0, android: 0, web: 0 };
  // Where unfinished sign-ups (last 24 hours) stopped, and which form errors
  // they hit. These rooms aren't in the room list, so this is the only place
  // they show up.
  const abandoned: Record<string, number> = {};
  const abandonedErrors: Record<string, number> = {};
  const dayAgo = Date.now() - 86400000;
  for (const id of ids) {
    let st: any;
    try { st = await loadState(id); } catch { continue; }
    const signedUp = Object.values(st?.people || {}).some((p: any) => p && p.name);
    const recent = !!(st?.createdAt && Date.parse(st.createdAt) >= dayAgo);
    if (recent) { signupsStarted++; if (signedUp) signupsFinished++; }
    if (recent && !signedUp) {
      const step = furthestStep(st, [], 0);
      abandoned[step] = (abandoned[step] || 0) + 1;
      const f = (st && st.funnel) || {};
      for (const k of Object.keys(f)) if (k.startsWith("reg_err_")) abandonedErrors[k.slice(8)] = (abandonedErrors[k.slice(8)] || 0) + 1;
    }
    if (!signedUp) continue;
    rooms++;
    try { if (Object.values(st?.answers || {}).some((day: any) => day && (day.mark || day.nikita))) answered++; } catch {}
    let both7 = false;
    try { both7 = Object.entries(st?.answers || {}).some(([d, day]: any) => d >= weekAgo && day && day.mark && day.nikita); } catch {}
    if (both7) bothWeek++;
    const ppl = ["mark", "nikita"].map((k) => st?.people?.[k]).filter(Boolean);
    people += ppl.length;
    if (ppl.length === 2 && ppl.every((p: any) => p.confirmed)) active++;
    if (ppl.length === 2 && ppl.every((p: any) => p.confirmed)) for (const p of ppl) { const l = String((p as any).location || "").trim(); if (l) newsLocs.add(l); }
    try {
      const days = Object.entries(st?.answers || {}).filter(([, day]: any) => day && (day.mark || day.nikita)).map(([d]) => d).sort();
      roomList.push({
        n: st?.roomNo || 0,
        created: st?.createdAt || null,
        status: ppl.length === 2 && ppl.every((p: any) => p.confirmed) ? "active" : ppl.length < 2 ? "waiting for partner" : "partner not confirmed",
        answeredDays: days.length,
        bothWeek: both7,
        lastAnswer: days.length ? days[days.length - 1] : null,
        furthest: furthestStep(st, ppl, days.length),
        funnel: (st?.funnel && typeof st.funnel === "object") ? st.funnel : {},
        people: ["mark", "nikita"].filter((k) => st?.people?.[k]).map((k) => { const p: any = st.people[k]; return { name: String(p.name || "(no name)").slice(0, 40), location: String(p.location || "").slice(0, 60), confirmed: !!p.confirmed, notify: !!st?.pushSubs?.[k] }; }),
        remindedAt: st?.adminInviteRemindAt || null,
      });
    } catch {}
    for (const k of ["mark", "nikita"]) {
      const p = st?.people?.[k]; if (!p) continue;
      const sub = st?.pushSubs?.[k];
      if (sub) platform[sub.kind === "apns" ? "ios" : sub.kind === "fcm" ? "android" : "web"]++;
      if (p.voiceId) voiceIds.push({ room: st?.roomNo || rooms, who: String(p.name || k).slice(0, 30), id: String(p.voiceId) });
      const o = st?.people?.[k === "mark" ? "nikita" : "mark"];
      const loc = String(p.location || "").trim();
      if (!loc) continue;
      if (!coordCache.has(loc)) coordCache.set(loc, await resolveCoords(loc).catch(() => null));
      const c = coordCache.get(loc);
      if (!c) continue;
      if (c.country && !locByCountry.has(c.country)) locByCountry.set(c.country, loc);
      const key = c.lat.toFixed(1) + "," + c.lon.toFixed(1);
      const e = byCity.get(key);
      const who = { name: String(p.name || "(no name)").slice(0, 40), partner: o ? String(o.name || "(no name)").slice(0, 40) : "(waiting for partner)", partnerLoc: o ? String(o.location || "").slice(0, 60) : "" };
      if (e) { e.n++; e.people.push(who); } else byCity.set(key, { city: c.city, country: c.country, region: c.region || "", tz: c.tz || "", lat: +c.lat.toFixed(2), lon: +c.lon.toFixed(2), n: 1, people: [who] });
    }
  }
  roomList.sort((a, b) => (a.n || 1e9) - (b.n || 1e9));
  if (!full && lastFull) {
    // Light hourly run: fresh counts, checks carried over from the last full run.
    const prevWk = new Map<string, any>();
    for (const c of lastFull.cities || []) if (c && c.wk) prevWk.set(Number(c.lat).toFixed(1) + "," + Number(c.lon).toFixed(1), c.wk);
    for (const c of byCity.values()) { const w = prevWk.get(c.lat.toFixed(1) + "," + c.lon.toFixed(1)); if (w) c.wk = w; }
    // Cities that showed up since the last full run get tested now, so they
    // don't sit with no WeatherKit result until noon or midnight.
    if (weatherKitConfigured()) {
      const fresh = [...byCity.values()].filter((c) => !c.wk);
      for (let i = 0; i < fresh.length; i += 6) {
        await Promise.all(fresh.slice(i, i + 6).map(async (c) => {
          const t0 = Date.now();
          try { const w = await weatherKitCurrentWeather(c.lat, c.lon); c.wk = { ok: !!w, ms: Date.now() - t0 }; }
          catch { c.wk = { ok: false, ms: Date.now() - t0 }; }
        }));
      }
    }
    return {
      at: new Date().toISOString(),
      rooms, activeRooms: active, answeredRooms: answered, bothWeekRooms: bothWeek, people, roomList, signups: { started: signupsStarted, finished: signupsFinished, abandoned, abandonedErrors }, platform,
      cities: [...byCity.values()].sort((a, b) => b.n - a.n),
      qa: lastFull.qa,
      weatherkit: lastFull.weatherkit,
      claude: lastFull.claude,
      railway: lastFull.railway,
      elevenlabs: lastFull.elevenlabs,
      full: false,
      fullAt: lastFull.at,
    };
  }
  const u = await elevenLabsUsage();
  // Music player health: for each country our people are in (max 6), is the
  // Apple chart reachable and do the top-5 song previews actually fetch?
  const music: { country: string; chart: boolean; previewsOk: number; total: number; songs: { label: string; ok: boolean }[] }[] = [];
  for (const [country, loc] of [...locByCountry].slice(0, 6)) {
    try {
      let chart = await topSongs(loc, 5);
      // Apple's chart feed fails briefly and at random; retry up to twice, bypassing the short failure cache, before calling it down.
      for (let r = 0; r < 2 && (!chart || !chart.length); r++) { await new Promise((res) => setTimeout(res, 6000)); chart = await topSongs(loc, 5, true); }
      if (!chart || !chart.length) { music.push({ country, chart: false, previewsOk: 0, total: 0, songs: [] }); continue; }
      const res = await Promise.all(chart.map((e) => previewClip(e.title, e.artist, trackRef(e.url)).then((c) => !!c).catch(() => false)));
      music.push({ country, chart: true, previewsOk: res.filter(Boolean).length, total: res.length, songs: chart.map((e, i) => ({ label: "#" + e.rank + " " + e.title + (e.artist ? " - " + e.artist : ""), ok: res[i] })) });
    } catch { music.push({ country, chart: false, previewsOk: 0, total: 0, songs: [] }); }
  }
  let qa: any = null;
  try { const r = await runQa(); qa = { at: r.at, ok: r.ok, failures: r.failures, fixed: r.fixed, checks: r.checks }; } catch {}
  // WeatherKit connection test for every city (the same call the app makes
  // for a person's background). It used to stop at 20 cities, so places past
  // the 20th showed no result. Runs 6 at a time to stay gentle on WeatherKit.
  if (weatherKitConfigured()) {
    const cityList = [...byCity.values()];
    for (let i = 0; i < cityList.length; i += 6) {
      await Promise.all(cityList.slice(i, i + 6).map(async (c) => {
        const t0 = Date.now();
        try {
          const w = await weatherKitCurrentWeather(c.lat, c.lon);
          c.wk = { ok: !!w, ms: Date.now() - t0 };
        } catch { c.wk = { ok: false, ms: Date.now() - t0 }; }
      }));
    }
  }
  // WeatherKit connection test: one live call for a fixed point (San Mateo).
  const wk: { ok: boolean; configured: boolean; ms: number | null; detail: string } = { ok: false, configured: weatherKitConfigured(), ms: null, detail: "" };
  if (!wk.configured) wk.detail = "WeatherKit keys not set";
  else {
    const t0 = Date.now();
    try {
      const w = await weatherKitCurrentWeather(37.56, -122.33);
      wk.ms = Date.now() - t0;
      wk.ok = !!w;
      wk.detail = w ? Math.round(w.tempC) + " C, " + w.conditionCode : "no data returned";
    } catch (e: any) { wk.ms = Date.now() - t0; wk.detail = "error: " + String(e?.message || e).slice(0, 80); }
  }
  if (qa && Array.isArray(qa.checks)) {
    const bad = music.filter((m) => !m.chart || m.previewsOk < m.total);
    qa.checks.push({
      name: "Music player (charts and previews)",
      ok: music.length > 0 && bad.length === 0,
      items: music.flatMap((m) => m.chart ? m.songs.map((sg) => ({ label: m.country + " " + sg.label, ok: sg.ok, note: sg.ok ? "preview plays" : "preview failed" })) : [{ label: m.country + " chart", ok: false, note: "chart unavailable" }]),
      detail: music.length === 0 ? "no countries to test"
        : bad.length ? bad.map((m) => m.country + (m.chart ? " " + m.previewsOk + "/" + m.total + " previews" : " chart unavailable")).join("; ")
        : music.length + " countries, all charts load and " + music.reduce((a, m) => a + m.total, 0) + " previews download",
    });
    const mc = qa.checks[qa.checks.length - 1];
    if (!mc.ok) { qa.ok = false; qa.failures.push("Music player: " + mc.detail); }
  }
  // Voice playback: speak one word in up to 3 real cloned voices (or just ping ElevenLabs when none are saved).
  if (qa && Array.isArray(qa.checks)) {
    const tests = voiceIds.length ? voiceIds.slice(0, 3) : [null];
    const vitems: { label: string; ok: boolean; note: string }[] = [];
    for (const v of tests) {
      let r: { ok: boolean; detail: string };
      try { r = await voiceSelfTest(v ? v.id : null); } catch (e: any) { r = { ok: false, detail: String(e?.message || e).slice(0, 120) }; }
      vitems.push({ label: v ? "Room " + v.room + " - " + v.who : "ElevenLabs account", ok: r.ok, note: r.detail });
    }
    // The stock voice everyone hears until they record their own.
    try {
      const sid = await defaultVoiceId("female");
      const sr = await voiceSelfTest(sid);
      vitems.push({ label: "Stock voice (before someone records)", ok: sr.ok, note: sr.detail.replace("cloned voice", "stock voice") });
    } catch (e: any) { vitems.push({ label: "Stock voice (before someone records)", ok: false, note: String(e?.message || e).slice(0, 120) }); }
    const vbad = vitems.filter((i) => !i.ok);
    qa.checks.push({ name: "Voice playback (cloned voices)", ok: vbad.length === 0, items: vitems, detail: vbad.length ? vbad.map((i) => i.label + ": " + i.note).join("; ") : "all tested voices spoke" });
    if (vbad.length) { qa.ok = false; qa.failures.push("Voice playback: " + vbad.map((i) => i.label + ": " + i.note).join("; ")); }
  }
  // Voice recording (save path): runs a stand-in recording in each format
  // phones and browsers send through the same checks /api/voice-sample uses.
  // Stops before ElevenLabs, so it costs nothing and uses no voice slot.
  if (qa && Array.isArray(qa.checks)) {
    const fake = Buffer.alloc(24000, 7).toString("base64");
    const formats: [string, string, string][] = [
      ["Chrome / Android recording", "audio/webm;codecs=opus", "webm"],
      ["Plain webm", "audio/webm", "webm"],
      ["iPhone Safari recording", "audio/mp4;codecs=mp4a.40.2", "mp4"],
      ["iPhone Safari (no codec)", "audio/mp4", "mp4"],
      ["Voice Memos file (.m4a)", "audio/x-m4a", "m4a"],
      ["MP3 file", "audio/mpeg", "mp3"],
      ["File with no type", "", "webm"],
    ];
    const ritems: { label: string; ok: boolean; note: string }[] = [];
    for (const [label, type, ext] of formats) {
      const r = parseVoiceSample("data:" + type + ";base64," + fake);
      if (!r.ok) ritems.push({ label, ok: false, note: "rejected: " + r.error });
      else if (r.ext !== ext) ritems.push({ label, ok: false, note: "accepted but sent to ElevenLabs as ." + r.ext + " (expected ." + ext + ")" });
      else ritems.push({ label, ok: true, note: "accepted as ." + r.ext });
    }
    // And the guard rails still hold.
    const tiny = parseVoiceSample("data:audio/webm;base64," + Buffer.alloc(500, 7).toString("base64"));
    ritems.push({ label: "Too-short recording", ok: !tiny.ok && tiny.error === "too_short", note: tiny.ok ? "wrongly accepted" : "rejected: " + tiny.error });
    const junk = parseVoiceSample("not a recording");
    ritems.push({ label: "Garbage upload", ok: !junk.ok, note: junk.ok ? "wrongly accepted" : "rejected: " + junk.error });
    // And ElevenLabs will actually let us create the voice.
    let perm: { ok: boolean; detail: string };
    try { perm = await voiceWritePermissionTest(); } catch (e: any) { perm = { ok: false, detail: String(e?.message || e).slice(0, 120) }; }
    ritems.push({ label: "ElevenLabs key can create voices", ok: perm.ok, note: perm.detail });
    const rbad = ritems.filter((i) => !i.ok);
    qa.checks.push({ name: "Voice recording (save path)", ok: rbad.length === 0, items: ritems, detail: rbad.length ? rbad.map((i) => i.label + ": " + i.note).join("; ") : formats.length + " recording formats accept; short and garbage uploads rejected; key can create voices" });
    if (rbad.length) { qa.ok = false; qa.failures.push("Voice recording: " + rbad.map((i) => i.label + ": " + i.note).join("; ")); }
  }
  // Video conversion needs ffmpeg on the server (RAILPACK_DEPLOY_APT_PACKAGES=ffmpeg).
  if (qa && Array.isArray(qa.checks)) {
    const ff = Bun.which("ffmpeg");
    let ver = "";
    if (ff) { try { const pr = Bun.spawnSync([ff, "-version"]); ver = new TextDecoder().decode(pr.stdout).split("\n")[0].slice(0, 60); } catch {} }
    const ok = !!ff && !!ver;
    qa.checks.push({ name: "Video conversion (ffmpeg)", ok, items: [{ label: "ffmpeg installed", ok, note: ok ? ver : "missing: shared videos stay as uploaded (HEVC may not play on Android)" }], detail: ok ? ver : "ffmpeg missing" });
    if (!ok) { qa.ok = false; qa.failures.push("Video conversion: ffmpeg missing"); }
  }
  // Quirky local story: every place with an active couple must come back with a story today.
  // Skipped in the first minutes after a restart: the stories are fetched from
  // Google News, which throttles the burst of lookups (the 12:00/00:00 runs cover it).
  if (qa && Array.isArray(qa.checks) && process.uptime() < 600) {
    qa.checks.push({ name: "Quirky local stories (every active place)", ok: true, items: [], detail: "skipped right after a restart (avoids Google News rate limits)" });
  } else if (qa && Array.isArray(qa.checks)) {
    const nitems: { label: string; ok: boolean; note: string }[] = [];
    for (const loc of [...newsLocs].slice(0, 8)) {
      let st: any = null;
      try { st = await topLocalStory(loc); } catch {}
      const onPlace = !!st && storyFits(st, loc);
      nitems.push({ label: loc, ok: onPlace, note: !st ? "no story found today" : !onPlace ? "story does not name " + loc.split(",")[0].trim() + ": " + String(st.headline).slice(0, 80) : (st.near ? "nearby " + st.near + ": " : "") + String(st.headline).slice(0, 80) + (st.source ? " (" + st.source + ")" : "") + (st.access === "free" ? " - opens free" : " - link not verified") });
    }
    const nbad = nitems.filter((i) => !i.ok);
    qa.checks.push({ name: "Quirky local stories (every active place)", ok: nbad.length === 0, items: nitems, detail: nitems.length === 0 ? "no active places" : nbad.length ? nbad.map((i) => i.label).join("; ") + ": no story today (not even from a nearby town), or the story does not name the city" : nitems.length + " places, all have a story" });
    if (nbad.length) { qa.ok = false; qa.failures.push("Local stories: no story for " + nbad.map((i) => i.label).join("; ")); }
  }
  const at = new Date().toISOString();
  lastFull = {
    at,
    rooms, activeRooms: active, answeredRooms: answered, bothWeekRooms: bothWeek, people, roomList, signups: { started: signupsStarted, finished: signupsFinished, abandoned, abandonedErrors }, platform,
    cities: [...byCity.values()].sort((a, b) => b.n - a.n),
    qa,
    weatherkit: wk,
    claude: await claudeUsageSummary().catch(() => null),
    railway: await railwayUsage(),
    elevenlabs: u ? { used: u.used, limit: u.limit, resetsAt: u.resetsAt, voices: u.voices, voiceLimit: u.voiceLimit } : null,
    full: true,
    fullAt: at,
  };
  return lastFull;
}

// Runs the snapshot, logs it, and saves it as admin-stats.json for the admin
// Home page. Concurrent calls share one run. full=false is the light hourly
// run (falls back to a full run if none has happened since boot).
let running: Promise<any> | null = null;
export function refreshStats(full = true): Promise<any> {
  if (!running) {
    running = (async () => {
      const d = await computeStats(full);
      const j = JSON.stringify(d);
      console.log("[stats] " + j);
      try { await writeSideFile("admin-stats.json", j); } catch (e: any) { console.log("[stats] save failed " + (e?.message || e)); }
      // Hourly count history for the admin Home tab (change since yesterday and
      // the little trend lines). Small records only, last 14 days.
      try {
        let hist: any[] = [];
        try { const raw = await readSideFile("admin-stats-history.json"); const p = raw ? JSON.parse(raw) : []; if (Array.isArray(p)) hist = p; } catch {}
        const cutoff = Date.now() - 14 * 86400000;
        hist = hist.filter((h) => h && h.at && Date.parse(h.at) >= cutoff);
        hist.push({ at: d.at, rooms: d.rooms, activeRooms: d.activeRooms, answeredRooms: d.answeredRooms, bothWeekRooms: d.bothWeekRooms, people: d.people });
        await writeSideFile("admin-stats-history.json", JSON.stringify(hist.slice(-400)));
      } catch (e: any) { console.log("[stats] history save failed " + (e?.message || e)); }
      return d;
    })().finally(() => { running = null; });
  }
  return running;
}

export async function logStats(full = true) {
  try { await refreshStats(full); }
  catch (e: any) { console.log("[stats] ERROR " + (e?.message || e)); }
}

function ptSlot(): string {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).format(new Date());
  return p; // changes each hour
}
export function startStatsSchedule(): void {
  let last = "";
  const tick = () => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
    const [h, m] = parts.split(":").map(Number);
    if (m === 0) {
      const slot = ptSlot();
      if (slot !== last) { last = slot; logStats(h === 0 || h === 12); }
    }
  };
  setTimeout(logStats, 60_000);
  setInterval(tick, 30_000);
}
