// Nearune — small shared helpers.

import type { State, PersonKey, PersonProfile } from "./types";

export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

// A keyed (HMAC) hash of an email address — used only to answer "have we
// seen this email before, and where" without ever storing the address
// itself anywhere. Unlike a plain hash, this can't be matched against a
// rainbow table of common emails even if someone got hold of the index
// file, because the secret never leaves the server.
//
// Set EMAIL_HASH_SECRET in the deploy environment for production; the
// fallback here only exists so local dev doesn't crash without it.
export async function hashEmail(email: string): Promise<string> {
  const secret = Bun.env.EMAIL_HASH_SECRET || "same-sky-dev-secret-change-me";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(email.trim().toLowerCase()));
  return Buffer.from(sig).toString("hex");
}

export function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// Accepts what people actually type for an Instagram username — "@mark.b",
// "mark.b", or a pasted profile link like "https://instagram.com/mark.b/?hl=en"
// — and returns the bare lowercase handle, or null if it isn't a valid
// Instagram username (1-30 chars of letters, digits, "." and "_"). Nothing
// here can PROVE the person owns that account; see /api/register for how
// that limits what a handle sign-up is allowed to do.
export function normalizeInstagramHandle(raw: string): string | null {
  let s = (raw || "").trim();
  s = s.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^(www\.)?instagram\.com\//i, "");
  s = s.split(/[/?#]/)[0];
  s = s.replace(/^@+/, "").toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(s) ? s : null;
}

export async function readJson(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

// Email passes through only this one outbound request — never stored.
export async function sendViaResend(to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  const key = Bun.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "no_key" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + key },
      body: JSON.stringify({ from: "Nearune <onboarding@resend.dev>", to: [to], subject, html }),
    });
    if (res.ok) return { ok: true };
    let msg = "send_failed";
    try {
      const d: any = await res.json();
      if (d && d.message) msg = d.message;
    } catch {}
    return { ok: false, error: msg };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

// SendGrid — used instead of Resend when SENDGRID_API_KEY is set. Unlike
// Resend's sandbox sender (which can only email the account owner until a
// full domain is verified), SendGrid's free Single Sender Verification lets
// one already-owned address (no domain needed) send to anyone.
export async function sendViaSendGrid(to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  const key = Bun.env.SENDGRID_API_KEY;
  if (!key) return { ok: false, error: "no_key" };
  const fromEmail = Bun.env.SENDGRID_FROM_EMAIL;
  if (!fromEmail) return { ok: false, error: "no_from_email" };
  try {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + key },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: fromEmail, name: "Nearune" },
        subject,
        content: [{ type: "text/html", value: html }],
      }),
    });
    if (res.ok) return { ok: true };
    let msg = "send_failed";
    try {
      const d: any = await res.json();
      if (d && d.errors && d.errors[0] && d.errors[0].message) msg = d.errors[0].message;
    } catch {}
    return { ok: false, error: msg };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

// Tries SendGrid first (works for any recipient, once a single sender is
// verified — see sendViaSendGrid above), falling back to Resend so nothing
// breaks before SendGrid is configured.
export async function sendEmail(to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  if (Bun.env.SENDGRID_API_KEY) return sendViaSendGrid(to, subject, html);
  return sendViaResend(to, subject, html);
}

