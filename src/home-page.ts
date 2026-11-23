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
  /* Live-sky look (Nov 2026): a night sky behind everything, each room
     tile painted with that partner's real sky right now (their weather from
     WeatherKit, see roomSky()). One dark look in both phone themes. */
  :root { color-scheme: dark; --bg:#0B1230; --surface:#1A2252; --ink:#FFFFFF; --ink-soft:#C3C9E6; --line:rgba(255,255,255,0.22); --accent:#FFFFFF; --on-accent:#151A33; --friend:#FFD25A; --on-friend:#2A1B05; --danger:#FF9A88; --shadow:0 14px 34px rgba(0,0,0,0.35); }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { margin:0; background:var(--bg); color:var(--ink); font-family:'Manrope',sans-serif; min-height:100vh; padding:calc(36px + env(safe-area-inset-top)) 18px calc(28px + env(safe-area-inset-bottom)); display:flex; justify-content:center; }
  .wrap { max-width:460px; width:100%; }
  .brand { display:flex; align-items:center; justify-content:center; gap:12px; margin:0 0 26px; }
  .brand img { width:46px; height:46px; border-radius:11px; display:block; box-shadow:var(--shadow); }
  .brand h1 { font-weight:800; font-size:1.9rem; letter-spacing:-0.01em; margin:0; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  /* Your own sky right now (WeatherKit for your city, see applyHomeSky()).
     Until it loads, or if no room knows your city yet, the page is plain
     dark blue with no stars, so nothing here is a made-up sky. */
  #home-sky { position:fixed; inset:0; z-index:-1; pointer-events:none; transition:background 1.2s ease; }
  body.home-stars::before { content:""; position:fixed; inset:0 0 50% 0; pointer-events:none; opacity:0.7; z-index:0;
    background-image: radial-gradient(1.2px 1.2px at 8% 12%, #fff 99%, transparent), radial-gradient(1px 1px at 24% 30%, #fff 99%, transparent), radial-gradient(1.4px 1.4px at 40% 8%, #fff 99%, transparent), radial-gradient(1px 1px at 58% 24%, #fff 99%, transparent), radial-gradient(1.2px 1.2px at 74% 10%, #fff 99%, transparent), radial-gradient(1px 1px at 90% 28%, #fff 99%, transparent), radial-gradient(1px 1px at 16% 56%, #fff 99%, transparent), radial-gradient(1.2px 1.2px at 84% 60%, #fff 99%, transparent), radial-gradient(1px 1px at 46% 70%, #fff 99%, transparent); }
  .wrap { position:relative; z-index:1; }
  .box { position:relative; aspect-ratio:1; border-radius:26px; background:rgba(255,255,255,0.08); border:1px solid var(--line); box-shadow:var(--shadow); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; padding:14px; text-align:center; color:var(--ink); text-decoration:none; font:inherit; cursor:pointer; overflow:hidden; }
  .box.empty { background:transparent; border:2px dashed rgba(255,255,255,0.28); box-shadow:none; }
  .box.empty .plus { font-size:2.6rem; font-weight:300; color:var(--ink-soft); line-height:1; }
  .box.empty.first { background:var(--accent); border:none; box-shadow:var(--shadow); }
  .box.empty.first .plus, .box.empty.first .big, .box.empty.first .tr { color:var(--on-accent); }
  .box.friend { background:var(--friend); border:none; color:var(--on-friend); }
  .box.friend .x { color:var(--on-friend); }
  .box.friend.lead { box-shadow:0 0 0 3px var(--accent), var(--shadow); }
  .box.friend.lead .small { color:var(--on-friend); opacity:0.9; }
  .box.empty.second .big { font-size:1rem; color:var(--ink); }
  .box.sky { color:#FFFFFF; border:1px solid rgba(255,255,255,0.20); text-shadow:0 1px 8px rgba(0,0,0,0.30); justify-content:flex-end; align-items:flex-start; text-align:left; gap:2px; padding:16px; }
  .box.sky .who { font-size:0.7rem; font-weight:800; letter-spacing:0.12em; text-transform:uppercase; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .box.sky .time { font-size:1.75rem; font-weight:800; letter-spacing:-0.03em; line-height:1.05; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .box.sky .wx { font-size:0.78rem; font-weight:600; opacity:0.95; }
  .box.sky .small { color:rgba(255,255,255,0.88); }
  .box.sky .dot { position:absolute; top:16px; left:16px; }
  /* Things waiting for you in that room, same red as the in-room tab badges. */
  .box .todo { position:absolute; top:12px; left:12px; min-width:24px; height:24px; padding:0 7px; box-sizing:border-box; border-radius:12px; background:#E5372B; color:#FFFFFF; font-size:0.8rem; font-weight:800; display:flex; align-items:center; justify-content:center; text-shadow:none; box-shadow:0 2px 8px rgba(0,0,0,0.3); }
  .box.sky .x { color:#FFFFFF; }
  .box .big { font-weight:800; font-size:1.15rem; line-height:1.2; word-break:break-word; max-width:100%; }
  .box .small { font-size:0.78rem; color:var(--ink-soft); word-break:break-word; max-width:100%; }
  .box .glyph { font-size:2.1rem; line-height:1; }
  .box .dot { width:9px; height:9px; border-radius:50%; background:var(--ink-soft); opacity:0.5; }
  .box .dot.live { background:#6BE39A; opacity:1; }
  .box.gone { opacity:0.55; }
  .x { position:absolute; top:8px; right:10px; background:none; border:none; font:inherit; font-size:1.25rem; line-height:1; color:var(--ink-soft); padding:6px; cursor:pointer; }
  .pulse { animation:pulse 1.6s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.45; } }
  .welcome { text-align:center; margin:0 4px 18px; }
  .welcome .w1 { font-size:1.15rem; font-weight:700; color:var(--ink); margin:0 0 6px; }
  .welcome .w2 { font-size:0.92rem; line-height:1.45; color:var(--ink-soft); margin:0; }
  .welcome .tr { display:block; margin-top:4px; font-weight:500; opacity:0.85; }
  .box .tr { display:block; font-size:0.8rem; font-weight:600; opacity:0.85; margin-top:4px; }
  .msg { text-align:center; font-size:0.85rem; color:var(--danger); margin:14px 0 0; min-height:1em; }
  .foot { text-align:center; margin-top:26px; font-size:0.72rem; opacity:0.7; }
  .foot a { color:var(--ink-soft); margin:0 6px; }
  /* On the live sky, softer text is near-white and the footer is full
     strength (it was 70% faded, unreadable on a light sky). */
  body.home-sky-active { --ink-soft:#E8ECF8; }
  body.home-sky-active .foot { opacity:1; }
  body.home-sky-active .foot a { color:#FFFFFF; }
  /* "Support Nearune": one button, one line, pinned to the bottom-right
     corner (clear of the iPhone's home bar). The page gets extra room at
     the bottom so it never covers the footer links. */
  .tip-fab { position:fixed; right:max(16px, env(safe-area-inset-right)); bottom:calc(16px + env(safe-area-inset-bottom)); z-index:20; }
  .tip-fab a { display:inline-flex; align-items:center; gap:6px; white-space:nowrap; margin:0; padding:12px 18px; border-radius:999px; background:#FFFFFF; color:#151A33 !important; font-size:1rem; font-weight:800; text-decoration:none; box-shadow:0 8px 24px rgba(0,0,0,0.35); }
  body { padding-bottom:calc(84px + env(safe-area-inset-bottom)); }
  .sheet-bg { position:fixed; inset:0; background:rgba(4,8,24,0.60); display:flex; align-items:flex-end; justify-content:center; z-index:10; }
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
<div id="home-sky"></div>
<div class="wrap">
  <div class="brand"><img src="/apple-touch-icon.png" alt=""><h1>Nearune</h1></div>
  <div class="welcome" id="welcome" hidden>
    <p class="w1">One question a day with someone you care about.</p>
    <p class="w2">You both answer, then see each other&#39;s answer, plus a peek at their weather, time and local life. Tap <strong>Make a friend</strong> to be matched with someone new, or invite someone you know.</p>
  </div>
  <div class="grid" id="slots"></div>
  <p class="msg" id="msg"></p>
  <span id="nrTip" class="tip-fab" style="display:none"><a href="#" id="nrTipLink"><span class="tip-emoji">💛</span> Support Nearune</a></span><span id="nrSupport" class="tip-fab" style="display:none"><a href="https://donate.stripe.com/6oU9ATf6B0SZbcTgr22VG00" target="_blank" rel="noopener"><span class="tip-emoji">☕</span> Support Nearune</a></span><script>(function(){try{var e=["💛","☕","🌻","🌙","✨","🎁","🍩","🌈","🧁","🌷","🍀","🎈","💐","⭐","🍪","🌸","🔥","🍓","🌊","🎶","🌟"];var d=new Date(),n=Math.floor(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86400000),x=document.querySelectorAll(".tip-emoji");for(var k=0;k<x.length;k++)x[k].textContent=e[n%e.length];}catch(_){}})();</script>
  <p class="foot"><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/support">Support</a><script>(function(){try{var c=window.Capacitor,n=!!(c&&c.isNativePlatform&&c.isNativePlatform()),u=navigator.userAgent||"",w=/iPhone|iPad|iPod/.test(u)&&!/Safari/.test(u);if(!n&&!w){var s=document.getElementById("nrSupport");if(s)s.style.display="";}}catch(e){}})();</script></p>
</div>
<script>
(function () {
  var LS_ROOMS = "nearuneRooms", LS_FRIEND = "nearuneFriend", LS_DEV = "nearuneDevice", LS_MY = "nearuneMyRoom";
  var MAX_ROOMS = 3;
  // Up to 3 Make a friend rooms at once; each match gets its own tile and a
  // fresh Make a friend tile appears until the limit is reached.
  var MAX_FRIENDS = 3;
  function friendRooms() { return rooms.filter(function (r) { return r.friend; }); }

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

  // Tapping a notification that carries a page (e.g. an invite reminder)
  // opens that page in the app.
  (function () {
    try {
      var PNt = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications;
      if (!PNt || !PNt.addListener) return;
      PNt.addListener("pushNotificationActionPerformed", function (a) {
        try {
          var d = (a && a.notification && a.notification.data) || {};
          var u = typeof d.url === "string" ? d.url : "";
          if (u.charAt(0) === "/" && u.charAt(1) !== "/" && (location.pathname + location.search) !== u) location.href = u;
        } catch (e) {}
      });
    } catch (e) {}
  })();

  // Brand-new install that came from an invite link opened in Safari: the
  // server held the invite for this network for 2 hours. Ask once.
  (function () {
    try {
      var native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
      if (!native || rooms.length || localStorage.getItem("nearuneDeferredChecked")) return;
      localStorage.setItem("nearuneDeferredChecked", "1");
      fetch("/api/deferred-invite").then(function (r) { return r.json(); }).then(function (d) {
        if (d && typeof d.dest === "string" && d.dest.indexOf("/r/") === 0) location.href = d.dest;
        else showInvitePaste();
      }).catch(function () { showInvitePaste(); });
    } catch (e) {}
  })();

  // Backup for a new install that came from an invite but couldn't be
  // matched to it (switched from Wi-Fi to cellular, etc.): the invite page
  // copied the link, so one tap pastes it and opens the invite.
  function showInvitePaste() {
    try {
      var wel = document.getElementById("welcome");
      if (!wel || document.getElementById("invPaste")) return;
      var box = el("div", { id: "invPaste", style: "margin:14px auto;max-width:420px;color:#1F1A17;background:#FFF7EC;border:1px solid #E8D9C8;border-radius:18px;padding:14px;text-align:center" });
      box.appendChild(el("p", { style: "margin:0 0 10px;font-weight:700", text: "Got an invite?" }));
      var b = el("button", { type: "button", style: "background:#A8522A;color:#fff;border:0;border-radius:999px;padding:12px 22px;font-weight:800;font-size:1rem;font-family:inherit", text: "Paste your invite link" });
      var note = el("p", { style: "margin:8px 0 0;font-size:.85rem;color:#6F6054", text: "Or type the room code from the invite under Join a room." });
      b.addEventListener("click", function () {
        var go = function (t) {
          var m = String(t || "").match(new RegExp("/j/([a-z0-9]{1,40})/([a-z0-9-]{6,64})", "i"));
          if (m) { location.href = "/j/" + m[1].toLowerCase() + "/" + m[2]; return; }
          // a room they already joined in the browser (copied when they tapped Get the app)
          var mr = String(t || "").match(new RegExp("/r/([a-z0-9]{1,40})/[?]viewer=(mark|nikita)", "i"));
          if (mr) { location.href = "/r/" + mr[1].toLowerCase() + "/?viewer=" + mr[2].toLowerCase(); return; }
          note.textContent = "That isn't a Nearune invite link. Ask them to send it again, or type the room code under Join a room.";
        };
        try { navigator.clipboard.readText().then(go, function () { go(""); }); } catch (e) { go(""); }
      });
      box.appendChild(b); box.appendChild(note);
      wel.parentNode.insertBefore(box, wel.nextSibling);
    } catch (e) {}
  }

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
      .then(function (s) {
        briefs[id] = { s: s };
        var me = viewerOf(id), other = me === "mark" ? "nikita" : "mark";
        if (!me || !s || s.closed || !s.people) return;
        return fetch(id ? "/r/" + id + "/api/weather" : "/api/weather").then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) {
            if (!d || !d.weather) return;
            if (s.people[other] && d.weather[other]) briefs[id].w = d.weather[other];
            if (s.people[me] && d.weather[me]) briefs[id].mine = d.weather[me];
          })
          .catch(function () {});
      })
      .catch(function () { briefs[id] = { gone: true }; });
  }

  function viewerOf(id) {
    try { var v = localStorage.getItem("sameSkyViewer:" + id); if (v === "mark" || v === "nikita") return v; } catch (e) {}
    return null;
  }

  // The partner's sky right now, as a CSS background, from the room's own
  // weather (WeatherKit: condition, day/night, sunrise/sunset glow).
  function roomSky(w) {
    if (!w || !w.theme || !w.theme.sky) return "";
    var sky = w.theme.sky, glow = w.theme.glow || sky[1];
    var phase = w.phase || (w.isDay ? "day" : "night");
    // Navy wash over light skies so the white text on them is readable
    // (w.theme.scrim, worked out per sky in weather.ts and checked by QA).
    // Light at the top so the sky still reads as day, full strength from
    // 40% down where the name, time and weather sit.
    var sc = Number(w.theme.scrim) || 0;
    var scrim = sc > 0 ? "linear-gradient(180deg, rgba(10,16,42," + (sc * 0.25).toFixed(2) + ") 0%, rgba(10,16,42," + sc + ") 40%, rgba(10,16,42," + sc + ") 100%), " : "";
    if (phase === "dawn" || phase === "dusk") return scrim + "linear-gradient(170deg, " + sky[0] + " 0%, " + sky[1] + " 60%, " + glow + " 100%)";
    return scrim + "radial-gradient(ellipse 120% 70% at 50% -10%, " + glow + "55, transparent 65%), linear-gradient(170deg, " + sky[0] + " 0%, " + sky[1] + " 100%)";
  }
  // Same rule as the room's clock: a trip counts only between its start
  // and end dates (an old trip's time zone must not stick).
  function travelOn(p) {
    if (!p || !p.travelLocation) return false;
    var d = new Date(), today = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    if (p.travelUntil && p.travelUntil < today) return false;
    if (p.travelFrom && p.travelFrom > today) return false;
    return true;
  }
  function localTime(tz) {
    try { return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: tz }); } catch (e) { return ""; }
  }
  // How many things are waiting for you in a room, matching the red
  // badges inside it: today's question not answered yet, your turn at
  // Never Have I Ever, and the puzzle waiting for a photo.
  function todoCount(s, me) {
    var other = me === "mark" ? "nikita" : "mark";
    if (!s || !me || s.closed || !s.people || !s.people[me] || !s.people[other]) return 0;
    var n = 0;
    var day = s.todayKey;
    if (day && !(s.answers && s.answers[day] && s.answers[day][me])) n++;
    var nh = s.nhie;
    if (nh && nh.voted && nh.voted[other] && !nh.voted[me]) n++;
    if (s.origin !== "friend" && !s.puzzleCurrentId) n++;
    return n;
  }
  function todoBadge(n) {
    return el("span", { class: "todo", text: String(n), "aria-label": n + (n === 1 ? " thing" : " things") + " waiting for you" });
  }
  function roomBox(entry, isFriend) {
    var id = entry.id, b = briefs[id];
    if (b && b.s && b.w && !b.s.closed) {
      var sme = viewerOf(id), sother = sme === "mark" ? "nikita" : "mark";
      var sp = sme && b.s.people && b.s.people[sother];
      if (sp && sp.confirmed !== false) {
        var tile = el("a", { class: "box sky", href: roomHref(id) });
        tile.style.background = roomSky(b.w);
        var todo = todoCount(b.s, sme);
        tile.appendChild(todo ? todoBadge(todo) : el("span", { class: "dot live" }));
        // While they're on a trip, show where they are now, with ✈️ (the
        // sky, weather and time on the tile already follow the trip).
        var away = travelOn(sp) && sp.travelLocation;
        var where = away ? "✈️ " + String(sp.travelLocation).split(",")[0] : (sp.location ? String(sp.location).split(",")[0] : "");
        tile.appendChild(el("div", { class: "who", text: String(sp.name || "").split(" ")[0] + (where ? " · " + where : "") }));
        tile.appendChild(el("div", { class: "time", text: localTime(travelOn(sp) && sp.travelTz ? sp.travelTz : sp.tz) }));
        var wtemp = b.w.unit === "F" ? b.w.tempF + "°F" : b.w.tempC + "°C";
        tile.appendChild(el("div", { class: "wx", text: (b.w.theme.label || "") + " · " + wtemp }));
        if (b.s.roomName) tile.appendChild(el("div", { class: "small", text: b.s.roomName }));
        var sx = el("button", { class: "x", type: "button", text: "×", "aria-label": "Remove" });
        sx.addEventListener("click", function (ev) {
          ev.preventDefault(); ev.stopPropagation();
          if (window.confirm("Remove this room from this device?")) removeRoom(id);
        });
        tile.appendChild(sx);
        return tile;
      }
    }
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
    var todoN = live ? todoCount(b.s, viewerOf(id)) : 0;
    box.appendChild(todoN ? todoBadge(todoN) : el("span", { class: "dot" + (live ? " live" : "") }));
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

  // The phone's language (2-letter code) when Nearune supports it and it
  // isn't English. Used to show the welcome copy in that language too, the
  // same "English + translation" way the rest of the app does.
  var NR_LANGS = ["hi","es","fr","de","pt","it","zh","ja","ko","ar","fa","ru","bn","pa","gu","mr","ta","te","ur","nl","pl","tr","vi","th","id","tl","el","he","sv","no","uk","ro","cs","sw"];
  function phoneLang() {
    try {
      var list = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ""];
      for (var i = 0; i < list.length; i++) {
        var c = String(list[i] || "").toLowerCase().split("-")[0];
        if (c === "nb" || c === "nn") c = "no";
        if (c === "iw") c = "he";
        if (c === "fil") c = "tl";
        if (c === "en") return null;
        if (NR_LANGS.indexOf(c) >= 0) return c;
      }
    } catch (e) {}
    return null;
  }
  var PHONE_LANG = phoneLang();
  // Adds the translation of an English line under it (cached on the device).
  function addTranslation(target, text) {
    if (!PHONE_LANG || !target || !text) return;
    var key = "nrTr:" + PHONE_LANG + ":" + text;
    function put(tr) {
      if (!tr || tr === text || target.querySelector(".tr")) return;
      target.appendChild(el("span", { class: "tr", text: tr }));
    }
    var cached = null;
    try { cached = localStorage.getItem(key); } catch (e) {}
    if (cached) { put(cached); return; }
    fetch("/api/translate?target=" + PHONE_LANG + "&text=" + encodeURIComponent(text))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var tr = d && d.translated;
        if (!tr) return;
        try { localStorage.setItem(key, tr); } catch (e) {}
        put(tr);
      }).catch(function () {});
  }

  // The first tile creates the room right away and goes straight to its
  // setup screen (city, name, language, then the invite) — no in-between
  // "Start a room / Join a room" page. The other + tiles still open that
  // page, which is also where you join with a code.
  var creating = false;
  // This device's room that was created but never signed up in. Reused
  // when they tap "Invite your first Nearune partner" again, so backing out
  // and coming back doesn't leave a trail of empty rooms.
  var PENDING_ROOM_KEY = "nearunePendingRoom";
  function pendingRoom() {
    try {
      var p = JSON.parse(localStorage.getItem(PENDING_ROOM_KEY) || "null");
      if (p && p.id && Date.now() - p.at < 14 * 86400000) return p.id;
    } catch (e) {}
    return "";
  }
  function createRoomNow(box) {
    if (creating) return;
    creating = true;
    var label = box.querySelector(".big");
    if (label) label.textContent = "Creating your room…";
    var pending = pendingRoom();
    var reuse = pending
      ? fetch("/r/" + encodeURIComponent(pending) + "/api/state")
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (st) {
            // Still empty: nobody has signed up in it yet.
            if (!st || st.closed) return "";
            var ppl = Object.keys(st.people || {}).filter(function (k) { return st.people[k] && st.people[k].name; });
            return ppl.length === 0 ? pending : "";
          })
          .catch(function () { return ""; })
      : Promise.resolve("");
    reuse.then(function (id) {
      if (id) { location.href = "/r/" + id; return; }
      createFreshRoom(label);
    });
  }
  function createFreshRoom(label) {
    fetch("/api/create-room", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (res.ok && res.data && res.data.roomId) {
          nrTrack("room_created");
          try { localStorage.setItem(PENDING_ROOM_KEY, JSON.stringify({ id: res.data.roomId, at: Date.now() })); } catch (e) {}
          location.href = "/r/" + res.data.roomId;
          return;
        }
        creating = false;
        if (res.data && res.data.error === "registrations_paused") {
          if (label) label.textContent = "Invite your first Nearune partner";
          friendMsg = res.data.message || "We're working to catch up before welcoming more new rooms. Please check back tomorrow.";
          document.getElementById("msg").textContent = friendMsg;
          return;
        }
        location.href = "/new";
      })
      .catch(function () { creating = false; location.href = "/new"; });
  }
  // second: the invite tile shown after Make a friend to someone brand new, plain instead of highlighted
  function emptyBox(first, second) {
    var box = el("a", { class: "box empty" + (first ? (second ? " second" : " first") : ""), href: "/new", "aria-label": second ? "Invite someone you know" : first ? "Invite your first Nearune partner" : "Start a room" });
    box.addEventListener("click", function (ev) {
      nrTrack("tap_invite");
      // Every + tile makes the room right here (reusing an empty one this
      // phone already started) instead of sending people to the older /new
      // page, where tapping Back and trying again left a trail of empty rooms.
      ev.preventDefault(); createRoomNow(box);
    });
    box.appendChild(el("div", { class: "plus", text: "+" }));
    if (second) {
      box.appendChild(el("div", { class: "big", text: "Invite someone you know" }));
      addTranslation(box, "Invite someone you know");
    } else if (first) {
      var big = el("div", { class: "big", text: "Invite your first Nearune partner" });
      box.appendChild(big);
      addTranslation(box, "Invite your first Nearune partner");
    }
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
    // City suggestions, same as room sign-up: a pick list when the name is
    // ambiguous or misspelled, "Use my current location", and the language
    // pre-picked from the city (until they choose one themselves).
    var langTouched = !!prof.language;
    lg.addEventListener("change", function () { langTouched = true; });
    var locNote = el("div", { class: "sheet-err" });
    var choices = el("div", { class: "loc-choices" });
    choices.style.cssText = "display:none;margin:-4px 0 10px;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--surface);text-align:left";
    var geoTimer = null;
    function showChoices(list) {
      choices.innerHTML = "";
      if (!list || !list.length) { choices.style.display = "none"; return; }
      list.forEach(function (pl) {
        var b = el("button", { type: "button", text: pl.label });
        b.style.cssText = "display:block;width:100%;text-align:left;padding:12px 14px;border:0;border-bottom:1px solid var(--line);background:transparent;font:inherit;font-size:1rem;color:var(--ink);cursor:pointer";
        b.addEventListener("click", function () { ct.value = pl.label; showChoices([]); locNote.textContent = ""; lookUp(pl.label, true); });
        choices.appendChild(b);
      });
      choices.style.display = "block";
    }
    function lookUp(text, picked) {
      if (geoTimer) clearTimeout(geoTimer);
      var q = (text || "").trim();
      if (!q) { showChoices([]); locNote.textContent = ""; return; }
      geoTimer = setTimeout(function () {
        fetch("/api/geo?location=" + encodeURIComponent(q)).then(function (r) { return r.json(); }).then(function (info) {
          if (ct.value.trim() !== q) return;
          var pls = (info && info.places) || [];
          var exact = pls.some(function (pl) { return pl.label.toLowerCase() === q.toLowerCase(); });
          var sugg = !!(info && info.suggested) && pls.length > 0 && !exact;
          var amb = !picked && ((pls.length >= 2 && !exact) || sugg);
          locNote.textContent = picked ? "" : sugg ? "We couldn't find that spelling. Did you mean one of these?" : (info && info.city === false && !pls.length) ? "Please enter a city, not just a state or country (e.g. San Diego, CA)." : amb ? "Several places have that name. Pick yours:" : "";
          showChoices(amb ? pls : []);
          if (!langTouched && info && info.language && FRIEND_LANGS.indexOf(info.language) >= 0) lg.value = info.language;
        }).catch(function () {});
      }, picked ? 0 : 500);
    }
    ct.addEventListener("input", function () { lookUp(ct.value, false); });
    var here = el("button", { type: "button", text: "📍 Use my current location" });
    here.style.cssText = "display:block;margin:-4px auto 8px;padding:4px 10px;border:0;background:transparent;font:inherit;font-size:0.85rem;color:var(--ink-soft);text-decoration:underline;cursor:pointer";
    if (!navigator.geolocation) here.style.display = "none";
    here.addEventListener("click", function () {
      locNote.textContent = "Finding your location…";
      var done = false;
      var guard = setTimeout(function () { if (!done) { done = true; locNote.textContent = "Couldn't get your location. Please type your city."; } }, 15000);
      navigator.geolocation.getCurrentPosition(function (pos) {
        if (done) return; done = true; clearTimeout(guard);
        fetch("/api/reverse-geo?lat=" + pos.coords.latitude + "&lon=" + pos.coords.longitude).then(function (r) { return r.json(); }).then(function (d) {
          if (d && d.label) { ct.value = d.label; locNote.textContent = ""; showChoices([]); lookUp(d.label, true); }
          else locNote.textContent = "Couldn't work out your city. Please type it.";
        }).catch(function () { locNote.textContent = "Couldn't work out your city. Please type it."; });
      }, function () { if (done) return; done = true; clearTimeout(guard); locNote.textContent = "Couldn't get your location. Please type your city."; }, { timeout: 10000, maximumAge: 600000 });
    });
    sh.appendChild(nm); sh.appendChild(ct); sh.appendChild(choices); sh.appendChild(locNote); sh.appendChild(here); sh.appendChild(lg); sh.appendChild(err);
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

  // lead: the first, highlighted tile for someone brand new
  function friendBox(lead) {
    var f = jget(LS_FRIEND, null);
    if (f && f.status === "matched" && !rooms.some(function (r) { return r.id === f.roomId; })) {
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
    var box = el("button", { class: "box friend" + (lead ? " lead" : ""), type: "button" });
    box.appendChild(el("div", { class: "glyph", text: "🤝" }));
    box.appendChild(el("div", { class: "big", text: "Make a friend" }));
    addTranslation(box, "Make a friend");
    if (lead) {
      var sub = el("div", { class: "small", text: "Get matched with someone new" });
      box.appendChild(sub);
      addTranslation(sub, "Get matched with someone new");
    }
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
    // Once the matched room is on the list, the pending match record is done.
    var pend = jget(LS_FRIEND, null);
    if (pend && pend.status === "matched" && rooms.some(function (r) { return r.id === pend.roomId; })) setFriend(null);
    var wel = document.getElementById("welcome");
    if (wel) wel.hidden = rooms.length > 0 || !!jget(LS_FRIEND, null);
    if (wel && !wel.hidden) {
      var w1 = wel.querySelector(".w1"), w2 = wel.querySelector(".w2");
      addTranslation(w1, "One question a day with someone you care about.");
      addTranslation(w2, "You both answer, then see each other's answer, plus a peek at their weather, time and local life. Tap Make a friend to be matched with someone new, or invite someone you know.");
    }
    var fr = friendRooms();
    // Someone brand new (no rooms, not waiting for a match) almost always came from an ad and has no one in mind, and the
    // invites they made were never opened. Make a friend comes first for them; "Invite someone you know" is the second tile.
    if (rooms.length === 0 && !jget(LS_FRIEND, null)) {
      slots.appendChild(friendBox(true));
      slots.appendChild(emptyBox(true, true));
      for (var j = 1; j < MAX_ROOMS; j++) slots.appendChild(emptyBox(false));
    } else {
      regular.forEach(function (r) { slots.appendChild(roomBox(r, false)); });
      for (var i = regular.length; i < MAX_ROOMS; i++) slots.appendChild(emptyBox(regular.length === 0 && i === 0));
      fr.forEach(function (r) { slots.appendChild(roomBox(r, true)); });
      if (fr.length < MAX_FRIENDS) slots.appendChild(friendBox());
    }
    document.getElementById("msg").textContent = friendMsg;
    pollFriend();
  }

  render();
  nrTrack("open");
  // Opened from a Make a friend room's "Start a room with them": make the new room right away and go to its invite,
  // as if the first empty tile was tapped. With no free room slot, Home just shows the rooms.
  if (/[?&]invite=1/.test(location.search)) {
    try { history.replaceState(null, "", location.pathname); } catch (e) {}
    var freeBox = document.querySelector("#slots .box.empty");
    if (freeBox) createRoomNow(freeBox);
  }
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
      if (!jget(LS_FRIEND, null) && friendRooms().length < MAX_FRIENDS) ageSheet();
    }
  } catch (e) {}
  // A match found while the app was closed (or before this update): open it once.
  (function () {
    var f = jget(LS_FRIEND, null);
    if (f && f.status === "matched" && !f.opened && !rooms.some(function (r) { return r.id === f.roomId; })) openMatch(f.roomId, f.token, f.who, f.ready);
  })();
  Promise.all(rooms.map(function (r) { return loadBrief(r.id); })).then(function () {
    // A Make a friend room closed because the match never joined: drop it so
    // the Make a friend tile is free again.
    var stale = rooms.filter(function (r) { var b = briefs[r.id]; return r.friend && b && b.s && b.s.closed && b.s.closedBy === "no_show"; });
    if (stale.length) { var pf = jget(LS_FRIEND, null); stale.forEach(function (r) { removeRoom(r.id); if (pf && pf.roomId === r.id) setFriend(null); }); render(); }
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
    applyHomeSky();
  });
  // The page background: your own sky right now, from the first room that
  // knows your city.
  function applyHomeSky() {
    var mine = null;
    for (var i = 0; i < rooms.length && !mine; i++) { var b = briefs[rooms[i].id]; if (b && b.mine) mine = b.mine; }
    var sky = document.getElementById("home-sky");
    if (!sky || !mine) return;
    sky.style.background = roomSky(mine).replace(/170deg/g, "180deg");
    document.body.classList.add("home-sky-active");
    var ph = mine.phase || (mine.isDay ? "day" : "night");
    document.body.classList.toggle("home-stars", ph === "night" || ph === "dusk");
  }
  // Partner times on the sky tiles tick over every 30 seconds.
  setInterval(function () {
    if (document.querySelector(".sheet-bg")) return;
    if (document.querySelectorAll(".box.sky").length) render();
  }, 30000);
})();
</script>
</body>
</html>`;
}
