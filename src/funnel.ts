// Anonymous new-user funnel.
//
// Each phone/browser has a random ID (localStorage "nearuneDevice"); the app
// reports when that ID reaches a step (opened, tapped Make a friend, signed
// up, answered, ...). Nothing personal is stored: no names, emails, IPs or
// room codes — just the random ID, web vs app, the first time each step
// happened, and which days the app was opened (for "came back" stats).
//
// The main app keeps this in memory and saves it to the side file
// "funnel.json"; the admin app reads the same file to draw the Funnel section.

import { readSideFile, writeSideFile } from "./storage";

export const FUNNEL_STEPS: { key: string; label: string; group: string }[] = [
  { key: "open", label: "Opened Nearune", group: "Getting started" },
  { key: "welcome_seen", label: "Saw the welcome screen", group: "Getting started" },
  { key: "tap_invite", label: "Tapped Invite / Start a room", group: "Getting started" },
  { key: "room_created", label: "Created a room", group: "Getting started" },
  { key: "tap_friend", label: "Tapped Make a friend", group: "Getting started" },
  { key: "friend_submit", label: "Filled in Make a friend", group: "Getting started" },
  { key: "friend_matched", label: "Matched with a friend", group: "Getting started" },
  { key: "signed_up", label: "Signed up in a room", group: "Getting started" },
  { key: "invite_sent", label: "Shared an invite (inviter)", group: "Invites" },
  { key: "invite_opened", label: "Opened an invite (invited partner)", group: "Invites" },
  { key: "invite_to_store", label: "Went to the App Store from an invite", group: "Invites" },
  { key: "invite_joined", label: "Joined from an invite", group: "Invites" },
  { key: "partner_joined", label: "Partner / match joined", group: "Invites" },
  { key: "notif_asked", label: "Asked to turn on notifications", group: "Notifications" },
  { key: "notif_allowed", label: "Turned notifications on", group: "Notifications" },
  { key: "notif_declined", label: "Said Not now", group: "Notifications" },
  { key: "notif_blocked", label: "Blocked in phone settings", group: "Notifications" },
  { key: "answered", label: "Answered a question", group: "Using Nearune" },
  { key: "both_answered", label: "Both answered (saw each other's)", group: "Using Nearune" },
  { key: "voice_recorded", label: "Recorded their voice", group: "Features" },
  { key: "voice_played", label: "Heard an answer in partner's voice", group: "Features" },
  { key: "puzzle_uploaded", label: "Uploaded a puzzle photo", group: "Features" },
  { key: "nhie_played", label: "Played Never Have I Ever", group: "Features" },
];
const STEP_KEYS = new Set(FUNNEL_STEPS.map((s) => s.key));

type Device = {
  first: number; // first event, ms
  plat: "app" | "web";
  existing?: boolean; // already a Nearune user when tracking started
  steps: Record<string, number>; // step -> first time, ms
  ls?: Record<string, number>; // step -> last time, ms
  days: string[]; // YYYY-MM-DD (UTC) days the app was opened, newest last
  secs?: Record<string, number>; // YYYY-MM-DD -> seconds on screen that day
};
// Landing pages (/get, /military): daily counts per page + source. No IDs.
type LandingDay = Record<string, { v: number; t: number }>; // "page|source" -> views, App Store taps
// Feature use per room, counted on the server for everyone (existing users
// and the Original room included): roomId ("" = Original) -> day -> kind -> count.
export const ROOM_USE_KINDS = ["answer", "voice_played", "voice_recorded", "puzzle_uploaded", "nhie_vote"] as const;
export type RoomUseKind = (typeof ROOM_USE_KINDS)[number];
type Data = { devices: Record<string, Device>; landing?: Record<string, LandingDay>; rooms?: Record<string, Record<string, Partial<Record<RoomUseKind, number>>>> };

const FILE = "funnel.json";
const MAX_DEVICES = 20000;
const MAX_DAYS_PER_DEVICE = 60;

