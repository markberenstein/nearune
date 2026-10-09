import { recordClaude } from "./usage";
// Nearune — puzzle-guess judging via Claude. util.ts's guessMatches() (exact
// or substring match on normalized text) is the fast, free, always-available
// first check; this is the slower fallback for "right idea, different
// words" guesses that substring matching can't catch (synonyms, paraphrase,
// typos past what substring forgives, a plural/singular mismatch, etc).
// Mirrors voice.ts's shape: gated behind an env var, every failure mode
// collapses to a single return value the caller treats uniformly.

const ANTHROPIC_BASE = "https://api.anthropic.com/v1/messages";
// Haiku: this is a small yes/no classification on a couple of short
// strings, not a task that benefits from a bigger/slower model.
const MODEL = "claude-haiku-4-5-20251001";

// Returns true/false once Claude has judged it, or null when no judgment
// was possible (no key configured, or the call failed) — null is NOT "no",
// so callers must keep their own non-AI check as the real fallback rather
// than treating null as a rejected guess.
export async function aiGuessMatches(guess: string, answer: string): Promise<boolean | null> {
  const key = Bun.env.ANTHROPIC_API_KEY;
  if (!key || !guess.trim() || !answer.trim()) return null;
  try {
    const res = await fetch(ANTHROPIC_BASE, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 5,
        system:
          "You judge whether a guess at a trivia-style answer counts as correct. " +
          "The guesser and the answer-setter are a couple playing a private memory " +
          "game together, so be generous: accept paraphrases, synonyms, minor " +
          "misspellings, missing articles, and partial-but-unambiguous answers " +
          "(e.g. a last name alone when the full answer is a full name, or a " +
          "nickname for a place/person). Reject only when the guess names a " +
          "genuinely different thing, or is too vague/generic to show the " +
          "guesser actually knows the specific answer. Reply with exactly one " +
          "word: YES or NO. No punctuation, no explanation.",
        messages: [
          { role: "user", content: "Correct answer: " + answer + "\nGuess: " + guess },
        ],
      }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    recordClaude("guess", data);
    const text = (data && data.content && data.content[0] && data.content[0].text) || "";
    const verdict = text.trim().toUpperCase();
    if (verdict.indexOf("YES") === 0) return true;
    if (verdict.indexOf("NO") === 0) return false;
    return null;
  } catch {
    return null;
  }
}

// Content screening for user-shared photos and short text (photo comments,
// puzzle answers/questions). Fails CLOSED: anything other than a clear "OK"
// verdict (no key, API error, unparsable reply) means "unavailable", and the
// caller refuses the upload rather than letting unchecked content through.
export type ModerationResult = "ok" | "blocked" | "unavailable";

export async function moderateContent(opts: { image?: Uint8Array; text?: string }): Promise<ModerationResult> {
  const key = Bun.env.ANTHROPIC_API_KEY;
  if (!key) return "unavailable";
  const text = (opts.text || "").trim();
  if (!opts.image && !text) return "ok";
  if (opts.image && opts.image.length > 4 * 1024 * 1024) return "unavailable";
  try {
    const content: any[] = [];
    if (opts.image) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: Buffer.from(opts.image).toString("base64") },
      });
    }
    content.push({ type: "text", text: text ? "Accompanying text: " + text : "(no text)" });
    const res = await fetch(ANTHROPIC_BASE, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 5,
        system:
          "You are a content-safety screen for a private two-person app where people share everyday photos and short notes. " +
          "Reply BLOCK if the image or text contains: nudity or sexually explicit/suggestive content, " +
          "any sexualized depiction of a minor, graphic violence or gore, self-harm, hate symbols or hate speech, " +
          "harassment or threats, illegal drugs being used or sold, or weapons shown in a threatening way. " +
          "Ordinary photos (people, pets, food, places, swimwear or beach photos that are not sexualized, family snaps) are fine. " +
          "Reply with exactly one word: OK or BLOCK.",
        messages: [{ role: "user", content }],
      }),
    });
    if (!res.ok) return "unavailable";
    const data: any = await res.json();
    recordClaude("moderation", data);
    const verdict = ((data && data.content && data.content[0] && data.content[0].text) || "").trim().toUpperCase();
    if (verdict.indexOf("BLOCK") === 0) return "blocked";
    if (verdict.indexOf("OK") === 0) return "ok";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

// Best-effort "where is this?" for a puzzle picture that has no GPS data.
// Returns a short place name, or null when unsure / no key / on any failure.
export async function guessPlaceFromImage(image: Uint8Array): Promise<string | null> {
  const key = Bun.env.ANTHROPIC_API_KEY;
  if (!key || image.length > 4 * 1024 * 1024) return null;
  try {
    const res = await fetch(ANTHROPIC_BASE, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 30,
        system:
          "You name the place shown in a photo. If a specific landmark, venue, park, or city is clearly identifiable, " +
          "reply with just its short name (e.g. \"Golden Gate Bridge\" or \"Central Park, New York\"). " +
          "If it is not clearly identifiable, or the photo mainly shows people, reply with exactly UNKNOWN.",
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: Buffer.from(image).toString("base64") } },
            { type: "text", text: "Where is this?" },
          ],
        }],
      }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    recordClaude("place", data);
    const out = ((data && data.content && data.content[0] && data.content[0].text) || "").trim().replace(/^["']|["'.]$/g, "");
    if (!out || /unknown/i.test(out) || out.length > 80) return null;
    return out;
  } catch {
    return null;
  }
}
