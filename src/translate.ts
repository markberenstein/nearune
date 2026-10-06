// Nearune — translation providers. Google first, MyMemory as fallback.

// "Gibberish" is a just-for-fun language option (code "gib") with no real
// translation service behind it, so it's handled entirely locally: each
// word is deterministically remapped to invented syllables (same word
// always renders the same way, so it reads as a consistent language rather
// than random noise), while punctuation, spacing and numbers pass through
// untouched so sentence shape stays readable.
const GIBBERISH_SYLLABLES = [
  "zo", "ra", "fen", "glim", "tik", "mor", "blu", "nex", "quo", "vash",
  "dree", "plor", "snig", "wob", "yth", "zeel", "ur", "ith", "aka", "emo",
];
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function gibberishWord(word: string): string {
  let h = hashStr(word.toLowerCase());
  const syllableCount = Math.max(1, Math.min(4, Math.ceil(word.length / 3)));
  let out = "";
  for (let i = 0; i < syllableCount; i++) {
    out += GIBBERISH_SYLLABLES[h % GIBBERISH_SYLLABLES.length];
    h = Math.floor(h / 7) + i * 13;
  }
  return /^[A-Z]/.test(word) ? out.charAt(0).toUpperCase() + out.slice(1) : out;
}
export function translateToGibberish(text: string): string {
  return text.replace(/[A-Za-z]+/g, gibberishWord);
}

// "Klingon" (code "tlh") — same idea as Gibberish above: no real translation
// API speaks tlhIngan Hol, so it's generated locally. Unlike Gibberish's
// invented syllables, these are built from real Klingon phonology (its
// actual consonant and vowel inventory, including the distinctive tlh/gh/Q/'
// sounds) so it reads as recognizably Klingon-styled rather than random
// noise, while staying deterministic per word like Gibberish does.
const KLINGON_ONSETS = [
  "b", "ch", "D", "gh", "H", "j", "l", "m", "n", "ng", "p", "q", "Q", "r",
  "S", "t", "tlh", "v", "w", "y", "'",
];
const KLINGON_VOWELS = ["a", "e", "I", "o", "u"];
const KLINGON_CODAS = ["", "", "gh", "H", "j", "l", "m", "n", "ng", "p", "q", "r", "S", "t", "w", "y", "'"];
function klingonWord(word: string): string {
  let h = hashStr(word.toLowerCase());
  const syllableCount = Math.max(1, Math.min(4, Math.ceil(word.length / 3)));
  let out = "";
  for (let i = 0; i < syllableCount; i++) {
    const onset = KLINGON_ONSETS[h % KLINGON_ONSETS.length];
    h = Math.floor(h / 7) + i * 13;
    const vowel = KLINGON_VOWELS[h % KLINGON_VOWELS.length];
    h = Math.floor(h / 5) + i * 11;
    const coda = KLINGON_CODAS[h % KLINGON_CODAS.length];
    h = Math.floor(h / 3) + i * 17;
    out += onset + vowel + coda;
  }
  return /^[A-Z]/.test(word) ? out.charAt(0).toUpperCase() + out.slice(1) : out;
}
export function translateToKlingon(text: string): string {
  return text.replace(/[A-Za-z]+/g, klingonWord);
}

export async function translateViaGoogle(text: string, target: string): Promise<{ t: string | null; d: string }> {
  const gUrl =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=" +
    target +
    "&dt=t&q=" +
    encodeURIComponent(text);
  const res = await fetch(gUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) return { t: null, d: "" };
  const bodyText = await res.text();
  let data: any;
  try {
    data = JSON.parse(bodyText);
  } catch {
    return { t: null, d: "" };
  }
  const t = ((data && data[0]) || []).map((seg: any[]) => seg[0]).join("") || null;
  return { t, d: (data && data[2]) || "" };
}

