// Admin snapshot: room counts, city-level user locations (no names), and
// ElevenLabs usage. Logged as one "[stats] {json}" line at 12:00 and 00:00
// Pacific (and shortly after boot); a scheduled task reads the latest line
// from the logs and refreshes the admin artifact.
import { listRoomIds, loadState } from "./storage";
import { resolveCoords, resolveCountryCode } from "./geo";
import { topSongs, previewClip } from "./music";
import { runQa } from "./qa";
import { weatherKitConfigured, weatherKitCurrentWeather } from "./weatherkit";
import { elevenLabsUsage } from "./voice";

const coordCache = new Map<string, { lat: number; lon: number; city: string; country: string } | null>();

export async function computeStats() {
  const ids = await listRoomIds();
  let rooms = 0, active = 0, people = 0;
  const locByCountry = new Map<string, string>();
  const byCity = new Map<string, { city: string; country: string; lat: number; lon: number; n: number; wk?: { ok: boolean; ms: number | null } }>();
  for (const id of ids) {
    let st: any;
    try { st = await loadState(id); } catch { continue; }
    rooms++;
    const ppl = ["mark", "nikita"].map((k) => st?.people?.[k]).filter(Boolean);
    people += ppl.length;
    if (ppl.length === 2 && ppl.every((p: any) => p.confirmed)) active++;
    for (const p of ppl) {
      const loc = String(p.location || "").trim();
      if (!loc) continue;
      if (!coordCache.has(loc)) coordCache.set(loc, await resolveCoords(loc).catch(() => null));
      const c = coordCache.get(loc);
      if (!c) continue;
      if (c.country && !locByCountry.has(c.country)) locByCountry.set(c.country, loc);
      const key = c.lat.toFixed(1) + "," + c.lon.toFixed(1);
      const e = byCity.get(key);
      if (e) e.n++; else byCity.set(key, { city: c.city, country: c.country, lat: +c.lat.toFixed(2), lon: +c.lon.toFixed(2), n: 1 });
    }
  }
  const u = await elevenLabsUsage();
  // Music player health: for each country our people are in (max 6), is the
  // Apple chart reachable and do the top-5 song previews actually fetch?
  const music: { country: string; chart: boolean; previewsOk: number; total: number; songs: { label: string; ok: boolean }[] }[] = [];
  for (const [country, loc] of [...locByCountry].slice(0, 6)) {
    try {
      const chart = await topSongs(loc, 5);
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
  return {
    at: new Date().toISOString(),
    rooms, activeRooms: active, people,
    cities: [...byCity.values()].sort((a, b) => b.n - a.n),
    qa,
    weatherkit: wk,
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
