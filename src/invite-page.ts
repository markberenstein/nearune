// Nearune — the page behind a shared invite link (/j/<room>/<token>).
// It is also what iMessage / WhatsApp read to build the link preview card
// (title, text and the app logo). A phone that already has the app opens the
// app instead of this page (universal links), and inside the app it forwards
// straight on to the invite.

const DEFAULT_APP_STORE_URL = "https://apps.apple.com/app/id6815887440";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildInvitePage(opts: { origin: string; inviter: string; roomId: string; dest: string }): string {
  const appStoreUrl = Bun.env.APP_STORE_URL || DEFAULT_APP_STORE_URL;
  const who = opts.inviter ? esc(opts.inviter) : "Someone";
  const title = who + " invited you to Nearune";
  const desc = "One question a day, just for the two of you. Download the app to join.";
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
.card{background:var(--card);border:1px solid var(--line);border-radius:28px;box-shadow:0 14px 40px rgba(60,35,20,.12);padding:34px 24px 28px;max-width:400px;width:100%;text-align:center}
.logo{width:104px;height:104px;border-radius:26px;display:block;margin:0 auto 14px;box-shadow:0 10px 26px rgba(60,35,20,.22)}
.name{font-size:2.1rem;font-weight:800;letter-spacing:-.02em;margin:0 0 4px}
.sub{color:var(--muted);font-size:1.02rem;margin:0 0 26px}
.get{font-size:.8rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}
.badge{display:inline-block;line-height:0}
.badge img{height:56px;width:auto}
.web{display:inline-block;margin-top:20px;color:var(--muted);font-size:.9rem;text-decoration:underline}
.code{margin-top:22px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:.8rem}
.code b{display:block;color:var(--ink);font-size:1.15rem;margin-top:2px;word-break:break-all}
</style>
</head>
<body>
<main class="card">
  <img class="logo" src="/apple-touch-icon.png" alt="Nearune">
  <h1 class="name">Nearune</h1>
  <p class="sub">${who} invited you</p>
  <p class="get">Download the app</p>
  <a class="badge" href="${esc(appStoreUrl)}" aria-label="Download Nearune on the App Store"><img src="/app-store-badge.png" alt="Download on the App Store"></a>
  <p class="sub" style="margin:14px 0 0;font-size:.9rem">After it installs, open Nearune and it takes you straight to ${who === "Someone" ? "your invite" : who + "'s invite"}.</p>
  <div><a class="web" href="${dest}">No iPhone? Continue in your browser</a></div>
  ${opts.roomId ? '<div class="code">Room code<b>' + esc(opts.roomId) + "</b></div>" : ""}
</main>
<script>
try { if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) location.replace(${JSON.stringify(opts.dest).replace(/</g, "\\u003c")}); } catch (e) {}
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
    var b = document.querySelector("a.badge");
    if (b) b.addEventListener("click", function () {
      send("invite_to_store");
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
