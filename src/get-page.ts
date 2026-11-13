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
  if (variant === "general") return buildGetPageV2();
  return buildGetPageV1(variant);
}

// Landing page stats script, shared by both layouts. `page` is the label the
// admin Analytics table shows (e.g. "get (new)" -> "/get (new)").
function landingStatsScript(page: string): string {
  return `<script>
// Landing page stats: which page, where the visitor came from (ad tag or
// referring site), and whether they tapped the App Store button. Counts only.
(function () {
  try {
    var page = ${JSON.stringify(page)};
    var q = new URLSearchParams(location.search);
    var src = q.get("utm_campaign") || q.get("utm_source") || "";
    if (!src) {
      var r = ""; try { r = document.referrer ? new URL(document.referrer).hostname : ""; } catch (e) {}
      if (r && r.indexOf("nearune.ai") === -1) {
        src = /instagram|facebook|fb\\.|meta/i.test(r) ? "meta (untagged)" : /google\\./i.test(r) ? "google" : r.replace(/^www\\./, "");
      } else src = "direct";
    }
    src = src.toLowerCase().replace(/[^a-z0-9 ._()-]/g, "").slice(0, 40) || "direct";
    var send = function (step) {
      try { fetch("/api/journey", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ step: step, page: page, source: src }) }).catch(function () {}); } catch (e) {}
    };
    var k = "nrLp:" + page;
    var seen = false; try { seen = sessionStorage.getItem(k) === "1"; sessionStorage.setItem(k, "1"); } catch (e) {}
    if (!seen) send("lp_view");
    var badges = document.querySelectorAll("a.badge");
    for (var i = 0; i < badges.length; i++) badges[i].addEventListener("click", function () { send("lp_tap"); });
  } catch (e) {}
})();
</script>`;
}

const FOOTER_HTML = `<footer>&copy; 2026 Nearune &middot; <a href="/privacy">Privacy</a> &middot; <a href="/terms">Terms</a> &middot; <a href="/support">Support</a><span id="nrSupport" style="display:none"> &middot; <a href="https://donate.stripe.com/6oU9ATf6B0SZbcTgr22VG00" target="_blank" rel="noopener">☕ Support Nearune</a></span><script>(function(){try{var c=window.Capacitor,n=!!(c&&c.isNativePlatform&&c.isNativePlatform()),u=navigator.userAgent||"",w=/iPhone|iPad|iPod/.test(u)&&!/Safari/.test(u);if(!n&&!w){var s=document.getElementById("nrSupport");if(s)s.style.display="";}}catch(e){}})();</script></footer>`;

