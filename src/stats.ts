// Admin snapshot: room counts, city-level user locations (no names), and
// ElevenLabs usage. Logged as one "[stats] {json}" line at 12:00 and 00:00
// Pacific (and shortly after boot); a scheduled task reads the latest line
// from the logs and refreshes the admin artifact.
import { listRoomIds, loadState } from "./storage";
import { resolveCoords, resolveCountryCode } from "./geo";
import { topSongs, previewClip } from "./music";
import { runQa } from "./qa";
import { weatherKitConfigured, weatherKitCurrentWeather } from "./weatherkit";
import { elevenLabsUsage, voiceSelfTest } from "./voice";
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

const coordCache = new Map<string, { lat: number; lon: number; city: string; country: string } | null>();

export async function computeStats() {
  const ids = await listRoomIds();
  let rooms = 0, active = 0, people = 0, answered = 0;
  const voiceIds: { room: number; who: string; id: string }[] = [];
  const roomList: { n: number; created: string | null; status: string; answeredDays: number; lastAnswer: string | null; people: { name: string; location: string; confirmed: boolean }[] }[] = [];
  const locByCountry = new Map<string, string>();
  const byCity = new Map<string, { city: string; country: string; lat: number; lon: number; n: number; people: { name: string; partner: string; partnerLoc: string }[]; wk?: { ok: boolean; ms: number | null } }>();
  for (const id of ids) {
    let st: any;
    try { st = await loadState(id); } catch { continue; }
    rooms++;
    try { if (Object.values(st?.answers || {}).some((day: any) => day && (day.mark || day.nikita))) answered++; } catch {}
    const ppl = ["mark", "nikita"].map((k) => st?.people?.[k]).filter(Boolean);
    people += ppl.length;
    if (ppl.length === 2 && ppl.every((p: any) => p.confirmed)) active++;
    try {
      const days = Object.entries(st?.answers || {}).filter(([, day]: any) => day && (day.mark || day.nikita)).map(([d]) => d).sort();
      roomList.push({
        n: rooms,
        created: st?.createdAt || null,
        status: ppl.length === 2 && ppl.every((p: any) => p.confirmed) ? "active" : ppl.length < 2 ? "waiting for partner" : "partner not confirmed",
        answeredDays: days.length,
        lastAnswer: days.length ? days[days.length - 1] : null,
        people: ppl.map((p: any) => ({ name: String(p.name || "(no name)").slice(0, 40), location: String(p.location || "").slice(0, 60), confirmed: !!p.confirmed })),
      });
    } catch {}
    for (const k of ["mark", "nikita"]) {
      const p = st?.people?.[k]; if (!p) continue;
      if (p.voiceId) voiceIds.push({ room: rooms, who: String(p.name || k).slice(0, 30), id: String(p.voiceId) });
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
      if (e) { e.n++; e.people.push(who); } else byCity.set(key, { city: c.city, country: c.country, lat: +c.lat.toFixed(2), lon: +c.lon.toFixed(2), n: 1, people: [who] });
    }
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
      const res = await Promise.all(chart.map((e) => previewClip(e.title, e.artist).then((c) => !!c).catch(() => false)));
      music.push({ country, chart: true, previewsOk: res.filter(Boolean).length, total: res.length, songs: chart.map((e, i) => ({ label: "#" + e.rank + " " + e.title + (e.artist ? " - " + e.artist : ""), ok: res[i] })) });
    } catch { music.push({ country, chart: false, previewsOk: 0, total: 0, songs: [] }); }
  }
  let qa: any = null;
  try { const r = await runQa(); qa = { at: r.at, ok: r.ok, failures: r.failures, fixed: r.fixed, checks: r.checks }; } catch {}
  // WeatherKit connection test per city (the same call the app makes for a
  // person's background), max 20 cities.
  if (weatherKitConfigured()) {
    await Promise.all([...byCity.values()].slice(0, 20).map(async (c) => {
      const t0 = Date.now();
      try {
        const w = await weatherKitCurrentWeather(c.lat, c.lon);
        c.wk = { ok: !!w, ms: Date.now() - t0 };
      } catch { c.wk = { ok: false, ms: Date.now() - t0 }; }
    }));
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
    const vbad = vitems.filter((i) => !i.ok);
    qa.checks.push({ name: "Voice playback (cloned voices)", ok: vbad.length === 0, items: vitems, detail: vbad.length ? vbad.map((i) => i.label + ": " + i.note).join("; ") : "all tested voices spoke" });
    if (vbad.length) { qa.ok = false; qa.failures.push("Voice playback: " + vbad.map((i) => i.label + ": " + i.note).join("; ")); }
  }
  return {
    at: new Date().toISOString(),
    rooms, activeRooms: active, answeredRooms: answered, people, roomList,
    cities: [...byCity.values()].sort((a, b) => b.n - a.n),
    qa,
    weatherkit: wk,
    claude: await claudeUsageSummary().catch(() => null),
    railway: await railwayUsage(),
    elevenlabs: u ? { used: u.used, limit: u.limit, resetsAt: u.resetsAt, voices: u.voices, voiceLimit: u.voiceLimit } : null,
  };
}

export async function logStats() {
  try { console.log("[stats] " + JSON.stringify(await computeStats())); }
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
    if ((h === 0 || h === 12) && m === 0) {
      const slot = ptSlot();
      if (slot !== last) { last = slot; logStats(); }
    }
  };
  setTimeout(logStats, 60_000);
  setInterval(tick, 30_000);
}
