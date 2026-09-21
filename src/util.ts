// Same Sky — small shared helpers.

import type { State, PersonKey } from "./types";

export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
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
      body: JSON.stringify({ from: "Same Sky <onboarding@resend.dev>", to: [to], subject, html }),
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
        from: { email: fromEmail, name: "Same Sky" },
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

export function isDayComplete(state: State, key: string): boolean {
  const a = state.answers[key];
  return !!(a && a.mark && a.mark.text && a.nikita && a.nikita.text);
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
// only sees a pending boolean, never the token itself).
export function forClient(state: State): State {
  const { pendingConfirm, pendingInvite, ...base } = state as any;
  const pc: Record<string, boolean> = {};
  if (pendingConfirm) for (const k of Object.keys(pendingConfirm)) pc[k] = true;
  const pi: Record<string, boolean> = {};
  if (pendingInvite) for (const k of Object.keys(pendingInvite)) pi[k] = true;
  // Computed fresh on every response — the client displays this number
  // as-is rather than recomputing it, so both devices always agree.
  const puzzleUnlocked = puzzleUnlockedCount(state);
  const withFlags = { ...base, pendingConfirm: pc, pendingInvite: pi, puzzleUnlocked } as State;
  if (withFlags.puzzleSolved) return withFlags;
  const { puzzleAnswer, ...rest } = withFlags;
  return rest as State;
}