let data: Data | null = null;
let loading: Promise<Data> | null = null;
let dirty = false;

async function load(): Promise<Data> {
  if (data) return data;
  if (!loading) {
    loading = (async () => {
      try {
        const t = await readSideFile(FILE);
        const d = t ? JSON.parse(t) : null;
        data = d && typeof d === "object" && d.devices ? d : { devices: {} };
      } catch {
        data = { devices: {} };
      }
      return data!;
    })();
  }
  return loading;
}

async function flush(): Promise<void> {
  if (!dirty || !data) return;
  dirty = false;
  try {
    await writeSideFile(FILE, JSON.stringify(data));
  } catch (err) {
    dirty = true;
    console.error("[funnel] save failed", err);
  }
}
setInterval(() => { flush(); }, 15 * 1000);

function prune(d: Data): void {
  const ids = Object.keys(d.devices);
  if (ids.length <= MAX_DEVICES) return;
  ids.sort((a, b) => d.devices[a]!.first - d.devices[b]!.first);
  for (const id of ids.slice(0, ids.length - MAX_DEVICES)) delete d.devices[id];
}

export function isValidFunnelDevice(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9]{16,64}$/.test(id);
}
export function isFunnelStep(step: unknown): step is string {
  return typeof step === "string" && STEP_KEYS.has(step);
}

export async function recordFunnel(device: string, step: string, plat: "app" | "web", existing: boolean): Promise<void> {
  const d = await load();
  const now = Date.now();
  let dev = d.devices[device];
  if (!dev) {
    dev = d.devices[device] = { first: now, plat, steps: {}, days: [], ...(existing ? { existing: true } : {}) };
    prune(d);
  }
  if (plat === "app") dev.plat = "app"; // a phone that ever used the app counts as app
  if (!dev.steps[step]) dev.steps[step] = now;
  if (!dev.ls) dev.ls = {};
  dev.ls[step] = now;
  if (step === "open") {
    const day = new Date(now).toISOString().slice(0, 10);
    if (dev.days[dev.days.length - 1] !== day) {
      dev.days.push(day);
      if (dev.days.length > MAX_DAYS_PER_DEVICE) dev.days.splice(0, dev.days.length - MAX_DAYS_PER_DEVICE);
    }
  }
  dirty = true;
}

export async function recordTime(device: string, seconds: number, plat: "app" | "web"): Promise<void> {
  const d = await load();
  const now = Date.now();
  let dev = d.devices[device];
  if (!dev) { dev = d.devices[device] = { first: now, plat, steps: {}, days: [] }; prune(d); }
  if (plat === "app") dev.plat = "app";
  const day = new Date(now).toISOString().slice(0, 10);
  if (!dev.secs) dev.secs = {};
  dev.secs[day] = Math.min(86400, (dev.secs[day] || 0) + seconds);
  if (dev.days[dev.days.length - 1] !== day) { dev.days.push(day); if (dev.days.length > MAX_DAYS_PER_DEVICE) dev.days.splice(0, dev.days.length - MAX_DAYS_PER_DEVICE); }
  const keys = Object.keys(dev.secs).sort();
  while (keys.length > MAX_DAYS_PER_DEVICE) delete dev.secs[keys.shift()!];
  dirty = true;
}

export async function recordLanding(page: string, source: string, kind: "view" | "tap"): Promise<void> {
  const d = await load();
  const day = new Date().toISOString().slice(0, 10);
  if (!d.landing) d.landing = {};
  const L = (d.landing[day] = d.landing[day] || {});
  const key = page + "|" + source;
  const row = (L[key] = L[key] || { v: 0, t: 0 });
  if (kind === "view") row.v++; else row.t++;
  // Keep about six months of days.
  const days = Object.keys(d.landing).sort();
  while (days.length > 190) delete d.landing[days.shift()!];
  dirty = true;
}

