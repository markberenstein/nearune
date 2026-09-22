// Same Sky — room-scoped storage. S3-backed, local-file fallback.
//
// roomId === "" is the original/legacy room: it reads and writes the exact
// same keys the single-file version always used (state.json,
// puzzle-images/<id>.jpg, brand/<key>.png), so the existing production link
// keeps working untouched. Every other room gets its own prefixed keys
// under rooms/<roomId>/.

import { S3Client } from "bun";
import type { State, PersonKey } from "./types";
import { todayKeyPT } from "./util";

const MAX_HISTORY = 400;

export function defaultState(): State {
  return { version: 1, answers: {}, status: {}, comments: {} };
}

function stateKey(roomId: string): string {
  return roomId ? `rooms/${roomId}/state.json` : "state.json";
}
function localStatePath(roomId: string): string {
  return roomId ? `./local-state-${roomId}.json` : "./local-state.json";
}
export function puzzleImageKey(roomId: string, id: string): string {
  return roomId ? `rooms/${roomId}/puzzle-images/${id}.jpg` : `puzzle-images/${id}.jpg`;
}
export function localPuzzlePath(roomId: string, id: string): string {
  return roomId ? `./local-puzzle-${roomId}-${id}.jpg` : `./local-puzzle-${id}.jpg`;
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
  if (useS3 && s3) {
    await s3.file(stateKey(roomId)).write(text);
  } else {
    await Bun.write(localStatePath(roomId), text);
  }
}

export async function loadState(roomId: string): Promise<State> {
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

const ROOM_ID_CHARS = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o/1/l/i — easier to type/read aloud

function randomRoomId(): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += ROOM_ID_CHARS[Math.floor(Math.random() * ROOM_ID_CHARS.length)];
  return s;
}

// Creates a brand-new, empty room and returns its id. Collisions are
// astronomically unlikely at 8 chars from a 32-char alphabet, but a couple
// of retries costs nothing.
export async function createRoom(): Promise<string> {
  let id = randomRoomId();
  for (let tries = 0; tries < 5 && (await readRaw(id)) !== null; tries++) {
    id = randomRoomId();
  }
  const fresh = defaultState();
  await writeRaw(id, JSON.stringify(fresh));
  caches.set(id, fresh);
  return id;
}

// One-time migration for a round active before puzzleRoundStartDate existed.
export async function ensurePuzzleMigrated(roomId: string): Promise<void> {
  const s = await loadState(roomId);
  if (s.puzzleCurrentId && !s.puzzleRoundStartDate) {
    await saveState(roomId, (st) => {
      if (st.puzzleCurrentId && !st.puzzleRoundStartDate) {
        st.puzzleRoundStartDate = todayKeyPT();
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
