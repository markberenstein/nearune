// Nearune — "Make a friend" matcher. Pairs the next person who taps it with
// whoever has been waiting, and opens a fresh room for the two of them.
// Anonymous device ids only (no names, no contact details). The queue lives in
// one small side file so it survives restarts. Single server instance, same
// as the email index.

import { readSideFile, writeSideFile, createRoom, saveState } from "./storage";
import { sendPush } from "./push";

// Native app waiters can leave a push token so we can tell them the moment
// someone matches (the app may be closed by then).
type WaiterPush = { kind: "apns" | "fcm"; token: string };
// Name, city and language given when tapping Make a friend, so the room can be
// created with both people already signed up (no "Pending" step). Held only
// while waiting in line, then moved into the room.
export type FriendProfile = { name: string; location: string; language: string; tz?: string };
type Waiter = { ticket: string; device: string; at: number; seen: number; push?: WaiterPush; profile?: FriendProfile };

function notifyMatch(push: WaiterPush | undefined): void {
  if (!push) return;
  sendPush({ kind: push.kind, token: push.token } as any, {
    title: "You've been matched! 🎉",
    body: "Open Nearune to meet your new friend.",
    badge: 1,
    tag: "friend-match",
  })
    .then((r) => console.log("[friend] match push " + (r.ok ? "sent" : "failed") + " (" + push.kind + ")"))
    .catch(() => {});
}
type Match = { roomId: string; token: string; at: number; who?: "mark" | "nikita"; ready?: boolean };
type Data = { queue: Waiter[]; matches: Record<string, Match>; blocks: Record<string, string[]> };

const KEY = "friend-queue.json";
const HOUR = 60 * 60 * 1000;
const LONG_WAIT = 24 * HOUR; // after this the waiting person is told we are still looking
const QUEUE_MAX_AGE = 30 * 24 * HOUR; // a waiting entry is only dropped after 30 days
const ACTIVE_WINDOW = 2 * HOUR; // only pair people who checked in recently
const MATCH_KEEP = 72 * HOUR;

let data: Data | null = null;
let chain: Promise<unknown> = Promise.resolve();

function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

async function load(): Promise<Data> {
  if (data) return data;
  try {
    const raw = await readSideFile(KEY);
    const d = raw ? JSON.parse(raw) : {};
    data = { queue: d.queue || [], matches: d.matches || {}, blocks: d.blocks || {} };
  } catch {
    data = { queue: [], matches: {}, blocks: {} };
  }
  return data;
}

async function save(): Promise<void> {
  if (data) await writeSideFile(KEY, JSON.stringify(data));
}

function prune(d: Data): void {
  const now = Date.now();
  d.queue = d.queue.filter((w) => now - w.at < QUEUE_MAX_AGE);
  for (const t of Object.keys(d.matches)) if (now - d.matches[t].at > MATCH_KEEP) delete d.matches[t];
}

