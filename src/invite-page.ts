// Nearune — the page behind a shared invite link (/j/<room>/<token>).
// It is also what iMessage / WhatsApp read to build the link preview card
// (title, text and the app logo). A phone that already has the app opens the
// app instead of this page (universal links), and inside the app it forwards
// straight on to the invite.

const DEFAULT_APP_STORE_URL = "https://apps.apple.com/app/id6815887440";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type InvitePreview = { question: string; isToday: boolean; city: string; tz: string; answered: boolean };

// A small look inside the room they're invited to: both clocks, the
// question waiting for them, and whether the inviter already answered.
function previewBlock(p: InvitePreview, who: string): string {
  const city = esc((p.city || "").split(",")[0].trim() || who);
  const tz = esc(p.tz || "");
  return `
  <div class="peek">
    <div class="clocks">
      <div class="clock"><span class="lbl">${city}</span><b data-tz="${tz}">&nbsp;</b></div>
      <span class="plane" aria-hidden="true">&#x2708;&#xFE0E;</span>
      <div class="clock you"><span class="lbl">You</span><b data-tz="">&nbsp;</b></div>
    </div>
    <div class="q">
      <span class="lbl">${p.isToday ? "Today's question" : "A question for you two"}</span>
      <p>${esc(p.question)}</p>
      ${p.answered ? `<div class="ans">&#x1F512; ${who} already answered. Join to see it.</div>` : `<div class="ans">Answer it, then see ${who === "Someone" ? "their" : who + "'s"} answer.</div>`}
    </div>
  </div>`;
}

export function buildInvitePage(opts: { origin: string; inviter: string; roomId: string; dest: string; preview?: InvitePreview | null }): string {
  const appStoreUrl = Bun.env.APP_STORE_URL || DEFAULT_APP_STORE_URL;
  const who = opts.inviter ? esc(opts.inviter) : "Someone";
  // Preview card wording reads as reaching out, not as a request to install
  // an app: who wants to stay close, and the question waiting for them.
  const title = opts.inviter ? who + " wants to stay close with you" : "Someone wants to stay close with you";
  const desc = opts.preview && opts.preview.question
    ? (opts.preview.isToday ? "Today's question" : "A question for you two") + ": \u201c" + esc(opts.preview.question) + "\u201d Answer it, then see " + (opts.inviter ? who + "'s" : "their") + " answer."
    : "One question a day, just for the two of you. Answer it, then see each other's answers.";
  const dest = esc(opts.dest);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Nearune">
<meta property="og:image" content="${esc(opts.origin)}/apple-touch-icon.png">
<meta name="twitter:card" content="summary">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&display=swap" rel="stylesheet">
<style>
:root{--rust:#A8522A;--cream:#FFF7EC;--ink:#1F1A17;--muted:#6F6054;--line:#E8D9C8;--card:#FFFFFF}
@media (prefers-color-scheme: dark){:root{--cream:#14171F;--ink:#F2EFE9;--muted:#A9AAB8;--line:#2B3040;--card:#1D2130;--rust:#E8B75A}}
*{box-sizing:border-box}
body{margin:0;background:var(--cream);color:var(--ink);font-family:'Manrope',system-ui,-apple-system,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:28px 18px}
.card{background:var(--card);border:1px solid var(--line);border-radius:28px;box-shadow:0 14px 40px rgba(60,35,20,.12);padding:24px 20px 22px;max-width:400px;width:100%;text-align:center}
.logo{width:64px;height:64px;border-radius:16px;display:block;margin:0 auto 10px;box-shadow:0 10px 26px rgba(60,35,20,.22)}
.name{font-size:1.7rem;font-weight:800;letter-spacing:-.02em;margin:0 0 4px}
.sub{color:var(--muted);font-size:1.02rem;margin:0 0 18px}
.get{font-size:.8rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}
.badges{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap}
.badge,.badge2{display:inline-block;line-height:0}
.badge img,.badge2 img{height:48px;width:auto}
.web{display:inline-block;margin-top:20px;color:var(--muted);font-size:.9rem;text-decoration:underline}
.peek{background:var(--cream);border:1px solid var(--line);border-radius:22px;padding:14px;margin:0 0 24px;text-align:left}
.clocks{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px}
.clock{flex:1 1 0;min-width:0;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:8px 10px;text-align:center}
.clock.you{border-color:var(--rust)}
.clock b{display:block;font-size:1.15rem;font-weight:800;margin-top:2px}
.plane{color:var(--muted);font-size:.9rem}
.lbl{display:block;font-size:.68rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.q{background:var(--rust);color:#fff;border-radius:16px;padding:14px 16px}
.q .lbl{color:rgba(255,255,255,.8)}
.q p{margin:6px 0 0;font-size:1.08rem;font-weight:700;line-height:1.3}
.ans{margin-top:10px;font-size:.85rem;opacity:.9}
.accept{display:block;width:100%;background:var(--rust);color:#fff;text-decoration:none;font-weight:800;font-size:1.15rem;padding:16px;border-radius:999px;box-shadow:0 8px 20px rgba(168,82,42,.3)}
.acc-note{color:var(--muted);font-size:.85rem;margin:10px 0 0}
.badge img,.badge2 img{height:40px!important}
.code{margin-top:22px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:.8rem}
.code b{display:block;color:var(--ink);font-size:1.15rem;margin-top:2px;word-break:break-all}
</style>
</head>
<body>
<main class="card">
  <img class="logo" src="/apple-touch-icon.png" alt="Nearune">
  <h1 class="name">Nearune</h1>
  <p class="sub">${who} invited you</p>
  ${opts.preview ? previewBlock(opts.preview, who) : ""}
  <a class="accept" id="acceptBtn" href="${dest}" data-web="1">Accept invite</a>
  <p class="acc-note" id="accNote">Join right here, no download needed. You can get the app later.</p>
  <p class="get" style="margin-top:18px">Prefer the app?</p>
  <div class="badges">
    <a class="badge" href="${esc(appStoreUrl)}" aria-label="Download Nearune on the App Store"><img src="/app-store-badge.png" alt="Download on the App Store"></a>
    <a class="badge2" href="https://play.google.com/store/apps/details?id=com.nearune.app" aria-label="Get Nearune on Google Play"><img src="/google-play-badge.svg" alt="Get it on Google Play"></a>
  </div>
  ${opts.roomId ? '<div class="code">Room code<b>' + esc(opts.roomId) + "</b></div>" : ""}
</main>
<script>
try { if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) location.replace(${JSON.stringify(opts.dest).replace(/</g, "\\u003c")}); } catch (e) {}
</script>
<script>
// Live clocks in the room peek: the inviter's time and the visitor's own.
(function () {
  function tick() {
    var els = document.querySelectorAll(".clock b");
    for (var i = 0; i < els.length; i++) {
      var tz = els[i].getAttribute("data-tz");
      try { els[i].textContent = new Intl.DateTimeFormat(undefined, tz ? { timeZone: tz, hour: "numeric", minute: "2-digit" } : { hour: "numeric", minute: "2-digit" }).format(new Date()); } catch (e) {}
    }
  }
  tick(); setInterval(tick, 30000);
})();
</script>
<script>
// Accept invite joins right here in the browser (it used to send people to the App Store first, a big ask for someone
// who just got a link). The store badges under it are for anyone who prefers the app; on this phone the matching one
// is shown first.
(function () {
  var ua = navigator.userAgent || "";
  if (/Android/i.test(ua)) { var b = document.querySelector(".badges"); var g = document.querySelector("a.badge2"); if (b && g) b.insertBefore(g, b.firstChild); }
})();
</script>
<script>var DEST = ${JSON.stringify(opts.dest).replace(/</g, "\\u003c")};</script>
<script>
// Anonymous funnel: the invited partner opened the invite, and whether they
// went to the App Store. Random device ID only.
(function () {
  try {
    var d = localStorage.getItem("nearuneDevice");
    if (!d || !/^[A-Za-z0-9]{16,64}$/.test(d)) {
      var c = "abcdefghijklmnopqrstuvwxyz0123456789"; d = "";
      for (var i = 0; i < 24; i++) d += c.charAt(Math.floor(Math.random() * c.length));
      localStorage.setItem("nearuneDevice", d);
    }
    var send = function (step) {
      try { fetch("/api/journey", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ device: d, step: step, platform: "web" }) }).catch(function () {}); } catch (e) {}
    };
    send("open"); send("invite_opened");
    // Which button they tapped, for the room's invite notes in Slack.
    var ROOM = ${JSON.stringify(opts.roomId || "").replace(/</g, "\\u003c")};
    var tell = function (step) {
      if (!ROOM) return;
      try { fetch("/api/invite-event", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ room: ROOM, step: step }) }).catch(function () {}); } catch (e) {}
    };
    var webs = document.querySelectorAll("a.web, a.accept[data-web]");
    for (var wi = 0; wi < webs.length; wi++) webs[wi].addEventListener("click", function () { tell("web"); });
    var bs = document.querySelectorAll("a.badge, a.badge2, a.accept:not([data-web])");
    for (var bi = 0; bi < bs.length; bi++) bs[bi].addEventListener("click", function () {
      tell(this.classList && this.classList.contains("accept") ? "accept" : "store");
      send(this.classList && this.classList.contains("accept") ? "invite_accept" : "invite_to_store");
      // Hold this invite so the app opens straight to it after install.
      try { fetch("/api/deferred-invite", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ dest: DEST }) }).catch(function () {}); } catch (e) {}
      try { if (navigator.clipboard) navigator.clipboard.writeText(location.href).catch(function () {}); } catch (e) {}
    });
  } catch (e) {}
})();
</script>
</body>
</html>
`;
}
