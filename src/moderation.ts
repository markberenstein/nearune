// Nearune — simple vulgar / NSFW screening for text people write to each other.
// A word list, not an AI judge: it catches the obvious. In "Make a friend"
// rooms (strangers) a match is rejected; in every other room it is only
// logged so the administrator can see it on the admin page.

const WORDS = [
  "fuck", "fucking", "fucker", "fck", "fuk", "fcking", "fuking", "phuck", "shite", "bullshit", "motherfucker", "shit", "bitch", "bastard", "asshole", "dick", "dickhead", "cock", "pussy",
  "cunt", "whore", "slut", "twat", "wank", "wanker", "cum", "cumming", "jizz", "blowjob", "handjob", "rimjob", "anal",
  "porn", "porno", "nude", "nudes", "naked", "sexting", "sext", "horny", "boner", "erection", "orgasm", "masturbate",
  "masturbating", "dildo", "vibrator", "fetish", "bdsm", "hentai", "onlyfans", "nsfw", "tits", "titties", "boobs", "nipple",
  "nipples", "penis", "vagina", "genitals", "breast", "boob", "boobie", "boobies", "testicle", "testicles", "scrotum", "clitoris", "vulva", "butthole", "arse", "send pics", "dick pic", "nigger", "nigga", "faggot", "retard", "tranny",
  // Insults and more slurs: the writer is only asked to double-check (in rooms
  // between people who know each other), so lean toward flagging. Mild
  // profanity (damn, crap, piss, wtf...) is deliberately allowed.
  "idiot", "moron", "loser", "dumbass", "jackass", "asshat", "arsehole", "douche", "douchebag", "prick", "scumbag", "jerkoff",
  "fag", "dyke", "spic", "chink", "kike", "gook", "wetback", "retarded", "slutty", "skank", "hoe",
];

const SUBS: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i" };

function normalize(text: string): string {
  let t = text.toLowerCase().replace(/(?<=[a-z0-9])[*._\-](?=[a-z0-9])/g, "").replace(/[01345 7@$!]/g, (c) => (c === " " ? " " : SUBS[c] || c));
  t = t.replace(/(.)\1{2,}/g, "$1$1"); // fuuuck -> fuuck
  return t.replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function screenText(text: string): string | null {
  const raw = text.toLowerCase().replace(/[^a-z0-9@$!\s]/g, " ");
  for (const variant of [normalize(text), normalize(raw)]) {
    const squeezed = variant.replace(/(.)\1+/g, "$1"); // fuuck -> fuck
    for (const w of WORDS) {
      const ws = w.replace(/(.)\1+/g, "$1");
      const re = new RegExp("(^|\\s)" + w.replace(/ /g, "\\s") + "(s|es)?(\\s|$)");
      const re2 = new RegExp("(^|\\s)" + ws.replace(/ /g, "\\s") + "(s|es)?(\\s|$)");
      if (re.test(variant) || re2.test(squeezed)) return w;
    }
  }
  return null;
}
