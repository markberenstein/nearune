// Daily self-check. Runs shortly after boot and again each time the app's
// day rolls over (see todayKeyPT()), and logs a one-line "[qa] ..." summary
// plus one "[qa] FAIL ..." line per problem. Checks: color contrast (page
// tokens + every weather sky), clocks (every room's people have a valid
// timezone, backfilling when possible) and continuity (rooms load, the day
// key is sane, the legacy-room alias resolves).
import { WEATHER_THEMES } from "./weather";
import { listRoomIds, loadState, saveState, canonRoom } from "./storage";
import { resolveTimezoneFromLocation } from "./geo";
import { todayKeyPT, todayKeyFor } from "./util";
import { buildPageHtml } from "./page";

type Report = { at: string; day: string; ok: boolean; checked: { contrast: number; rooms: number; people: number }; failures: string[]; fixed: string[]; checks: { name: string; ok: boolean; detail: string }[] };
let last: Report | null = null;
export function lastQaReport(): Report | null { return last; }

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a: string, b: string): number {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const HEX = /^#[0-9a-fA-F]{6}$/;

function tokenBlocks(html: string): { light: Record<string, string>; dark: Record<string, string> } {
  const grab = (block: string) => {
    const out: Record<string, string> = {};
    for (const m of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)) out[m[1]] = m[2];
    return out;
  };
  const root = /:root\s*\{([^}]*)\}/.exec(html);
  const dark = /prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(html);
  return { light: grab(root ? root[1] : ""), dark: grab(dark ? dark[1] : "") };
}

