// Nearune — translation providers. Google first, MyMemory as fallback.

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
export async function resolveTranslation(text: string, target: string, alt: string): Promise<{ translated: string; via: string; eff: string }> {
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
