// Nearune — room-scoped storage. S3-backed, local-file fallback.
//
// roomId === "" is the original/legacy room: it reads and writes the exact
// same keys the single-file version always used (state.json,
// puzzle-images/<id>.jpg, brand/<key>.png), so the existing production link
// keeps working untouched. Every other room gets its own prefixed keys
// under rooms/<roomId>/.

import { S3Client } from "bun";
import { readdirSync } from "node:fs";
import type { State, PersonKey } from "./types";
import { todayKeyFor } from "./util";

const MAX_HISTORY = 400;

// Alternate room ids that point at an existing room's data. "q7mvx3ke" is a
// normal-looking /r/<id> link for the original (legacy) room, so Mark and
// Nikita can reach it the same way as every other room, while the legacy
// "/" URL and its stored data keep working untouched.
const ROOM_ALIASES: Record<string, string> = { q7mvx3ke: "" };
export function canonRoom(roomId: string): string {
  return Object.prototype.hasOwnProperty.call(ROOM_ALIASES, roomId) ? ROOM_ALIASES[roomId] : roomId;
}

export function defaultState(): State {
  return { version: 1, answers: {}, status: {}, comments: {} };
}

function stateKey(roomId: string): string {
  roomId = canonRoom(roomId);
  return roomId ? `rooms/${roomId}/state.json` : "state.json";
}
function localStatePath(roomId: string): string {
  roomId = canonRoom(roomId);
  return roomId ? `./local-state-${roomId}.json` : "./local-state.json";
}
export function puzzleImageKey(roomId: string, id: string): string {
  roomId = canonRoom(roomId);
  return roomId ? `rooms/${roomId}/puzzle-images/${id}.jpg` : `puzzle-images/${id}.jpg`;
}
export function localPuzzlePath(roomId: string, id: string): string {
  roomId = canonRoom(roomId);
  return roomId ? `./local-puzzle-${roomId}-${id}.jpg` : `./local-puzzle-${id}.jpg`;
}
// The "share a recent photo" feature — one photo per person, overwritten on
// each new share (not one-per-upload like puzzle images), so the key is
// fixed per person rather than per-upload-id. See PersonProfile.photoAt.
export function photoKey(roomId: string, who: PersonKey): string {
  roomId = canonRoom(roomId);
  return roomId ? `rooms/${roomId}/photos/${who}.jpg` : `photos/${who}.jpg`;
}
export function localPhotoPath(roomId: string, who: PersonKey): string {
  roomId = canonRoom(roomId);
  return roomId ? `./local-photo-${roomId}-${who}.jpg` : `./local-photo-${who}.jpg`;
}

export const useS3 = !!(Bun.env.S3_BUCKET && Bun.env.S3_ACCESS_KEY_ID);

export const s3 = useS3
  ? new S3Client({
      accessKeyId: Bun.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: Bun.env.S3_SECRET_ACCESS_KEY!,
      bucket: Bun.env.S3_BUCKET!,
      endpoint: Bun.env.S3_ENDPOINT,
      region: Bun.env.S3_REGION || "auto",
    })
  : null;

const caches = new Map<string, State>();
const writeChains = new Map<string, Promise<void>>();

async function readRaw(roomId: string): Promise<string | null> {
  roomId = canonRoom(roomId);
  if (useS3 && s3) {
    const file = s3.file(stateKey(roomId));
    if (await file.exists()) return await file.text();
    return null;
  }
  try {
    return await Bun.file(localStatePath(roomId)).text();
  } catch {
    return null;
  }
}

async function writeRaw(roomId: string, text: string): Promise<void> {
  roomId = canonRoom(roomId);
  if (useS3 && s3) {
    await s3.file(stateKey(roomId)).write(text);
  } else {
    await Bun.write(localStatePath(roomId), text);
  }
}

export async function loadState(roomId: string): Promise<State> {
  roomId = canonRoom(roomId);
  const cached = caches.get(roomId);
  if (cached) return cached;
  let state: State;
  try {
    const raw = await readRaw(roomId);
    state = raw ? (JSON.parse(raw) as State) : defaultState();
    if (!state.answers) state.answers = {};
    if (!state.status) state.status = {};
    if (!state.comments) state.comments = {};
  } catch {
    state = defaultState();
  }
  caches.set(roomId, state);
  return state;
}