export async function recordRoomUse(roomId: string, kind: RoomUseKind): Promise<void> {
  try {
    const d = await load();
    const day = new Date().toISOString().slice(0, 10);
    if (!d.rooms) d.rooms = {};
    const R = (d.rooms[roomId] = d.rooms[roomId] || {});
    const D = (R[day] = R[day] || {});
    D[kind] = (D[kind] || 0) + 1;
    const days = Object.keys(R).sort();
    while (days.length > 120) delete R[days.shift()!];
    dirty = true;
  } catch {}
}

// ---- Report (used by the admin page) ------------------------------------

export type FunnelReport = {
  days: number;
  landing: { page: string; source: string; views: number; taps: number }[];
  roomUse: Record<string, Partial<Record<RoomUseKind, number>> & { lastDay?: string }>; // per room, within the window
  daily: { day: string; newUsers: number; returning: number; app: number; web: number; minutes: number }[];
  avgMinutesPerDay: number; // average minutes on screen per person per active day (window)
  totalMinutes: number;
  activeToday: number;
  activeWeek: number;
  activeWeekApp: number;
  newUsers: number;
  appUsers: number;
  webUsers: number;
  existingActive: number;
  steps: { key: string; label: string; group: string; count: number; all: number }[];
  activeAll: number; // everyone (new and existing) who opened Nearune in the window
  retention: { nextDay: number; nextDayOf: number; week: number; weekOf: number };
  recent: { id: string; first: number; plat: string; reached: string[]; last: string; daysOpen: number; minutes: number }[];
};

function dayNum(iso: string): number {
  return Math.floor(Date.parse(iso + "T00:00:00Z") / 86400000);
}