// New /get layout (Nov 2026): short promise + badge up top, a picture of a
// room so visitors see the app in a second, "they join free" said early, and
// a download bar that stays on screen. Uses the app's own colors.
function buildGetPageV2(): string {
  const appStoreUrl = Bun.env.APP_STORE_URL || DEFAULT_APP_STORE_URL;
  const c = COPY.general;
  const badge = (id: string) => `<a class="badge" id="${id}" href="${appStoreUrl}" aria-label="Download Nearune on the App Store"><img src="/app-store-badge.png" alt="Download on the App Store"></a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${c.title}</title>
<meta name="description" content="${c.desc}">
<meta property="og:title" content="${c.title}">
<meta property="og:description" content="${c.ogDesc}">
<meta property="og:image" content="https://nearune.ai/apple-touch-icon.png">
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--bg:#FBF3EC;--surface:#FFFFFF;--surface-2:#F3E4D6;--ink:#2B211B;--soft:#6F6054;--line:#E8D9C8;--accent:#A9532B;--accent-ink:#8A4A2B;--on-accent:#FFF8F1;--good:#7C8F63;color-scheme:light}
*{box-sizing:border-box}
html,body{background:var(--bg);color:var(--ink)}
body{margin:0;font-family:'Manrope',system-ui,-apple-system,sans-serif;line-height:1.5;-webkit-font-smoothing:antialiased}
a{color:var(--accent-ink)}
.wrap{max-width:520px;margin:0 auto;padding:20px max(20px,env(safe-area-inset-left)) 120px max(20px,env(safe-area-inset-right))}
.top{display:flex;align-items:center;justify-content:space-between}
.logo{font-size:22px;font-weight:800;color:var(--accent);letter-spacing:-.3px}
.pill{font-size:12px;font-weight:700;background:var(--accent);color:var(--on-accent);padding:5px 11px;border-radius:999px}
h1{margin:22px 0 8px;font-size:38px;line-height:1.05;font-weight:800;letter-spacing:-1.3px;text-wrap:balance}
h1 span{color:var(--accent)}
.lede{margin:0 0 18px;font-size:17px;color:var(--soft);font-weight:500}
.cta-row{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.badge{display:inline-block;line-height:0;border-radius:10px}
.badge img{height:54px;width:auto}
.free{font-size:14px;font-weight:700;color:var(--ink);line-height:1.3}
.free span{display:block;font-weight:500;color:var(--soft)}
/* Phone picture of a room */
.phone{margin:26px auto 0;max-width:330px;background:#1F1A17;border-radius:44px;padding:10px;box-shadow:0 24px 60px rgba(43,33,25,.22)}
.screen{background:var(--bg);border-radius:35px;padding:18px 14px 16px;display:grid;gap:10px}
.notch{width:96px;height:22px;background:#1F1A17;border-radius:0 0 14px 14px;margin:-18px auto 4px}
.clocks{display:flex;justify-content:space-between;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:10px 14px}
.clk b{display:block;font-size:19px;letter-spacing:-.4px}
.clk small{font-size:11px;font-weight:700;color:var(--soft);letter-spacing:.6px;text-transform:uppercase}
.clk.r{text-align:right}
.wx{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--soft)}
.qcard{background:var(--accent);color:var(--on-accent);border-radius:18px;padding:14px 16px}
.qcard small{font-size:10.5px;font-weight:800;letter-spacing:1.6px;opacity:.85}
.qcard div{font-size:17px;font-weight:700;line-height:1.3;margin-top:3px}
.ans{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:11px 13px}
.ans .who{font-size:11.5px;font-weight:800;color:var(--soft)}
.ans p{margin:2px 0 0;font-size:14px;font-weight:600;line-height:1.35}
.ans .tr{margin-top:5px;font-size:11px;font-weight:600;color:var(--soft)}
.play{margin-top:8px;display:flex;align-items:center;gap:8px;background:var(--surface-2);border-radius:999px;padding:5px 10px 5px 5px;font-size:12px;font-weight:700;color:var(--accent-ink);width:max-content}
.play i{width:22px;height:22px;border-radius:50%;background:var(--accent);display:grid;place-items:center}
.play i:after{content:"";border-left:7px solid var(--on-accent);border-top:4.5px solid transparent;border-bottom:4.5px solid transparent;margin-left:2px}
.wave{display:flex;gap:2px;align-items:center}
.wave b{width:2px;border-radius:2px;background:var(--accent);opacity:.6}
.caption{margin:12px 0 0;text-align:center;font-size:13px;color:var(--soft);font-weight:600}
/* Sections */
section{margin-top:36px}
h2{margin:0 0 12px;font-size:13px;font-weight:800;letter-spacing:2px;color:var(--accent)}
.steps{list-style:none;margin:0;padding:18px;background:var(--surface);border-radius:20px;display:grid;gap:14px;box-shadow:0 10px 30px rgba(43,33,25,.07)}
.steps li{display:grid;grid-template-columns:32px minmax(0,1fr);gap:12px;align-items:start}
.num{width:32px;height:32px;border-radius:50%;background:var(--accent);color:var(--on-accent);font-weight:800;display:grid;place-items:center;font-size:14px}
.steps b{display:block;font-size:16px}
.steps p{margin:1px 0 0;font-size:14.5px;color:var(--soft)}
.feats{display:grid;gap:10px}
.feat{border-top:1px solid var(--line);padding-top:12px}
.feat h3{margin:0;font-size:16px;font-weight:800}
.feat p{margin:2px 0 0;font-size:14.5px;color:var(--soft)}
details{border-top:1px solid var(--line);padding:11px 0}
details:last-child{border-bottom:1px solid var(--line)}
summary{cursor:pointer;font-weight:700;font-size:15.5px;list-style:none;display:flex;justify-content:space-between;gap:12px}
summary::-webkit-details-marker{display:none}
summary:after{content:"+";color:var(--accent);font-weight:800}
details[open] summary:after{content:"\\2013"}
details p{margin:6px 0 0;color:var(--soft);font-size:14.5px}
.invite{margin-top:36px;text-align:center;font-size:15px;font-weight:700;color:var(--soft)}
footer{margin:28px 0 0;font-size:13px;color:var(--soft);text-align:center}
/* Download bar that stays on screen */
.bar{position:fixed;left:0;right:0;bottom:0;z-index:20;background:rgba(251,243,236,.96);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border-top:1px solid var(--line);padding:9px max(16px,env(safe-area-inset-right)) calc(9px + env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));transform:translateY(110%);transition:transform .25s}
.bar.on{transform:none}
.bar-in{max-width:520px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px}
.bar-txt{font-size:14px;font-weight:800;line-height:1.2}
.bar-txt span{display:block;font-weight:500;color:var(--soft);font-size:12px}
.bar .badge img{height:44px}
@media (min-width:600px){h1{font-size:50px}}
@media (prefers-reduced-motion:reduce){.bar{transition:none}}
</style>
</head>
<body>
<main class="wrap">
  <div class="top">
    <div class="logo">Nearune</div>
    <div class="pill">Free on iPhone</div>
  </div>

  <h1>${c.h1}</h1>
  <p class="lede">One question a day for two people, in any language.</p>
  <div class="cta-row">
    ${badge("badge-top")}
    <div class="free">Free for both of you<span>Send one link. They join free.</span></div>
  </div>

  <div class="phone" role="img" aria-label="A Nearune room: today's question, both answers, one translated from Spanish with a button to hear it in their voice">
    <div class="screen">
      <div class="notch"></div>
      <div class="clocks">
        <div class="clk"><small>You</small><b>9:10 AM</b></div>
        <div class="clk r"><small>Sofía · Madrid</small><b>6:10 PM</b></div>
      </div>
      <div class="wx">☀️ 64° in Madrid · sunny</div>
      <div class="qcard"><small>TODAY'S QUESTION</small><div>${c.question}</div></div>
      <div class="ans">
        <div class="who">Sofía</div>
        <p>The baker downstairs saved me the last warm croissant.</p>
        <div class="tr">Translated from Spanish</div>
        <div class="play"><i></i><span class="wave">${[6, 11, 8, 14, 9, 12, 6, 10, 7, 13, 8, 5].map((h) => `<b style="height:${h}px"></b>`).join("")}</span>Her voice · 0:06</div>
      </div>
      <div class="ans">
        <div class="who">You</div>
        <p>My neighbor's dog waited at the door for me again.</p>
      </div>
    </div>
  </div>
  <p class="caption">Answer in your words. Hear theirs in your language, in their voice.</p>

  <section aria-labelledby="how">
    <h2 id="how">HOW IT WORKS</h2>
    <ol class="steps">
      <li><div class="num" aria-hidden="true">1</div><div><b>Download Nearune</b><p>Free from the App Store.</p></div></li>
      <li><div class="num" aria-hidden="true">2</div><div><b>Start your room</b><p>Your private space, just for the two of you.</p></div></li>
      <li><div class="num" aria-hidden="true">3</div><div><b>Send one link</b><p>Text it to the one person you want to share it with. They join free, and you both get today's question.</p></div></li>
    </ol>
  </section>

  <section aria-labelledby="inside">
    <h2 id="inside">WHAT'S INSIDE</h2>
    <div class="feats">
      ${c.cards.map((x) => `<div class="feat"><h3>${x[0]}</h3><p>${x[1]}</p></div>`).join("\n      ")}
    </div>
  </section>

  <section aria-labelledby="faq">
    <h2 id="faq">QUESTIONS</h2>
    <details><summary>Does the other person need the app?</summary><p>Yes, and it's free for them too. They tap your link, download Nearune, and land straight in your room.</p></details>
    <details><summary>Who can see our answers?</summary><p>Only the two of you. Each room is private and invite only.</p></details>
    <details><summary>What if we speak different languages?</summary><p>Each of you answers in your own language. Nearune shows and plays the other person's answer in yours.</p></details>
    <details><summary>Do we need to be online at the same time?</summary><p>No. Answer whenever it suits you. You'll both see each other's answers once you've both replied.</p></details>
  </section>

  <p class="invite">Closer only by invite.</p>
  ${FOOTER_HTML}
</main>

<div class="bar" id="bar" role="region" aria-label="Download">
  <div class="bar-in">
    <div class="bar-txt">Nearune<span>Free · They join free too</span></div>
    ${badge("badge-bar")}
  </div>
</div>
<script>
// Show the download bar once the top App Store button has scrolled away.
(function(){try{var t=document.getElementById("badge-top"),b=document.getElementById("bar");if(!("IntersectionObserver" in window)){b.classList.add("on");return;}new IntersectionObserver(function(e){b.classList.toggle("on",!e[0].isIntersecting);}).observe(t);}catch(e){}})();
</script>
${landingStatsScript("get (new)")}
</body>
</html>
`;
}