function trimHistory(state: State) {
  const keys = Object.keys(state.answers).sort();
  while (keys.length > MAX_HISTORY) {
    const removed = keys.shift()!;
    delete state.answers[removed];
    delete state.comments[removed];
  }
  for (const k of Object.keys(state.comments)) {
    if (state.comments[k].length > 100) state.comments[k] = state.comments[k].slice(-100);
  }
}

// Saves for a given room are serialized so two near-simultaneous requests
// never race each other's read-modify-write against the bucket. Different
// rooms never block each other.
export async function saveState(roomId: string, mutate: (state: State) => void): Promise<State> {
  roomId = canonRoom(roomId);
  const run = async () => {
    const state = await loadState(roomId);
    mutate(state);
    trimHistory(state);
    caches.set(roomId, state);
    await writeRaw(roomId, JSON.stringify(state));
  };
  const prevChain = writeChains.get(roomId) || Promise.resolve();
  const nextChain = prevChain.then(run, run);
  writeChains.set(roomId, nextChain);
  await nextChain;
  return caches.get(roomId)!;
}

// Room codes are two easy words plus two digits (e.g. "mossyfox47"): short to
// say aloud, easy to remember, and still plain letters+digits so every
// existing /r/<id> route and the "paste your room code" box accept them.
// Older 8-character random ids keep working untouched.
const ROOM_ADJ = ["amber","breezy","brave","bright","calm","clever","cosmic","cozy","crisp","dandy","eager","fuzzy","gentle","golden","happy","jolly","kind","lively","lucky","mellow","merry","mossy","nifty","olive","peachy","plucky","quiet","rosy","sunny","silver","snowy","speedy","swift","tidy","velvet","warm","windy","witty","zesty","lunar"];
const ROOM_NOUN = ["otter","panda","falcon","maple","harbor","meadow","comet","lantern","pebble","river","willow","fox","robin","cedar","daisy","ember","fern","heron","iris","koala","lotus","moon","nest","orchid","plum","quail","raven","sparrow","tulip","violet","wren","yarrow","zebra","acorn","badger","cloud","dune","glade","kite","tide"];
function randomRoomId(): string {
  const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];
  return pick(ROOM_ADJ) + pick(ROOM_NOUN) + String(10 + Math.floor(Math.random() * 90));
}

// Creates a brand-new, empty room and returns its id. Collisions are rare
// (about 144,000 possible codes) and retried below.
// Turns a name the first partner typed ("Our Sky!") into a room-code stem
// ("oursky"). Plain a-z/0-9 only, at most 16 characters; names with no Latin
// letters or digits (or too short) return "" and fall back to two random words.
export function roomSlug(name: string): string {
  const slug = (name || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "").slice(0, 16);
  return slug.length >= 3 ? slug : "";
}

export async function createRoom(preferredName?: string): Promise<string> {
  const stem = roomSlug(preferredName || "");
  let id = stem ? stem + String(10 + Math.floor(Math.random() * 90)) : randomRoomId();
  for (let tries = 0; tries < 40 && ((await readRaw(id)) !== null || canonRoom(id) !== id); tries++) {
    id = stem && tries < 30 ? stem + String(10 + Math.floor(Math.random() * 90)) : randomRoomId();
  }
  const fresh = defaultState();
  fresh.createdAt = new Date().toISOString();
  await writeRaw(id, JSON.stringify(fresh));
  caches.set(id, fresh);
  return id;
}

// Permanently wipes a room's state (and its cache entry / write chain), plus
// its currently-loaded puzzle photo if any. Older puzzle photos already
// queued or solved past aren't individually tracked once superseded, so
// this clears what's reachable — the state itself is what actually mattered.
export async function deleteRoom(roomId: string): Promise<void> {
  roomId = canonRoom(roomId);
  const state = await loadState(roomId);
  if (state.puzzleCurrentId) {
    try {
      if (useS3 && s3) await s3.file(puzzleImageKey(roomId, state.puzzleCurrentId)).delete();
      else await Bun.file(localPuzzlePath(roomId, state.puzzleCurrentId)).delete();
    } catch {}
  }
  for (const who of ["mark", "nikita"] as PersonKey[]) {
    try {
      if (useS3 && s3) await s3.file(photoKey(roomId, who)).delete();
      else await Bun.file(localPhotoPath(roomId, who)).delete();
    } catch {}
  }
  try {
    if (useS3 && s3) await s3.file(stateKey(roomId)).delete();
    else await Bun.file(localStatePath(roomId)).delete();
  } catch {}
  caches.delete(roomId);
  writeChains.delete(roomId);
}

