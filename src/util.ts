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
    s.puzzleRoundStartDate = todayKeyPT();
    s.puzzleBonusCredits = bonus ? 1 : 0;
    delete s.puzzleRoundBase;
  } else {
    delete s.puzzleCurrentId;
    delete s.puzzleAnswer;
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
  const withFlags = { ...base, pendingConfirm: pc, pendingInvite: pi } as State;
  if (withFlags.puzzleSolved) return withFlags;
  const { puzzleAnswer, ...rest } = withFlags;
  return rest as State;
}