export async function funnelReport(days: number, fresh = false): Promise<FunnelReport> {
  let d: Data;
  if (fresh) {
    // Admin app: read what the main app last saved.
    try {
      const t = await readSideFile(FILE);
      const p = t ? JSON.parse(t) : null;
      d = p && p.devices ? p : { devices: {} };
    } catch {
      d = { devices: {} };
    }
  } else {
    d = await load();
  }
  const now = Date.now();
  const since = now - days * 86400000;
  const all = Object.entries(d.devices);
  const fresh_ = all.filter(([, v]) => !v.existing && v.first >= since);
  const counts: Record<string, number> = {};
  for (const [, v] of fresh_) for (const k of Object.keys(v.steps)) counts[k] = (counts[k] || 0) + 1;

  // Came back: opened on a later calendar day than their first day.
  let nextDay = 0, nextDayOf = 0, week = 0, weekOf = 0;
  for (const [, v] of fresh_) {
    const firstDay = Math.floor(v.first / 86400000);
    const opened = v.days.map(dayNum);
    if (now - v.first >= 86400000) {
      nextDayOf++;
      if (opened.some((n) => n >= firstDay + 1 && n <= firstDay + 2)) nextDay++;
    }
    if (now - v.first >= 7 * 86400000) {
      weekOf++;
      if (opened.some((n) => n >= firstDay + 7)) week++;
    }
  }

  const labelOf = (k: string) => FUNNEL_STEPS.find((s) => s.key === k)?.label || k;
  const recent = fresh_
    .sort((a, b) => b[1].first - a[1].first)
    .slice(0, 40)
    .map(([id, v]) => {
      const reached = FUNNEL_STEPS.filter((s) => v.steps[s.key]).map((s) => s.key);
      const lastKey = Object.entries(v.steps).sort((a, b) => b[1] - a[1])[0]?.[0] || "open";
      const minutes = Math.round(Object.values(v.secs || {}).reduce((a, b) => a + b, 0) / 60);
      return { id: id.slice(0, 6), first: v.first, plat: v.plat, reached: reached.map(labelOf), last: labelOf(lastKey), daysOpen: v.days.length, minutes };
    });

  return {
    days,
    newUsers: fresh_.length,
    appUsers: fresh_.filter(([, v]) => v.plat === "app").length,
    webUsers: fresh_.filter(([, v]) => v.plat !== "app").length,
    existingActive: all.filter(([, v]) => v.existing && v.days.some((x) => dayNum(x) * 86400000 >= since)).length,
    steps: FUNNEL_STEPS.map((s) => ({ key: s.key, label: s.label, group: s.group, count: counts[s.key] || 0,
      all: all.filter(([, v]) => ((v.ls && v.ls[s.key]) || v.steps[s.key] || 0) >= since).length })),
    activeAll: all.filter(([, v]) => v.days.some((x) => dayNum(x) * 86400000 >= since) || Object.values(v.ls || {}).some((t) => t >= since)).length,
    ...(() => {
      // People who opened Nearune each day (new = first day ever, the rest
      // returning, existing users included), last min(days, 30) days.
      const span = Math.min(days, 30);
      const today = Math.floor(now / 86400000);
      const daily: FunnelReport["daily"] = [];
      for (let i = span - 1; i >= 0; i--) {
        const dn = today - i;
        const iso = new Date(dn * 86400000).toISOString().slice(0, 10);
        let nu = 0, ret = 0, app = 0, web = 0, secs = 0;
        for (const [, v] of all) {
          if (!v.days.includes(iso)) continue;
          secs += (v.secs && v.secs[iso]) || 0;
          if (!v.existing && Math.floor(v.first / 86400000) === dn) nu++; else ret++;
          if (v.plat === "app") app++; else web++;
        }
        daily.push({ day: iso, newUsers: nu, returning: ret, app, web, minutes: Math.round(secs / 60) });
      }
      const todayIso = new Date(today * 86400000).toISOString().slice(0, 10);
      const weekStart = new Date((today - 6) * 86400000).toISOString().slice(0, 10);
      const wk = all.filter(([, v]) => v.days.some((x) => x >= weekStart));
      const sinceIso = new Date(since).toISOString().slice(0, 10);
      let tSecs = 0, personDays = 0;
      for (const [, v] of all) for (const [dk, sv] of Object.entries(v.secs || {})) { if (dk >= sinceIso && sv > 0) { tSecs += sv; personDays++; } }
      return {
        avgMinutesPerDay: personDays ? Math.round((tSecs / personDays / 60) * 10) / 10 : 0,
        totalMinutes: Math.round(tSecs / 60),
        daily,
        activeToday: all.filter(([, v]) => v.days.includes(todayIso)).length,
        activeWeek: wk.length,
        activeWeekApp: wk.filter(([, v]) => v.plat === "app").length,
      };
    })(),
    roomUse: (() => {
      const sinceDay = new Date(since).toISOString().slice(0, 10);
      const out: FunnelReport["roomUse"] = {};
      for (const [rid, byDay] of Object.entries(d.rooms || {})) {
        const o: FunnelReport["roomUse"][string] = {};
        for (const [day, k] of Object.entries(byDay)) {
          if (day < sinceDay) continue;
          for (const [kind, n] of Object.entries(k)) (o as any)[kind] = ((o as any)[kind] || 0) + (n || 0);
          if (!o.lastDay || day > o.lastDay) o.lastDay = day;
        }
        out[rid] = o;
      }
      return out;
    })(),
    landing: (() => {
      const sinceDay = new Date(since).toISOString().slice(0, 10);
      const agg: Record<string, { v: number; t: number }> = {};
      for (const [day, rows] of Object.entries(d.landing || {})) {
        if (day < sinceDay) continue;
        for (const [k, r] of Object.entries(rows)) {
          const a = (agg[k] = agg[k] || { v: 0, t: 0 });
          a.v += r.v; a.t += r.t;
        }
      }
      return Object.entries(agg)
        .map(([k, r]) => ({ page: k.split("|")[0] || "", source: k.split("|").slice(1).join("|") || "direct", views: r.v, taps: r.t }))
        .sort((a, b) => b.views - a.views);
    })(),
    retention: { nextDay, nextDayOf, week, weekOf },
    recent,
  };
}