// Every room id that exists, including "" for the legacy room — used by the
// daily cron job to iterate every room and push a badge update to anyone
// subscribed. Not cheap (lists the whole bucket), so only the cron job
// should call this, never a per-request path.
export async function listRoomIds(): Promise<string[]> {
  const ids: string[] = [""];
  if (useS3 && s3) {
    let continuationToken: string | undefined;
    do {
      const resp = await s3.list({ prefix: "rooms/", maxKeys: 1000, continuationToken });
      for (const obj of resp.contents || []) {
        const m = /^rooms\/([^/]+)\/state\.json$/.exec(obj.key);
        if (m) ids.push(m[1]);
      }
      continuationToken = resp.isTruncated ? resp.nextContinuationToken : undefined;
    } while (continuationToken);
  } else {
    try {
      for (const name of readdirSync(".")) {
        const m = /^local-state-(.+)\.json$/.exec(name);
        if (m) ids.push(m[1]);
      }
    } catch {}
  }
  return ids;
}

// One-time migration for a round active before puzzleRoundStartDate existed.
export async function ensurePuzzleMigrated(roomId: string): Promise<void> {
  const s = await loadState(roomId);
  if (s.puzzleCurrentId && !s.puzzleRoundStartDate) {
    await saveState(roomId, (st) => {
      if (st.puzzleCurrentId && !st.puzzleRoundStartDate) {
        st.puzzleRoundStartDate = todayKeyFor(st);
        st.puzzleBonusCredits = 0;
      }
    });
  }
}

// --- Email recovery index -------------------------------------------------
// Maps a *hashed* email (see util.ts hashEmail — the real address is never
// stored) to the room(s)/person(s) it's registered as, so someone who loses
// their room link can ask to have it re-sent. One shared file across every
// room, since the whole point is looking a person up without already
// knowing which room they're in.

export type EmailIndexEntry = { roomId: string; who: PersonKey };
type EmailIndex = Record<string, EmailIndexEntry[]>;

const EMAIL_INDEX_KEY = "email-index.json";
const LOCAL_EMAIL_INDEX_PATH = "./local-email-index.json";

let emailIndexCache: EmailIndex | null = null;
let emailIndexChain: Promise<void> = Promise.resolve();

async function readEmailIndexRaw(): Promise<string | null> {
  if (useS3 && s3) {
    const file = s3.file(EMAIL_INDEX_KEY);
    if (await file.exists()) return await file.text();
    return null;
  }
  try {
    return await Bun.file(LOCAL_EMAIL_INDEX_PATH).text();
  } catch {
    return null;
  }
}

async function writeEmailIndexRaw(text: string): Promise<void> {
  if (useS3 && s3) {
    await s3.file(EMAIL_INDEX_KEY).write(text);
  } else {
    await Bun.write(LOCAL_EMAIL_INDEX_PATH, text);
  }
}

async function loadEmailIndex(): Promise<EmailIndex> {
  if (emailIndexCache) return emailIndexCache;
  try {
    const raw = await readEmailIndexRaw();
    emailIndexCache = raw ? (JSON.parse(raw) as EmailIndex) : {};
  } catch {
    emailIndexCache = {};
  }
  return emailIndexCache;
}

// Looks up every room/person registered under this email's hash.
export async function lookupEmailIndex(hash: string): Promise<EmailIndexEntry[]> {
  const idx = await loadEmailIndex();
  return idx[hash] || [];
}

export async function addToEmailIndex(hash: string, entry: EmailIndexEntry): Promise<void> {
  const run = async () => {
    const idx = await loadEmailIndex();
    const list = idx[hash] || (idx[hash] = []);
    if (!list.some((e) => e.roomId === entry.roomId && e.who === entry.who)) list.push(entry);
    emailIndexCache = idx;
    await writeEmailIndexRaw(JSON.stringify(idx));
  };
  emailIndexChain = emailIndexChain.then(run, run);
  await emailIndexChain;
}

// Used when a person deletes their data — removes them from the recovery
// index entirely, same as removing them from the room.
export async function removeFromEmailIndex(hash: string, roomId: string, who: PersonKey): Promise<void> {
  const run = async () => {
    const idx = await loadEmailIndex();
    if (idx[hash]) {
      idx[hash] = idx[hash].filter((e) => !(e.roomId === roomId && e.who === who));
      if (idx[hash].length === 0) delete idx[hash];
    }
    emailIndexCache = idx;
    await writeEmailIndexRaw(JSON.stringify(idx));
  };
  emailIndexChain = emailIndexChain.then(run, run);
  await emailIndexChain;
}
