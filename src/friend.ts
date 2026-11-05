// Nearune — "Make a friend" matcher. Pairs the next person who taps it with
// whoever has been waiting, and opens a fresh room for the two of them.
// Anonymous device ids only (no names, no contact details). The queue lives in
// one small side file so it survives restarts. Single server instance, same
// as the email index.

import { readSideFile, writeSideFile, createRoom, saveState } from "./storage";

type Waiter = { ticket: string; device: string; at: number; seen: number };
type Match = { roomId: string; token: string; at: number };
type Data = { queue: Waiter[]; matches: Record<string, Match>; blocks: Record<string, string[]> };

const KEY = "friend-queue.json";
const HOUR = 60 * 60 * 1000;
const QUEUE_MAX_AGE = 24 * HOUR; // a waiting entry is dropped after a day
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
    s.friendDevices = { nikita: w.device, mark: "admin" };
    s.pendingInvite = { nikita: { token: tokWaiter, at, link: true }, mark: { token: tokAdmin, at, link: true } };
  });
  d.matches[w.ticket] = { roomId, token: tokWaiter, at: Date.now() };
  console.log("[friend] queue over " + QUEUE_LIMIT + ": oldest requester handed to admin room=" + roomId);
}

export type JoinResult = { status: "waiting"; ticket: string } | { status: "matched"; roomId: string; token: string };

export function friendJoin(device: string): Promise<JoinResult> {
  return locked(async () => {
    const d = await load();
    prune(d);
    const now = Date.now();
    const mine = d.queue.find((w) => w.device === device);
    if (mine) {
      mine.seen = now;
      await save();
      return { status: "waiting", ticket: mine.ticket } as JoinResult;
    }
    const blocked = (a: string, b: string) => (d.blocks[a] || []).includes(b) || (d.blocks[b] || []).includes(a);
    const idx = d.queue.findIndex((w) => w.device !== device && now - w.seen < ACTIVE_WINDOW && !blocked(w.device, device));
    if (idx < 0) {
      const ticket = rand12() + rand12();
      d.queue.push({ ticket, device, at: now, seen: now });
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
    // Both people join through the normal "You're invited" form, so neither
    // is the host and there is no race over who registers first.
    await saveState(roomId, (s) => {
      s.origin = "friend";
      s.friendDevices = { nikita: waiter.device, mark: device };
      s.pendingInvite = { nikita: { token: tokWaiter, at, link: true }, mark: { token: tokJoiner, at, link: true } };
    });
    d.matches[waiter.ticket] = { roomId, token: tokWaiter, at: now };
    await save();
    return { status: "matched", roomId, token: tokJoiner } as JoinResult;
  });
}

export type StatusResult = { status: "waiting" } | { status: "none" } | { status: "matched"; roomId: string; token: string };

export function friendStatus(ticket: string): Promise<StatusResult> {
  return locked(async () => {
    const d = await load();
    const m = d.matches[ticket];
    if (m) return { status: "matched", roomId: m.roomId, token: m.token } as StatusResult;
    const w = d.queue.find((x) => x.ticket === ticket);
    if (!w) return { status: "none" } as StatusResult;
    w.seen = Date.now();
    await save();
    return { status: "waiting" } as StatusResult;
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
