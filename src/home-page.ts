// Nearune — the opening page ("My rooms"). Three room slots plus one
// "Make a friend" slot. The list of rooms lives on the device itself (no
// accounts), so this page is plain HTML + a little script and never sends the
// list anywhere. NOTE: the script below must not contain backticks or dollar
// braces, because the whole page is one template literal.

export function buildHomePage(): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Nearune</title>
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap">
<style>
  :root { color-scheme: light; --bg:#FBF3EC; --surface:#FFFFFF; --ink:#2B211B; --ink-soft:#6F6054; --line:#E8D9C8; --accent:#A9532B; --on-accent:#FFF8F1; --friend:#F3E6F3; --danger:#B3361F; --shadow:0 6px 18px rgba(80,50,30,0.10); }
  @media (prefers-color-scheme: dark) {
    :root { color-scheme: dark; --bg:#14171F; --surface:#1D2130; --ink:#F2EFE9; --ink-soft:#A9AAB8; --line:#2B3040; --accent:#E8B75A; --on-accent:#1D2130; --friend:#2A2338; --danger:#FF8A75; --shadow:0 6px 18px rgba(0,0,0,0.35); }
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { margin:0; background:var(--bg); color:var(--ink); font-family:'Manrope',sans-serif; min-height:100vh; padding:calc(36px + env(safe-area-inset-top)) 18px calc(28px + env(safe-area-inset-bottom)); display:flex; justify-content:center; }
  .wrap { max-width:460px; width:100%; }
  .brand { display:flex; align-items:center; justify-content:center; gap:12px; margin:0 0 26px; }
  .brand img { width:46px; height:46px; border-radius:11px; display:block; box-shadow:var(--shadow); }
  .brand h1 { font-weight:800; font-size:1.9rem; letter-spacing:-0.01em; margin:0; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  .box { position:relative; aspect-ratio:1; border-radius:24px; background:var(--surface); border:1px solid var(--line); box-shadow:var(--shadow); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; padding:14px; text-align:center; color:var(--ink); text-decoration:none; font:inherit; cursor:pointer; overflow:hidden; }
  .box.empty { background:transparent; border:2px dashed var(--line); box-shadow:none; }
  .box.empty .plus { font-size:2.6rem; font-weight:300; color:var(--ink-soft); line-height:1; }
  .box.empty.first { background:var(--accent); border:none; box-shadow:var(--shadow); }
  .box.empty.first .plus, .box.empty.first .big { color:var(--on-accent); }
  .box.friend { background:var(--friend); }
  .box .big { font-weight:800; font-size:1.15rem; line-height:1.2; word-break:break-word; max-width:100%; }
  .box .small { font-size:0.78rem; color:var(--ink-soft); word-break:break-word; max-width:100%; }
  .box .glyph { font-size:2.1rem; line-height:1; }
  .box .dot { width:9px; height:9px; border-radius:50%; background:var(--ink-soft); opacity:0.5; }
  .box .dot.live { background:#3E9B5F; opacity:1; }
  .box.gone { opacity:0.55; }
  .x { position:absolute; top:8px; right:10px; background:none; border:none; font:inherit; font-size:1.25rem; line-height:1; color:var(--ink-soft); padding:6px; cursor:pointer; }
  .pulse { animation:pulse 1.6s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.45; } }
  .welcome { text-align:center; margin:0 4px 18px; }
  .welcome .w1 { font-size:1.15rem; font-weight:700; color:var(--ink); margin:0 0 6px; }
  .welcome .w2 { font-size:0.92rem; line-height:1.45; color:var(--ink-soft); margin:0; }
  .msg { text-align:center; font-size:0.85rem; color:var(--danger); margin:14px 0 0; min-height:1em; }
  .foot { text-align:center; margin-top:26px; font-size:0.72rem; opacity:0.7; }
  .foot a { color:var(--ink-soft); margin:0 6px; }
  .sheet-bg { position:fixed; inset:0; background:rgba(20,15,10,0.45); display:flex; align-items:flex-end; justify-content:center; z-index:10; }
  .sheet { background:var(--surface); width:100%; max-width:460px; border-radius:24px 24px 0 0; padding:26px 22px calc(26px + env(safe-area-inset-bottom)); text-align:center; }
  .sheet h2 { margin:0 0 18px; font-size:1.25rem; font-weight:800; }
  .btn { display:block; width:100%; background:var(--accent); color:var(--on-accent); border:none; border-radius:999px; padding:14px 22px; font:inherit; font-weight:700; font-size:1rem; cursor:pointer; margin:0 0 10px; }
  .btn.ghost { background:transparent; color:var(--ink-soft); }
  .sheet-note { margin:-8px 0 16px; color:var(--ink-soft); font-size:0.9rem; line-height:1.4; }
  .sheet-input { display:block; width:100%; box-sizing:border-box; margin:0 0 10px; padding:13px 14px; border:1px solid var(--line, #E3D6C6); border-radius:14px; background:var(--bg, #fff); color:var(--ink); font:inherit; font-size:1rem; }
  .sheet-err { color:#B3361F; font-size:0.88rem; min-height:1.2em; margin:0 0 8px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="brand"><img src="/apple-touch-icon.png" alt=""><h1>Nearune</h1></div>
  <div class="welcome" id="welcome" hidden>
    <p class="w1">One question a day with someone you care about.</p>
    <p class="w2">You both answer, then see each other&#39;s answer, plus a peek at their weather, time and local life. Invite your person, or tap <strong>Make a friend</strong> to be matched with someone new.</p>
  </div>
  <div class="grid" id="slots"></div>
  <p class="msg" id="msg"></p>
  <p class="foot"><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/support">Support</a><span id="nrTip" style="display:none"> · <a href="#" id="nrTipLink">💛 Support Nearune</a></span><span id="nrSupport" style="display:none"> · <a href="https://donate.stripe.com/6oU9ATf6B0SZbcTgr22VG00" target="_blank" rel="noopener">☕ Support Nearune</a></span><script>(function(){try{var c=window.Capacitor,n=!!(c&&c.isNativePlatform&&c.isNativePlatform()),u=navigator.userAgent||"",w=/iPhone|iPad|iPod/.test(u)&&!/Safari/.test(u);if(!n&&!w){var s=document.getElementById("nrSupport");if(s)s.style.display="";}}catch(e){}})();</script></p>
</div>
<script>
(function () {
  var LS_ROOMS = "nearuneRooms", LS_FRIEND = "nearuneFriend", LS_DEV = "nearuneDevice", LS_MY = "nearuneMyRoom";
  var MAX_ROOMS = 3;

  function jget(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v === null || v === undefined ? d : v; } catch (e) { return d; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function jdel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "text") n.textContent = attrs[k];
      else if (k === "class") n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  function deviceId() {
    var d = null;
    try { d = localStorage.getItem(LS_DEV); } catch (e) {}
    if (d && /^[A-Za-z0-9]{16,64}$/.test(d)) return d;
    var chars = "abcdefghijklmnopqrstuvwxyz0123456789", out = "";
    var buf = new Uint8Array(24);
    try { crypto.getRandomValues(buf); } catch (e) { for (var i = 0; i < 24; i++) buf[i] = Math.floor(Math.random() * 256); }
    for (var j = 0; j < 24; j++) out += chars.charAt(buf[j] % chars.length);
    try { localStorage.setItem(LS_DEV, out); } catch (e2) {}
    return out;
  }

  // Rooms this device knows. Older installs only remembered one room
  // ("nearuneMyRoom"), so seed the list from that.
  var rooms = jget(LS_ROOMS, []);
  if (!Array.isArray(rooms)) rooms = [];
  try {
    var my = localStorage.getItem(LS_MY);
    if (my && !rooms.some(function (r) { return r.id === my; })) rooms.push({ id: my });
    if (my === "" && !rooms.some(function (r) { return r.id === ""; })) {
      var lv = localStorage.getItem("sameSkyViewer:") || localStorage.getItem("sameSkyViewer");
      if (lv === "mark" || lv === "nikita") rooms.push({ id: "" });
    }
  } catch (e) {}
  jset(LS_ROOMS, rooms);

  function saveRooms() { jset(LS_ROOMS, rooms); }
  function removeRoom(id) {
    rooms = rooms.filter(function (r) { return r.id !== id; });
    saveRooms();
    try { if (localStorage.getItem(LS_MY) === id) localStorage.setItem(LS_MY, ""); } catch (e) {}
    render();
  }
  function roomHref(id) { return id ? "/r/" + id + "/" : "/?legacy=1"; }
  function stateUrl(id) { return id ? "/r/" + id + "/api/state" : "/api/state"; }

  var briefs = {}; // id -> {state} | {gone:true}
  function loadBrief(id) {
    return fetch(stateUrl(id)).then(function (r) { if (!r.ok) throw new Error("x"); return r.json(); })
      .then(function (s) { briefs[id] = { s: s }; })
      .catch(function () { briefs[id] = { gone: true }; });
  }

  function viewerOf(id) {
    try { var v = localStorage.getItem("sameSkyViewer:" + id); if (v === "mark" || v === "nikita") return v; } catch (e) {}
    return null;
  }

  function roomBox(entry, isFriend) {
    var id = entry.id, b = briefs[id];
    var name = "", sub = id === "" ? "Original room" : id, dead = false, gone = false, live = false;
    if (b && b.gone) { name = "Unavailable"; gone = true; }
    else if (b && b.s) {
      var s = b.s, me = viewerOf(id), other = me === "mark" ? "nikita" : "mark";
      if (s.roomName) sub = s.roomName;
      if (s.closed) { dead = true; name = "Ended"; }
      else if (me && s.people && s.people[other]) { name = s.people[other].name; live = true; }
      else name = "Waiting";
    } else name = "…";
    var box = el(dead || gone ? "div" : "a", { class: "box" + (isFriend ? " friend" : "") + (dead || gone ? " gone" : ""), href: roomHref(id) });
    box.appendChild(el("span", { class: "dot" + (live ? " live" : "") }));
    box.appendChild(el("div", { class: "big", text: name }));
    box.appendChild(el("div", { class: "small", text: sub }));
    var x = el("button", { class: "x", type: "button", text: "×", "aria-label": "Remove" });
    x.addEventListener("click", function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      if (dead || gone || window.confirm("Remove this room from this device?")) removeRoom(id);
    });
    box.appendChild(x);
    return box;
  }

  function emptyBox(first) {
    var box = el("a", { class: "box empty" + (first ? " first" : ""), href: "/new", "aria-label": first ? "Invite your first Nearune partner" : "Start a room" });
    box.addEventListener("click", function () { nrTrack("tap_invite"); });
    box.appendChild(el("div", { class: "plus", text: "+" }));
    if (first) box.appendChild(el("div", { class: "big", text: "Invite your first Nearune partner" }));
    return box;
  }

  // ---- Make a friend ----
  var friendMsg = "";
  var pollTimer = null;
  function setFriend(v) { if (v) jset(LS_FRIEND, v); else jdel(LS_FRIEND); }

  // In the app, ask for notifications while waiting so we can tell the person
  // the moment someone matches (even if the app is closed).
  function registerFriendPush(ticket) {
    try {
      var cap = window.Capacitor;
      if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return;
      var PN = cap.Plugins && cap.Plugins.PushNotifications;
      if (!PN) return;
      var android = cap.getPlatform && cap.getPlatform() === "android";
      var f0 = jget(LS_FRIEND, null);
      if (f0 && f0.pushed === ticket) return;
      var chain = android && PN.createChannel
        ? PN.createChannel({ id: "nearune", name: "Nearune", description: "Daily question and partner updates", importance: 4, visibility: 1 }).catch(function () {})
        : Promise.resolve();
      chain.then(function () { return PN.requestPermissions(); }).then(function (perm) {
        if (!perm || perm.receive !== "granted") {
          friendMsg = "Turn on notifications for Nearune in Settings and we will tell you the moment you match.";
          render(); return;
        }
        PN.addListener("registration", function (token) {
          fetch("/api/friend/push", { method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ ticket: ticket, subscription: { kind: android ? "fcm" : "apns", token: token.value } }) })
            .then(function () { var f = jget(LS_FRIEND, null); if (f && f.ticket === ticket) { f.pushed = ticket; setFriend(f); } })
            .catch(function () {});
        });
        PN.register();
      }).catch(function () {});
    } catch (e) {}
  }

  // Go straight into the match room to sign up, instead of only changing the
  // tile (people missed "Meet your match"). Done once per match, so backing
  // out to the rooms page doesn't bounce them in again.
  function openMatch(roomId, token, who, ready) {
    nrTrack("friend_matched");
    setFriend({ status: "matched", roomId: roomId, token: token, who: who, ready: ready, opened: true });
    if (ready && (who === "mark" || who === "nikita")) {
      // Already signed up on the server: remember which side is ours and go
      // straight to today's question.
      try { localStorage.setItem("sameSkyViewer:" + roomId, who); } catch (e) {}
      if (!rooms.some(function (r) { return r.id === roomId; })) { rooms.push({ id: roomId, friend: true }); saveRooms(); }
      location.href = "/r/" + roomId + "/";
      return;
    }
    location.href = "/j/" + roomId + "/" + token;
  }

  // Anonymous new-user funnel: random device ID + step name, nothing personal.
  var nrSent = {};
  var nrExisting = null;
  function nrTrack(step) {
    if (nrSent[step]) return; nrSent[step] = 1;
    if (nrExisting === null) nrExisting = rooms.length > 0;
    var plat = "web";
    try { if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) plat = "app"; } catch (e) {}
    try {
      fetch("/api/journey", { method: "POST", keepalive: true, headers: { "content-type": "application/json" },
        body: JSON.stringify({ device: deviceId(), step: step, platform: plat, existing: nrExisting }) }).catch(function () {});
    } catch (e) {}
  }
  function browserTz() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { return ""; } }
  function startFriend(profile) {
    friendMsg = "";
    var body = { device: deviceId(), adult: true };
    if (profile) body.profile = { name: profile.name, location: profile.location, language: profile.language, tz: browserTz() };
    fetch("/api/friend/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (x) {
        if (!x.ok) {
          friendMsg = x.d && x.d.error === "rate_limited" ? "Too many tries. Please wait a bit."
            : x.d && x.d.error === "registrations_paused" ? "Please check back tomorrow."
            : x.d && x.d.error === "city_required" ? "Please enter a city, like San Diego, CA."
            : x.d && x.d.error === "region_unavailable" ? "Make a friend isn't available in your area yet."
            : "Something went wrong. Please try again.";
          render(); return;
        }
        var d = x.d;
        if (d.status === "matched") { openMatch(d.roomId, d.token, d.who, d.ready); return; }
        else { setFriend({ status: "waiting", ticket: d.ticket }); registerFriendPush(d.ticket); }
        render();
      })
      .catch(function () { friendMsg = "Couldn't reach Nearune."; render(); });
  }

  var FRIEND_LANGS = ["Arabic", "Bengali", "Czech", "Dutch", "English", "Farsi (Persian)", "French", "German", "Gibberish", "Greek", "Gujarati", "Hebrew", "Hindi", "Indonesian", "Italian", "Japanese", "Klingon", "Korean", "Mandarin Chinese", "Marathi", "Norwegian", "Polish", "Portuguese", "Punjabi", "Romanian", "Russian", "Spanish", "Swahili", "Swedish", "Tagalog (Filipino)", "Tamil", "Telugu", "Thai", "Turkish", "Ukrainian", "Urdu", "Vietnamese"];
  function ageSheet() {
    nrTrack("tap_friend");
    var prof = jget("nearuneProfile", null) || {};
    var bg = el("div", { class: "sheet-bg" });
    var sh = el("div", { class: "sheet" });
    sh.appendChild(el("h2", { text: "Make a friend" }));
    sh.appendChild(el("p", { class: "sheet-note", text: "We'll match you with someone new for a daily question. You'll both see each other's first name, city and local time." }));
    var nm = el("input", { class: "sheet-input", type: "text", placeholder: "First name", maxlength: "40" }); nm.value = prof.name || "";
    var ct = el("input", { class: "sheet-input", type: "text", placeholder: "City, e.g. San Diego, CA", maxlength: "80" }); ct.value = prof.location || "";
    var lg = el("select", { class: "sheet-input" });
    var ph = el("option", { value: "", text: "Language" }); ph.disabled = true; lg.appendChild(ph);
    FRIEND_LANGS.forEach(function (n) { var o = el("option", { value: n, text: n }); lg.appendChild(o); });
    lg.value = prof.language && FRIEND_LANGS.indexOf(prof.language) >= 0 ? prof.language : "English";
    var err = el("div", { class: "sheet-err" });
    sh.appendChild(nm); sh.appendChild(ct); sh.appendChild(lg); sh.appendChild(err);
    var yes = el("button", { class: "btn", type: "button", text: "I'm 18 or older, find me a friend" });
    var no = el("button", { class: "btn ghost", type: "button", text: "Not now" });
    yes.addEventListener("click", function () {
      var p = { name: nm.value.trim(), location: ct.value.trim(), language: lg.value };
      if (!p.name || !p.location || !p.language) { err.textContent = "Please add your first name, city and language."; return; }
      jset("nearuneProfile", p);
      document.body.removeChild(bg);
      nrTrack("friend_submit");
      startFriend(p);
    });
    no.addEventListener("click", function () { document.body.removeChild(bg); });
    bg.addEventListener("click", function (ev) { if (ev.target === bg) document.body.removeChild(bg); });
    sh.appendChild(yes); sh.appendChild(no); bg.appendChild(sh);
    document.body.appendChild(bg);
  }

  function friendBox() {
    var friendRoom = null;
    rooms.forEach(function (r) { if (r.friend) friendRoom = r; });
    if (friendRoom) return roomBox(friendRoom, true);
    var f = jget(LS_FRIEND, null);
    if (f && f.status === "matched") {
      var m = el("a", { class: "box friend", href: "/j/" + f.roomId + "/" + f.token });
      m.appendChild(el("div", { class: "glyph", text: "🎉" }));
      m.appendChild(el("div", { class: "big", text: "Meet your match" }));
      return m;
    }
    if (f && f.status === "waiting") {
      var w = el("div", { class: "box friend" });
      w.appendChild(el("div", { class: "glyph pulse", text: "✨" }));
      w.appendChild(el("div", { class: "big pulse", text: f.long ? "Sorry, still waiting for your new friend to appear" : "Finding a friend…" }));
      var cx = el("button", { class: "x", type: "button", text: "×", "aria-label": "Cancel" });
      cx.addEventListener("click", function () {
        fetch("/api/friend/cancel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticket: f.ticket }) }).catch(function () {});
        setFriend(null); render();
      });
      w.appendChild(cx);
      return w;
    }
    var box = el("button", { class: "box friend", type: "button" });
    box.appendChild(el("div", { class: "glyph", text: "🤝" }));
    box.appendChild(el("div", { class: "big", text: "Make a friend" }));
    box.addEventListener("click", ageSheet);
    return box;
  }

  function pollFriend() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    var f = jget(LS_FRIEND, null);
    if (!f || f.status !== "waiting") return;
    registerFriendPush(f.ticket);
    function check() {
      fetch("/api/friend/status?ticket=" + encodeURIComponent(f.ticket)).then(function (r) { return r.json(); }).then(function (d) {
        if (d.status === "matched") { clearInterval(pollTimer); pollTimer = null; openMatch(d.roomId, d.token, d.who, d.ready); }
        else if (d.status === "waiting" && d.long && !f.long) { f.long = true; setFriend(f); render(); }
        else if (d.status === "none") { setFriend(null); friendMsg = "Your wait timed out. Please try again."; render(); }
      }).catch(function () {});
    }
    check();
    pollTimer = setInterval(check, 8000);
  }

  function render() {
    var slots = document.getElementById("slots");
    slots.innerHTML = "";
    var regular = rooms.filter(function (r) { return !r.friend; });
    // A friend room that now exists makes the pending match record obsolete.
    if (rooms.some(function (r) { return r.friend; })) setFriend(null);
    var wel = document.getElementById("welcome");
    if (wel) wel.hidden = rooms.length > 0 || !!jget(LS_FRIEND, null);
    regular.forEach(function (r) { slots.appendChild(roomBox(r, false)); });
    for (var i = regular.length; i < MAX_ROOMS; i++) slots.appendChild(emptyBox(regular.length === 0 && i === 0));
    slots.appendChild(friendBox());
    document.getElementById("msg").textContent = friendMsg;
    pollFriend();
  }

  render();
  nrTrack("open");
  // Time spent: seconds Nearune is on screen (visible), sent about once a
  // minute and when the app is hidden. Same random device ID, no content.
  (function () {
    var acc = 0, last = Date.now();
    function tick() {
      var now = Date.now();
      if (!document.hidden) acc += Math.min(now - last, 20000) / 1000;
      last = now;
    }
    function flush() {
      tick();
      var secs = Math.round(acc);
      if (secs < 3) return;
      acc = 0;
      var dev = deviceId(); if (!dev) return;
      var plat = "web";
      try { if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) plat = "app"; } catch (e) {}
      try { fetch("/api/journey", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ device: dev, step: "time", seconds: secs, platform: plat }) }).catch(function () {}); } catch (e) {}
    }
    setInterval(tick, 10000);
    setInterval(flush, 60000);
    document.addEventListener("visibilitychange", function () { if (document.hidden) flush(); else last = Date.now(); });
    window.addEventListener("pagehide", flush);
  })();

  try { var wl = document.getElementById("welcome"); if (wl && !wl.hidden) nrTrack("welcome_seen"); } catch (e) {}
  // In-app tip jar (iPhone app only). Tips go through Apple in-app purchase
  // as Apple requires; they unlock nothing. Hidden unless the app has the
  // purchase plugin AND Apple returns the tip products, so older app builds
  // and the website never show it (the website has its own Stripe link).
  var TIP_IDS = ["com.nearune.app.tip.small", "com.nearune.app.tip.medium", "com.nearune.app.tip.large"];
  var tipProducts = [];
  function tipPlugin() {
    try {
      var c = window.Capacitor;
      if (!c || !c.isNativePlatform || !c.isNativePlatform() || !c.getPlatform || c.getPlatform() !== "ios") return null;
      return (c.Plugins && c.Plugins.NativePurchases) || null;
    } catch (e) { return null; }
  }
  function tipSheet() {
    var np = tipPlugin();
    if (!np || !tipProducts.length) return;
    var bg = el("div", { class: "sheet-bg" });
    var sh = el("div", { class: "sheet" });
    sh.appendChild(el("h2", { text: "Support Nearune 💛" }));
    var note = el("p", { class: "sheet-note", text: "Nearune is free and independent. A tip helps keep it running. It doesn't unlock anything, it's just a thank-you." });
    sh.appendChild(note);
    var btns = [];
    tipProducts.forEach(function (p) {
      var b = el("button", { class: "btn", type: "button", text: "Tip " + p.priceString });
      b.addEventListener("click", function () {
        btns.forEach(function (x) { x.disabled = true; });
        note.textContent = "Opening Apple payment…";
        np.purchaseProduct({ productIdentifier: p.identifier }).then(function () {
          sh.innerHTML = "";
          sh.appendChild(el("h2", { text: "Thank you! 💛" }));
          sh.appendChild(el("p", { class: "sheet-note", text: "Your support means a lot and helps keep Nearune going." }));
          var ok = el("button", { class: "btn", type: "button", text: "Close" });
          ok.addEventListener("click", function () { if (bg.parentNode) document.body.removeChild(bg); });
          sh.appendChild(ok);
          fetch("/api/tip-log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ product: p.identifier }) }).catch(function () {});
        }).catch(function (err) {
          btns.forEach(function (x) { x.disabled = false; });
          var m = String((err && (err.message || err.code)) || "");
          note.textContent = /cancel/i.test(m) ? "No problem, maybe another time." : "That didn't go through. Please try again.";
        });
      });
      btns.push(b); sh.appendChild(b);
    });
    var no = el("button", { class: "btn ghost", type: "button", text: "Not now" });
    no.addEventListener("click", function () { document.body.removeChild(bg); });
    sh.appendChild(no);
    bg.addEventListener("click", function (ev) { if (ev.target === bg) document.body.removeChild(bg); });
    bg.appendChild(sh); document.body.appendChild(bg);
  }
  (function () {
    var np = tipPlugin();
    if (!np) return;
    np.getProducts({ productIdentifiers: TIP_IDS }).then(function (r) {
      tipProducts = ((r && r.products) || []).filter(function (p) { return p && p.identifier && p.priceString; })
        .sort(function (a, b) { return (a.price || 0) - (b.price || 0); });
      if (!tipProducts.length) return;
      var s = document.getElementById("nrTip"), a = document.getElementById("nrTipLink");
      if (s) s.style.display = "";
      if (a) a.addEventListener("click", function (ev) { ev.preventDefault(); tipSheet(); });
    }).catch(function () {});
  })();
  // "Find me a new friend" from a closed no-show room.
  try {
    if (new URLSearchParams(location.search).get("friend") === "1") {
      history.replaceState(null, "", "/home");
      if (!jget(LS_FRIEND, null)) ageSheet();
    }
  } catch (e) {}
  // A match found while the app was closed (or before this update): open it once.
  (function () {
    var f = jget(LS_FRIEND, null);
    if (f && f.status === "matched" && !f.opened && !rooms.some(function (r) { return r.friend; })) openMatch(f.roomId, f.token, f.who, f.ready);
  })();
  Promise.all(rooms.map(function (r) { return loadBrief(r.id); })).then(function () {
    // A Make a friend room closed because the match never joined: drop it so
    // the Make a friend tile is free again.
    var stale = rooms.filter(function (r) { var b = briefs[r.id]; return r.friend && b && b.s && b.s.closed && b.s.closedBy === "no_show"; });
    if (stale.length) { stale.forEach(function (r) { removeRoom(r.id); }); setFriend(null); render(); }
    // Remember name, city and language from an existing room, so the next
    // sign-up form on this device can be filled in already.
    try {
      if (!localStorage.getItem("nearuneProfile")) {
        rooms.some(function (r) {
          var b = briefs[r.id], me = viewerOf(r.id);
          var pp = b && b.s && b.s.people && me && b.s.people[me];
          if (pp && pp.name && pp.location) { jset("nearuneProfile", { name: pp.name, location: pp.location, language: pp.language || "" }); return true; }
          return false;
        });
      }
    } catch (e) {}
    // A friend room that has ended frees the friend spot again.
    var changed = false;
    rooms = rooms.filter(function (r) {
      var b = briefs[r.id];
      if (r.friend && b && ((b.s && b.s.closed) || b.gone)) { changed = true; return false; }
      return true;
    });
    if (changed) saveRooms();
    render();
  });
})();
</script>
</body>
</html>`;
}