// New day rolls over at 6:30am in whichever of the two people's zones is
// currently ahead — Asia/Kolkata (IST, fixed UTC+5:30) is always ahead of
// America/Los_Angeles, so 6:30am IST is the rollover instant. (Same
// rollover applies to every room, regardless of where its people actually are —
// matches the client, which computes the same thing independently.)
export function todayKeyPT(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => +parts.find((p) => p.type === t)!.value;
  let ms = Date.UTC(g("year"), g("month") - 1, g("day"));
  if (g("hour") < 6 || (g("hour") === 6 && g("minute") < 30)) ms -= 86400000;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// How many days before a scheduled travelFrom date the travel override can
// kick in early, when the person opted into travelShowEarly (see
// types.ts's PersonProfile) — a few days' heads-up for their partner
// instead of switching over right on the morning of.
const TRAVEL_EARLY_DAYS = 2;

// Whether `person`'s travel override (travelLocation/travelFrom/
// travelUntil/travelShowEarly — see types.ts) is in effect as of
// `todayKey`: a travel city is set, we're not past travelUntil, and we're
// at or after travelFrom itself — or, with travelShowEarly on,
// TRAVEL_EARLY_DAYS before it. No travelFrom means travel started the
// moment it was saved, so it's always "at or after" it.
function travelActive(person: PersonProfile | undefined, todayKey: string): boolean {
  if (!person?.travelLocation) return false;
  if (person.travelUntil && person.travelUntil < todayKey) return false;
  if (person.travelFrom && person.travelFrom > todayKey) {
    const earliestShow = person.travelShowEarly ? keyOffsetDays(person.travelFrom, -TRAVEL_EARLY_DAYS) : person.travelFrom;
    if (todayKey < earliestShow) return false;
  }
  return true;
}

// Where `who` should be treated as being right now, for weather and the
// local-lore line only (see types.ts's travel* fields) — their travel city
// while travelActive(), their registered home location otherwise.
// `todayKey` is todayKeyPT()'s result, passed in rather than recomputed
// here so a caller already holding it doesn't fetch the date twice.
export function effectiveLocation(person: PersonProfile | undefined, todayKey: string): string {
  if (travelActive(person, todayKey)) return person!.travelLocation!;
  return person?.location || "";
}

// Same idea as effectiveLocation, but for `who`'s own clock: their travel
// city's resolved timezone (travelTz) while travelActive(), their
// registered home tz otherwise.
export function effectiveTz(person: PersonProfile | undefined, todayKey: string): string | undefined {
  if (travelActive(person, todayKey) && person?.travelTz) return person.travelTz;
  return person?.tz;
}

// Whether `who` is currently (or, with travelShowEarly, about to be shown
// as) traveling — drives the small "✈️ traveling" marker next to their
// clock/weather/lore so their partner knows what they're seeing is a
// travel city, not home.
export function isTraveling(person: PersonProfile | undefined, todayKey: string): boolean {
  return travelActive(person, todayKey);
}

export function isDayComplete(state: State, key: string): boolean {
  const a = state.answers[key];
  return !!(a && a.mark && a.mark.text && a.nikita && a.nikita.text);
}

// How many of the two people (0/1/2) have NOT yet answered the given day's
// question — this is what both people's app-icon badges show (same number
// on both devices): 2 while neither has answered, 1 once one of you has,
// 0 once you both have.
export function unansweredCount(state: State, key: string): number {
  const a = state.answers[key];
  let n = 0;
  for (const who of ["mark", "nikita"] as PersonKey[]) {
    if (!a || !a[who] || !a[who]!.text) n++;
  }
  return n;
}

export function totalCompleteDays(state: State): number {
  return Object.keys(state.answers).filter((k) => isDayComplete(state, k)).length;
}

// Counts complete days on/after startKey — unlocks pieces per day of this round.
export function daysCompleteSince(state: State, startKey: string): number {
  return Object.keys(state.answers).filter((k) => k >= startKey && isDayComplete(state, k)).length;
}

function keyOffsetDays(key: string, delta: number): string {
  const bits = key.split("-").map(Number);
  const d = new Date(Date.UTC(bits[0], bits[1] - 1, bits[2]) + delta * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// How many consecutive days (ending on key, inclusive) were both complete,
// as of that day — 0 if that day itself wasn't completed. Mirrors the
// "streak" shown on the Today tab, just evaluated as of a past date.
export function streakLengthAt(state: State, key: string): number {
  if (!isDayComplete(state, key)) return 0;
  let count = 0;
  let cursor = key;
  while (isDayComplete(state, cursor)) {
    count++;
    cursor = keyOffsetDays(cursor, -1);
  }
  return count;
}

// Keeping the streak alive earns more pieces per day, not just one: 5 days
// running bumps it to 2 a day, 10 days running bumps it to 3.
export function piecesForStreakLength(streakLen: number): number {
  if (streakLen >= 10) return 3;
  if (streakLen >= 5) return 2;
  return 1;
}

export const PUZZLE_TOTAL = 25;

// The authoritative unlocked-piece count for the current puzzle round —
// computed here (not just on the client) so every device sees the same
// number straight from the server, including the streak speed-up above.
export function puzzleUnlockedCount(state: State): number {
  if (state.puzzleSolved) return PUZZLE_TOTAL;
  if (!state.puzzleRoundStartDate) return 0;
  const start = state.puzzleRoundStartDate;
  let unlocked = 0;
  for (const k of Object.keys(state.answers)) {
    if (k >= start && isDayComplete(state, k)) unlocked += piecesForStreakLength(streakLengthAt(state, k));
  }
  unlocked += state.puzzleBonusCredits || 0;
  return Math.min(Math.max(unlocked, 0), PUZZLE_TOTAL);
}

export function normalizeGuess(s: string): string {
  return (s || "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ");
}

export function guessMatches(guess: string, answer: string): boolean {
  const g = normalizeGuess(guess);
  const a = normalizeGuess(answer);
  if (!g || !a) return false;
  if (g === a) return true;
  if (g.length >= 4 && a.indexOf(g) !== -1) return true;
  if (a.length >= 4 && g.indexOf(a) !== -1) return true;
  return false;
}

// Pulls the next queued picture into "current" (carrying the one-piece bonus
// if it was earned by a correct guess), or clears current entirely once the
// batch is exhausted so the upload form reappears.
export function advanceQueue(s: State) {
  const bonus = !!s.puzzlePendingBonus;
  if (s.puzzleQueue && s.puzzleQueue.length > 0) {
    const next = s.puzzleQueue.shift()!;
    s.puzzleCurrentId = next.id;
    s.puzzleAnswer = next.answer;
    if (next.question) s.puzzleQuestion = next.question; else delete s.puzzleQuestion;
    s.puzzleRoundStartDate = todayKeyPT();
    s.puzzleBonusCredits = bonus ? 1 : 0;
    delete s.puzzleRoundBase;
  } else {
    delete s.puzzleCurrentId;
    delete s.puzzleAnswer;
    delete s.puzzleQuestion;
    delete s.puzzleSetBy;
    delete s.puzzleRoundBase;
    delete s.puzzleRoundStartDate;
    delete s.puzzleBonusCredits;
  }
  s.puzzleSolved = false;
  s.puzzlePendingBonus = false;
  delete s.puzzleLastGuessDate;
  delete s.puzzleLastGuessBy;
  delete s.puzzleLastGuessText;
  delete s.puzzleLastGuessCorrect;
}

// Strips the secret puzzle answer and live confirm/invite tokens (client
// only sees a pending boolean, never the token itself). Also strips each
// person's cloned-voice provider id (see types.ts's PersonProfile.voiceId)
// down to a plain hasVoice boolean, same idea.
export function forClient(state: State): State {
  const { pendingConfirm, pendingInvite, ...base } = state as any;
  const pc: Record<string, boolean> = {};
  if (pendingConfirm) for (const k of Object.keys(pendingConfirm)) pc[k] = true;
  const pi: Record<string, boolean> = {};
  // Invites sent to an Instagram handle (no email involved) — the handle is
  // what the inviter typed, not a secret, and the client needs it to word
  // the "send them this link yourself" note correctly after a reload.
  const piHandle: Record<string, string> = {};
  if (pendingInvite) {
    for (const k of Object.keys(pendingInvite)) {
      pi[k] = true;
      if (pendingInvite[k] && pendingInvite[k].instagram) piHandle[k] = pendingInvite[k].instagram;
    }
  }
  // Computed fresh on every response — the client displays this number
  // as-is rather than recomputing it, so both devices always agree.
  const puzzleUnlocked = puzzleUnlockedCount(state);
  const withFlags = { ...base, pendingConfirm: pc, pendingInvite: pi, pendingInviteHandle: piHandle, puzzleUnlocked } as State;
  if (withFlags.people) {
    const strippedPeople: any = {};
    for (const k of Object.keys(withFlags.people)) {
      const p: any = (withFlags.people as any)[k];
      const { voiceId, ...rest } = p;
      strippedPeople[k] = { ...rest, hasVoice: !!voiceId };
    }
    (withFlags as any).people = strippedPeople;
  }
  if (withFlags.puzzleSolved) return withFlags;
  const { puzzleAnswer, ...rest } = withFlags;
  return rest as State;
}