function rand12(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

const QUEUE_LIMIT = 3;

async function handToAdmin(d: Data): Promise<void> {
  const w = d.queue.shift();
  if (!w) return;
  const roomId = await createRoom("", "friend-match");
  const tokWaiter = rand12();
  const tokAdmin = rand12();
  const at = new Date().toISOString();
  await saveState(roomId, (s) => {
    s.origin = "friend";
    s.relationship = "friend";
    s.friendDevices = { nikita: w.device, mark: "admin" };
    s.pendingInvite = { mark: { token: tokAdmin, at, link: true } } as any;
    if (w.profile) { if (!s.people) s.people = {} as any; (s.people as any).nikita = { ...w.profile, confirmed: true }; }
    else (s.pendingInvite as any).nikita = { token: tokWaiter, at, link: true };
  });
  d.matches[w.ticket] = { roomId, token: tokWaiter, at: Date.now(), who: "nikita", ready: !!w.profile };
  notifyMatch(w.push);
  console.log("[friend] queue over " + QUEUE_LIMIT + ": oldest requester handed to admin room=" + roomId);
}

export type JoinResult = { status: "waiting"; ticket: string } | { status: "matched"; roomId: string; token: string; who: "mark" | "nikita"; ready: boolean; signedUp: number };

export function friendJoin(device: string, profile?: FriendProfile): Promise<JoinResult> {
  return locked(async () => {
    const d = await load();
    prune(d);
    const now = Date.now();
    const mine = d.queue.find((w) => w.device === device);
    if (mine) {
      mine.seen = now;
      if (profile) mine.profile = profile;
      await save();
      return { status: "waiting", ticket: mine.ticket } as JoinResult;
    }
    const blocked = (a: string, b: string) => (d.blocks[a] || []).includes(b) || (d.blocks[b] || []).includes(a);
    const idx = d.queue.findIndex((w) => w.device !== device && now - w.seen < ACTIVE_WINDOW && !blocked(w.device, device));
    if (idx < 0) {
      const ticket = rand12() + rand12();
      d.queue.push({ ticket, device, at: now, seen: now, ...(profile ? { profile } : {}) });
      // Line is longer than QUEUE_LIMIT: hand the earliest requester to the
      // administrator, who joins their room through a link shown in admin.
      if (d.queue.length > QUEUE_LIMIT) await handToAdmin(d);
      await save();
      return { status: "waiting", ticket } as JoinResult;
    }
    const waiter = d.queue.splice(idx, 1)[0];
    const roomId = await createRoom("", "friend-match");
    const tokWaiter = rand12();
    const tokJoiner = rand12();
    const at = new Date().toISOString();
    // Whoever gave their name, city and language is signed up right away;
    // anyone who didn't (an older app) joins through the "You're invited"
    // form instead. Neither is the host, so there's no race over who's first.
    await saveState(roomId, (s) => {
      s.origin = "friend";
      s.relationship = "friend";
      s.friendDevices = { nikita: waiter.device, mark: device };
      const inv: any = {};
      const ppl: any = s.people || {};
      if (waiter.profile) ppl.nikita = { ...waiter.profile, confirmed: true };
      else inv.nikita = { token: tokWaiter, at, link: true };
      if (profile) ppl.mark = { ...profile, confirmed: true };
      else inv.mark = { token: tokJoiner, at, link: true };
      s.people = ppl;
      s.pendingInvite = inv;
    });
    d.matches[waiter.ticket] = { roomId, token: tokWaiter, at: now, who: "nikita", ready: !!waiter.profile };
    await save();
    notifyMatch(waiter.push);
    return { status: "matched", roomId, token: tokJoiner, who: "mark", ready: !!profile, signedUp: (waiter.profile ? 1 : 0) + (profile ? 1 : 0) } as JoinResult;
  });
}

export type StatusResult = { status: "waiting"; long?: boolean } | { status: "none" } | { status: "matched"; roomId: string; token: string; who?: "mark" | "nikita"; ready?: boolean };

export function friendStatus(ticket: string): Promise<StatusResult> {
  return locked(async () => {
    const d = await load();
    prune(d);
    const m = d.matches[ticket];
    if (m) return { status: "matched", roomId: m.roomId, token: m.token, who: m.who, ready: !!m.ready } as StatusResult;
    const w = d.queue.find((x) => x.ticket === ticket);
    if (!w) return { status: "none" } as StatusResult;
    w.seen = Date.now();
    await save();
    return { status: "waiting", long: Date.now() - w.at > LONG_WAIT } as StatusResult;
  });
}

// A waiting person's app registers its push token for the match alert.
export function friendSetPush(ticket: string, push: WaiterPush): Promise<boolean> {
  return locked(async () => {
    const d = await load();
    const w = d.queue.find((x) => x.ticket === ticket);
    if (!w) return false;
    w.push = push;
    await save();
    return true;
  });
}

export function friendCancel(ticket: string): Promise<void> {
  return locked(async () => {
    const d = await load();
    d.queue = d.queue.filter((x) => x.ticket !== ticket);
    await save();
  });
}

// After a report or a leave: these two devices are never paired again.
export function friendBlock(a: string | undefined, b: string | undefined): Promise<void> {
  return locked(async () => {
    if (!a || !b || a === b) return;
    const d = await load();
    if (!d.blocks[a]) d.blocks[a] = [];
    if (!d.blocks[a].includes(b)) d.blocks[a].push(b);
    await save();
  });
}

// The other person left a brand-new match before this person got to it: put
// this person back at the front of the line (same profile). They only become
// matchable again once they check in (tap Make a friend), so nobody gets
// paired with someone who isn't around.
export function friendRequeue(device: string | undefined, profile?: FriendProfile): Promise<void> {
  return locked(async () => {
    if (!device || device === "admin") return;
    const d = await load();
    if (d.queue.some((w) => w.device === device)) return;
    d.queue.unshift({ ticket: rand12() + rand12(), device, at: Date.now(), seen: 0, ...(profile ? { profile } : {}) });
    await save();
  });
}
