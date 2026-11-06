// Public landing page for ads: GET /get
// Ad destination (Meta Traffic campaigns can't link straight to the App Store).
const DEFAULT_APP_STORE_URL = "https://apps.apple.com/app/id6815887440";

// Copy for the page. "military" is for deployed service members and the
// families waiting at home (/military); the default is the general ad page.
const COPY = {
  general: {
    title: "Nearune: a daily question for two",
    desc: "One question a day for two people. Hear their voice in your language, see their weather, music and local stories. Free on iPhone. Closer only by invite.",
    ogDesc: "Hear their voice in your language. Free on iPhone. Closer only by invite.",
    h1: "Say it your way. <span>Hear it theirs.</span>",
    lede: "One question a day for two people. Answer in your own words, and hear theirs in your language.",
    question: "What small thing made you smile today?",
    cards: [
      ["Their voice, in your language", "Hear their answer in their own voice, without having to call."],
      ["A window into their day", "Their local weather, what's playing near them, and a funny local story."],
      ["Small moments add up", "Solve a shared puzzle and keep your streak going together."],
    ],
    cta: "Two people. One question.",
  },
  military: {
    title: "Nearune: stay in each other's day, deployed or home",
    desc: "A daily question for service members and the families waiting at home. Two clocks, answers that wait for both of you, and no need to be online at the same time. Free on iPhone.",
    ogDesc: "A daily question for service members and the people waiting at home. Free on iPhone.",
    h1: "Deployed, <span>still in each other's day.</span>",
    lede: "One question a day for you and the people at home. Answer when your shift ends. They answer when theirs does. You both see it once you've both replied.",
    question: "What was the best part of your day?",
    cards: [
      ["Two clocks, one glance", "Their time and yours, side by side, so you always know when it's morning for them."],
      ["No need to be online together", "Answers stay hidden until you've both replied, so there's no pressure to line up your schedules."],
      ["Their weather, their world", "See the weather where they are and what's happening nearby, even from far away."],
      ["For the whole family", "Invite a spouse, partner, parent or kid. Each room is private and only the two of you are in it."],
    ],
    cta: "Keep the people at home close.",
  },
};

export function buildGetPage(variant: "general" | "military" = "general"): string {
  const appStoreUrl = Bun.env.APP_STORE_URL || DEFAULT_APP_STORE_URL;
  const c = COPY[variant];
  const cardsHtml = c.cards.map((x) => `<div class="card"><h2>${x[0]}</h2><p>${x[1]}</p></div>`).join("\n    ");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${c.title}</title>
<meta name="description" content="${c.desc}">
<meta property="og:title" content="${c.title}">
<meta property="og:description" content="${c.ogDesc}">
<meta property="og:image" content="https://nearune.ai/apple-touch-icon.png">
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&display=swap" rel="stylesheet">
<style>
:root{--rust:#A8522A;--rust-dark:#8A4322;--cream:#FFF7EC;--ink:#1F1A17;--muted:#5C3A28;--card:#FFFFFF;--sky:#E3F0FB}
*{box-sizing:border-box}
body{margin:0;background:var(--cream);color:var(--ink);font-family:'Manrope',system-ui,-apple-system,sans-serif;line-height:1.5}
a{color:var(--rust-dark)}
.wrap{max-width:560px;margin:0 auto;padding:28px 20px 48px}
.top{display:flex;align-items:center;justify-content:space-between}
.logo{font-size:24px;font-weight:800;color:var(--rust);letter-spacing:-.3px}
.pill{font-size:13px;font-weight:700;background:var(--rust);color:#fff;padding:6px 12px;border-radius:999px}
h1{margin:40px 0 12px;font-size:44px;line-height:1.05;font-weight:800;letter-spacing:-1.5px}
h1 span{color:var(--rust)}
.lede{margin:0 0 28px;font-size:19px;color:var(--muted);font-weight:500}
.badge{display:inline-block;line-height:0}
.badge img{height:56px;width:auto}
.note{margin:12px 0 0;font-size:14px;color:var(--muted);font-weight:500}
.cards{margin:44px 0 0;display:grid;gap:14px}
.card{background:var(--card);border-radius:20px;padding:20px 22px;box-shadow:0 10px 30px rgba(31,26,23,.08)}
.card h2{margin:0 0 4px;font-size:18px;font-weight:800}
.card p{margin:0;font-size:15px;color:var(--muted)}
.q{background:var(--rust);color:#fff}
.q .label{font-size:12px;font-weight:800;letter-spacing:2px;opacity:.85}
.q .text{margin-top:6px;font-size:22px;font-weight:700;line-height:1.3}
.cta{margin:44px 0 0;text-align:center;background:var(--card);border-radius:24px;padding:28px 20px;box-shadow:0 10px 30px rgba(31,26,23,.08)}
.cta h2{margin:0 0 6px;font-size:26px;font-weight:800;letter-spacing:-.5px}
.cta p{margin:0 0 20px;color:var(--muted)}
footer{margin:40px 0 0;font-size:13px;color:var(--muted);text-align:center}
@media (min-width:600px){h1{font-size:56px}}
</style>
</head>
<body>
<main class="wrap">
  <div class="top">
    <div class="logo">Nearune</div>
    <div class="pill">Free on iPhone</div>
  </div>

  <h1>${c.h1}</h1>
  <p class="lede">${c.lede}</p>

  <a class="badge" href="${appStoreUrl}" aria-label="Download Nearune on the App Store">
    <img src="/app-store-badge.png" alt="Download on the App Store">
  </a>
  <p class="note">Closer only by invite. Download, then invite one person.</p>

  <section class="cards" aria-label="What's inside">
    <div class="card q">
      <div class="label">TODAY'S QUESTION</div>
      <div class="text">${c.question}</div>
    </div>
    ${cardsHtml}
  </section>

  <section class="cta">
    <h2>${c.cta}</h2>
    <p>Free on iPhone, iOS 15 or later.</p>
    <a class="badge" href="${appStoreUrl}" aria-label="Download Nearune on the App Store">
      <img src="/app-store-badge.png" alt="Download on the App Store">
    </a>
  </section>

  <footer>&copy; 2026 Nearune &middot; <a href="/privacy">Privacy</a> &middot; <a href="/terms">Terms</a> &middot; <a href="/support">Support</a></footer>
</main>
</body>
</html>
`;
}