export async function runQa(): Promise<Report> {
  const failures: string[] = [];
  const fixed: string[] = [];
  let contrast = 0;
  const need = (label: string, fg: string | undefined, bg: string | undefined, min: number) => {
    if (!fg || !bg || !HEX.test(fg) || !HEX.test(bg)) { failures.push(`contrast ${label}: missing color`); return; }
    contrast++;
    const r = ratio(fg, bg);
    if (r < min) failures.push(`contrast ${label}: ${r.toFixed(1)}:1 (needs ${min}:1)`);
  };

  // 1) Page color tokens, light and dark.
  try {
    const { light, dark } = tokenBlocks(buildPageHtml("", "qa"));
    for (const [name, t] of [["light", light], ["dark", dark]] as const) {
      need(`${name} ink/bg`, t["ink"], t["bg"], 7);
      need(`${name} ink/surface`, t["ink"], t["surface"], 7);
      need(`${name} ink-soft/bg`, t["ink-soft"], t["bg"], 4.5);
      need(`${name} ink-soft/surface`, t["ink-soft"], t["surface"], 4.5);
      need(`${name} accent/surface`, t["accent"], t["surface"], 4.5);
      need(`${name} accent/bg`, t["accent"], t["bg"], 4.5);
      need(`${name} on-accent/accent`, t["on-accent"], t["accent"], 4.5);
    }
  } catch (e: any) { failures.push("contrast tokens: could not read page (" + (e?.message || e) + ")"); }

  const tokenChecks = contrast;
  // 2) Every weather sky: the better of dark/pale ink must clear 4.5:1 at BOTH
  // ends of the gradient (this is the same rule the client uses to pick ink).
  try {
    for (const [bucket, pair] of Object.entries(WEATHER_THEMES)) {
      for (const which of ["day", "night"] as const) {
        const sky = pair[which].sky;
        const best = Math.max(
          Math.min(ratio("#2B211B", sky[0]), ratio("#2B211B", sky[1])),
          Math.min(ratio("#F2EFE9", sky[0]), ratio("#F2EFE9", sky[1])),
        );
        contrast++;
        if (best < 4.5) failures.push(`contrast sky ${bucket}-${which}: best ink ${best.toFixed(1)}:1 (needs 4.5:1)`);
      }
    }
  } catch (e: any) { failures.push("contrast skies: " + (e?.message || e)); }

  // 3) Clocks + 4) continuity across every room.
  let rooms = 0, people = 0;
  try {
    const ids = await listRoomIds();
    for (const id of ids) {
      rooms++;
      let st;
      try { st = await loadState(id); } catch (e: any) { failures.push(`room ${id || "(legacy)"}: state unreadable`); continue; }
      for (const k of ["mark", "nikita"] as const) {
        const p = st.people?.[k];
        if (!p) continue;
        people++;
        let valid = false;
        if (p.tz) { try { new Intl.DateTimeFormat("en-US", { timeZone: p.tz }); valid = true; } catch {} }
        if (valid) continue;
        if (!p.location) { if (id !== "") failures.push(`clock ${id}/${k}: no timezone and no location`); continue; }
        const tz = await resolveTimezoneFromLocation(p.location).catch(() => null);
        if (tz) {
          await saveState(id, (s) => { if (s.people?.[k]) s.people[k]!.tz = tz; });
          fixed.push(`clock ${id}/${k}: set timezone ${tz}`);
        } else failures.push(`clock ${id}/${k}: timezone missing and could not be resolved from "${p.location}"`);
      }
    }
    if (canonRoom("q7mvx3ke") !== "") failures.push("continuity: legacy alias q7mvx3ke no longer maps to the original room");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(todayKeyPT())) failures.push("continuity: day key malformed");
  } catch (e: any) { failures.push("rooms: " + (e?.message || e)); }

  const has = (...p: string[]) => failures.filter((f) => p.some((x) => f.startsWith(x)));
  const grp = (name: string, bad: string[], okText: string): { name: string; ok: boolean; detail: string } =>
    ({ name, ok: bad.length === 0, detail: bad.length ? bad.join("; ") : okText });
  const checks = [
    grp("Page colors readable (light and dark)", has("contrast light", "contrast dark", "contrast tokens"), tokenChecks + " color pairs pass"),
    grp("Weather skies readable (day and night)", has("contrast sky", "contrast skies"), (contrast - tokenChecks) + " skies pass"),
    grp("Clocks have a valid timezone", has("clock"), people + " people across " + rooms + " rooms" + (fixed.length ? "; fixed " + fixed.length + " automatically" : "")),
    grp("Every room loads", has("room ", "rooms"), rooms + " rooms loaded"),
    grp("Day key and original-room link", has("continuity"), "day key valid, legacy link resolves"),
  ];
  last = { at: new Date().toISOString(), day: todayKeyPT(), ok: failures.length === 0, checked: { contrast, rooms, people }, failures, fixed, checks };
  console.log(`[qa] ${last.ok ? "PASS" : "FAIL"} day=${last.day} contrast=${contrast} rooms=${rooms} people=${people} fixed=${fixed.length} failures=${failures.length}`);
  for (const f of failures) console.log("[qa] FAIL " + f);
  for (const f of fixed) console.log("[qa] FIXED " + f);
  return last;
}

// Run once shortly after boot, then whenever the day key changes.
export function startQaSchedule(): void {
  let lastDay = "";
  const tick = async () => {
    const d = todayKeyPT();
    if (d === lastDay) return;
    lastDay = d;
    try { await runQa(); } catch (e: any) { console.log("[qa] FAIL runner crashed: " + (e?.message || e)); }
  };
  setTimeout(tick, 45_000);
  setInterval(tick, 60_000);
}

// Per-room check, run the first time each room is opened on a given day (see
// the /api/state handler): both people have a valid timezone, and the room's
// state loaded. Logs one short line per room per day.
const roomChecked = new Map<string, string>();
export function roomQaOnce(roomId: string, st: any): void {
  const day = todayKeyFor(st);
  if (roomChecked.get(roomId) === day) return;
  roomChecked.set(roomId, day);
  const problems: string[] = [];
  for (const k of ["mark", "nikita"] as const) {
    const p = st?.people?.[k];
    if (!p) continue;
    if (!p.tz) { problems.push(`${k} timezone missing`); continue; }
    try { new Intl.DateTimeFormat("en-US", { timeZone: p.tz }); } catch { problems.push(`${k} timezone invalid`); }
  }
  console.log(`[qa] room ${roomId || "(legacy)"} day=${day} ${problems.length ? "FAIL " + problems.join("; ") : "ok"}`);
}