export async function translateViaMyMemory(text: string, target: string, source: string): Promise<string | null> {
  const mUrl =
    "https://api.mymemory.translated.net/get?q=" +
    encodeURIComponent(text) +
    "&langpair=" +
    source +
    "|" +
    target;
  const res = await fetch(mUrl);
  if (!res.ok) return null;
  const data: any = await res.json();
  const translated = data && data.responseData && data.responseData.translatedText;
  // MyMemory reports errors (bad language code, quota, etc.) as HTTP 200
  // with the error text sitting where the translation would be, so a
  // string check is the only way to catch it — never show that raw error
  // text to a user as if it were a translation. responseStatus doubles as
  // a fast check for the common case (non-200 means something went wrong).
  if (
    !translated ||
    (data && data.responseStatus && data.responseStatus !== 200) ||
    /MYMEMORY WARNING/i.test(translated) ||
    /PLEASE SELECT/i.test(translated) ||
    /INVALID (SOURCE|TARGET) LANGUAGE/i.test(translated) ||
    /IS AN INVALID/i.test(translated) ||
    /^['"][a-z-]+['"] IS/i.test(translated)
  ) {
    return null;
  }
  return translated;
}

// Mirrors the LANGUAGES list embedded in the client (page.ts) — keep the two
// in sync if that list ever changes. Registration/invite forms submit the
// display name (e.g. "Hindi"), not the code, so this is how the server side
// turns that back into a code resolveTranslation can use.
const LANGUAGE_NAME_TO_CODE: Record<string, string> = {
  english: "en", hindi: "hi", spanish: "es", french: "fr", german: "de",
  portuguese: "pt", italian: "it", "mandarin chinese": "zh", japanese: "ja",
  korean: "ko", arabic: "ar", "farsi (persian)": "fa", russian: "ru",
  bengali: "bn", punjabi: "pa", gujarati: "gu", marathi: "mr", tamil: "ta",
  telugu: "te", urdu: "ur", dutch: "nl", polish: "pl", turkish: "tr",
  vietnamese: "vi", thai: "th", indonesian: "id", "tagalog (filipino)": "tl",
  greek: "el", hebrew: "he", swedish: "sv", norwegian: "no",
  ukrainian: "uk", romanian: "ro", czech: "cs", swahili: "sw",
  gibberish: "gib", klingon: "tlh",
};
export function langCodeForName(name: string): string | null {
  const s = (name || "").trim().toLowerCase();
  return LANGUAGE_NAME_TO_CODE[s] || null;
}

// Translates a batch of short, plain-text email strings into the language a
// person picked at registration (its display name, e.g. "Hindi" — not a
// code). Returns the English originals untouched, string-for-string, when
// the language is missing, unrecognized, or already English, and falls back
// to the English original for any individual string that fails to
// translate — an email should never go out half-translated-into-an-error.
// Keep each string short and self-contained (no embedded HTML tags): this
// runs each one through the same translator used for daily-question
// answers, which only handles plain text.
export async function translateEmailStrings(strings: string[], languageName: string): Promise<string[]> {
  const code = langCodeForName(languageName);
  if (!code || code === "en") return strings;
  const out: string[] = [];
  for (const s of strings) {
    if (!s) { out.push(s); continue; }
    try {
      const { translated } = await resolveTranslation(s, code, "en");
      out.push(translated || s);
    } catch {
      out.push(s);
    }
  }
  return out;
}

// Script-based source guess, used only when Google gave us nothing to go on.
// Avoids naively assuming the author always writes in their *registered*
// language — someone registered for Hindi may still type in English.
export function scriptGuessSource(text: string, target: string, alt: string): string | null {
  if (!alt || target === alt) return null;
  const nonAscii = (text.match(/[^\x00-\x7F]/g) || []).length;
  const latin = nonAscii < Math.max(2, text.length * 0.15);
  const tEn = target === "en", aEn = alt === "en";
  if (latin) return tEn ? target : aEn ? alt : null;
  return !tEn ? target : !aEn ? alt : null;
}

// Server /api/translate handler logic: tries Google at the guessed target,
// swaps to the alt language if Google detects the text is already in the
// target language, and only falls through to MyMemory (at the correct
// effective target) when the intended translation truly failed — never
// shows an untranslated "identity" result back as if it were a translation.
async function resolveTranslationOnce(text: string, target: string, alt: string): Promise<{ translated: string; via: string; eff: string }> {
  if (target === "gib" || alt === "gib") {
    return { translated: translateToGibberish(text), via: "gibberish", eff: "gib" };
  }
  if (target === "tlh" || alt === "tlh") {
    return { translated: translateToKlingon(text), via: "klingon", eff: "tlh" };
  }
  let translated: string | null = null;
  let eff = target;
  let via = "none";
  try {
    const g = await translateViaGoogle(text, target);
    if (g.t && alt && g.d === target) {
      eff = alt;
      translated = (await translateViaGoogle(text, alt)).t;
    } else {
      translated = g.t;
    }
    if (translated) via = "google";
  } catch {}
  if (!translated) {
    const hint = scriptGuessSource(text, target, alt);
    let mySource: string;
    if (hint) {
      mySource = hint;
      eff = hint === target ? alt : target;
    } else {
      mySource = eff === target ? (alt || "en") : target;
    }
    if (mySource !== eff) {
      try {
        translated = await translateViaMyMemory(text, eff, mySource);
        if (translated) via = "mymemory";
      } catch {}
    }
  }
  return { translated: translated || "", via, eff };
}

// Google's free endpoint starts refusing when a page load fires dozens of
// translations at once (every label on the screen) — which is what blanked
// out the translated questions and voices. So: successful translations are
// remembered (same text never re-asked), identical in-flight requests share
// one call, only a few run at a time, and a failure is retried once.
type TResult = { translated: string; via: string; eff: string };
const tCache = new Map<string, TResult>();
const tInflight = new Map<string, Promise<TResult>>();
const T_MAX_CONCURRENT = 3;
let tActive = 0;
const tWaiters: (() => void)[] = [];
async function tAcquire(): Promise<void> {
  if (tActive < T_MAX_CONCURRENT) { tActive++; return; }
  await new Promise<void>((resolve) => tWaiters.push(resolve));
}
function tRelease(): void {
  const next = tWaiters.shift();
  if (next) next(); else tActive--;
}
export async function resolveTranslation(text: string, target: string, alt: string): Promise<TResult> {
  const key = target + "|" + alt + "::" + text;
  const hit = tCache.get(key);
  if (hit) return hit;
  const running = tInflight.get(key);
  if (running) return running;
  const p = (async () => {
    await tAcquire();
    try {
      let r = await resolveTranslationOnce(text, target, alt);
      if (!r.translated) {
        await new Promise((res) => setTimeout(res, 500));
        r = await resolveTranslationOnce(text, target, alt);
      }
      if (r.translated) {
        if (tCache.size > 5000) tCache.clear();
        tCache.set(key, r);
      }
      return r;
    } finally {
      tRelease();
      tInflight.delete(key);
    }
  })();
  tInflight.set(key, p);
  return p;
}