function buildGetPageV1(variant: "general" | "military"): string {
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

  <footer>&copy; 2026 Nearune &middot; <a href="/privacy">Privacy</a> &middot; <a href="/terms">Terms</a> &middot; <a href="/support">Support</a><span id="nrSupport" style="display:none"> &middot; <a href="https://donate.stripe.com/6oU9ATf6B0SZbcTgr22VG00" target="_blank" rel="noopener">☕ Support Nearune</a></span><script>(function(){try{var c=window.Capacitor,n=!!(c&&c.isNativePlatform&&c.isNativePlatform()),u=navigator.userAgent||"",w=/iPhone|iPad|iPod/.test(u)&&!/Safari/.test(u);if(!n&&!w){var s=document.getElementById("nrSupport");if(s)s.style.display="";}}catch(e){}})();</script></footer>
</main>
<script>
// Landing page stats: which page, where the visitor came from (ad tag or
// referring site), and whether they tapped the App Store button. Counts only.
(function () {
  try {
    var page = "${variant === "military" ? "military" : "get"}";
    var q = new URLSearchParams(location.search);
    var src = q.get("utm_campaign") || q.get("utm_source") || "";
    if (!src) {
      var r = ""; try { r = document.referrer ? new URL(document.referrer).hostname : ""; } catch (e) {}
      if (r && r.indexOf("nearune.ai") === -1) {
        src = /instagram|facebook|fb\.|meta/i.test(r) ? "meta (untagged)" : /google\./i.test(r) ? "google" : r.replace(/^www\./, "");
      } else src = "direct";
    }
    src = src.toLowerCase().replace(/[^a-z0-9 ._()-]/g, "").slice(0, 40) || "direct";
    var send = function (step) {
      try { fetch("/api/journey", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ step: step, page: page, source: src }) }).catch(function () {}); } catch (e) {}
    };
    var k = "nrLp:" + page;
    var seen = false; try { seen = sessionStorage.getItem(k) === "1"; sessionStorage.setItem(k, "1"); } catch (e) {}
    if (!seen) send("lp_view");
    var badges = document.querySelectorAll("a.badge");
    for (var i = 0; i < badges.length; i++) badges[i].addEventListener("click", function () { send("lp_tap"); });
  } catch (e) {}
})();
</script>
</body>
</html>
`;
}
