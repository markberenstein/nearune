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

export const FUNNEL_STEPS: { key: string; label: string }[] = [
  { key: "open", label: "Opened Nearune" },
  { key: "welcome_seen", label: "Saw the welcome screen" },
  { key: "tap_invite", label: "Tapped Invite / Start a room" },
  { key: "room_created", label: "Created a room" },
  { key: "tap_friend", label: "Tapped Make a friend" },
  { key: "friend_submit", label: "Filled in Make a friend" },
  { key: "friend_matched", label: "Matched with a friend" },
  { key: "signed_up", label: "Signed up in a room" },
  { key: "invite_sent", label: "Shared an invite" },
  { key: "partner_joined", label: "Partner / match joined" },
  { key: "answered", label: "Answered a question" },
  { key: "both_answered", label: "Both answered (saw each other's)" },
];
const STEP_KEYS = new Set(FUNNEL_STEPS.map((s) => s.key));

type Device = {
  first: number; // first event, ms
  plat: "app" | "web";
  existing?: boolean; // already a Nearune user when tracking started
  steps: Record<string, number>; // step -> first time, ms
  days: string[]; // YYYY-MM-DD (UTC) days the app was opened, newest last
};
type Data = { devices: Record<string, Device> };

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
  if (step === "open") {
    const day = new Date(now).toISOString().slice(0, 10);
    if (dev.days[dev.days.length - 1] !== day) {
      dev.days.push(day);
      if (dev.days.length > MAX_DAYS_PER_DEVICE) dev.days.splice(0, dev.days.length - MAX_DAYS_PER_DEVICE);
    }
  }
  dirty = true;
}

// ---- Report (used by the admin page) ------------------------------------

export type FunnelReport = {
  days: number;
  newUsers: number;
  appUsers: number;
  webUsers: number;
  existingActive: number;
  steps: { key: string; label: string; count: number }[];
  retention: { nextDay: number; nextDayOf: number; week: number; weekOf: number };
  recent: { id: string; first: number; plat: string; reached: string[]; last: string; daysOpen: number }[];
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
      return { id: id.slice(0, 6), first: v.first, plat: v.plat, reached: reached.map(labelOf), last: labelOf(lastKey), daysOpen: v.days.length };
    });

  return {
    days,
    newUsers: fresh_.length,
    appUsers: fresh_.filter(([, v]) => v.plat === "app").length,
    webUsers: fresh_.filter(([, v]) => v.plat !== "app").length,
    existingActive: all.filter(([, v]) => v.existing && v.days.some((x) => dayNum(x) * 86400000 >= since)).length,
    steps: FUNNEL_STEPS.map((s) => ({ key: s.key, label: s.label, count: counts[s.key] || 0 })),
    retention: { nextDay, nextDayOf, week, weekOf },
    recent,
  };
}
