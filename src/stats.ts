// Admin snapshot: room counts, city-level user locations (no names), and
// ElevenLabs usage. Logged as one "[stats] {json}" line at 12:00 and 00:00
// Pacific (and shortly after boot); a scheduled task reads the latest line
// from the logs and refreshes the admin artifact.
import { listRoomIds, loadState } from "./storage";
import { resolveCoords, resolveCountryCode } from "./geo";
import { topSongs, previewClip } from "./music";
import { elevenLabsUsage } from "./voice";

const coordCache = new Map<string, { lat: number; lon: number; city: string; country: string } | null>();

export async function computeStats() {
  const ids = await listRoomIds();
  let rooms = 0, active = 0, people = 0;
  const locByCountry = new Map<string, string>();
  const byCity = new Map<string, { city: string; country: string; lat: number; lon: number; n: number }>();
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
  const music: { country: string; chart: boolean; previewsOk: number; total: number }[] = [];
  for (const [country, loc] of [...locByCountry].slice(0, 6)) {
    try {
      const chart = await topSongs(loc, 5);
      if (!chart || !chart.length) { music.push({ country, chart: false, previewsOk: 0, total: 0 }); continue; }
      const res = await Promise.all(chart.map((e) => previewClip(e.title, e.artist).then((c) => !!c).catch(() => false)));
      music.push({ country, chart: true, previewsOk: res.filter(Boolean).length, total: res.length });
    } catch { music.push({ country, chart: false, previewsOk: 0, total: 0 }); }
  }
  return {
    at: new Date().toISOString(),
    rooms, activeRooms: active, people,
    cities: [...byCity.values()].sort((a, b) => b.n - a.n),
    music,
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
