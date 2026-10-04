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
    const text = (data && data.content && data.content[0] && data.content[0].text) || "";
    const verdict = text.trim().toUpperCase();
    if (verdict.indexOf("YES") === 0) return true;
    if (verdict.indexOf("NO") === 0) return false;
    return null;
  } catch {
    return null;
  }
}
