// Public landing page for ads: GET /get
// Ad destination (Meta Traffic campaigns can't link straight to the App Store).
const DEFAULT_APP_STORE_URL = "https://apps.apple.com/app/id6815887440";

export function buildGetPage(): string {
  const appStoreUrl = Bun.env.APP_STORE_URL || DEFAULT_APP_STORE_URL;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nearune: a daily question for two</title>
<meta name="description" content="One question a day for two people. Hear their voice in your language, see their weather, music and local stories. Free on iPhone. Closer only by invite.">
<meta property="og:title" content="Nearune: a daily question for two">
<meta property="og:description" content="Hear their voice in your language. Free on iPhone. Closer only by invite.">
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

  <h1>Say it your way. <span>Hear it theirs.</span></h1>
  <p class="lede">One question a day for two people. Answer in your own words, and hear theirs in your language.</p>

  <a class="badge" href="${appStoreUrl}" aria-label="Download Nearune on the App Store">
    <img src="/app-store-badge.png" alt="Download on the App Store">
  </a>
  <p class="note">Closer only by invite. Download, then invite one person.</p>

  <section class="cards" aria-label="What's inside">
    <div class="card q">
      <div class="label">TODAY'S QUESTION</div>
      <div class="text">What small thing made you smile today?</div>
    </div>
    <div class="card">
      <h2>Their voice, in your language</h2>
      <p>Hear their answer in their own voice, without having to call.</p>
    </div>
    <div class="card">
      <h2>A window into their day</h2>
      <p>Their local weather, what's playing near them, and a funny local story.</p>
    </div>
    <div class="card">
      <h2>Small moments add up</h2>
      <p>Solve a shared puzzle and keep your streak going together.</p>
    </div>
  </section>

  <section class="cta">
    <h2>Two people. One question.</h2>
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
