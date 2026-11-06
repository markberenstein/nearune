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
  .msg { text-align:center; font-size:0.85rem; color:var(--danger); margin:14px 0 0; min-height:1em; }
  .foot { text-align:center; margin-top:26px; font-size:0.72rem; opacity:0.7; }
  .foot a { color:var(--ink-soft); margin:0 6px; }
  .sheet-bg { position:fixed; inset:0; background:rgba(20,15,10,0.45); display:flex; align-items:flex-end; justify-content:center; z-index:10; }
  .sheet { background:var(--surface); width:100%; max-width:460px; border-radius:24px 24px 0 0; padding:26px 22px calc(26px + env(safe-area-inset-bottom)); text-align:center; }
  .sheet h2 { margin:0 0 18px; font-size:1.25rem; font-weight:800; }
  .btn { display:block; width:100%; background:var(--accent); color:var(--on-accent); border:none; border-radius:999px; padding:14px 22px; font:inherit; font-weight:700; font-size:1rem; cursor:pointer; margin:0 0 10px; }
  .btn.ghost { background:transparent; color:var(--ink-soft); }
</style>
</head>
<body>
<div class="wrap">
  <div class="brand"><img src="/apple-touch-icon.png" alt=""><h1>Nearune</h1></div>
  <div class="grid" id="slots"></div>
  <p class="msg" id="msg"></p>
  <p class="foot"><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/support">Support</a></p>
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
    box.appendChild(el("div", { class: "plus", text: "+" }));
    if (first) box.appendChild(el("div", { class: "big", text: "Invite your first Nearune partner" }));
    return box;
  }

  // ---- Make a friend ----
  var friendMsg = "";
  var pollTimer = null;
  function setFriend(v) { if (v) jset(LS_FRIEND, v); else jdel(LS_FRIEND); }

  function startFriend() {
    friendMsg = "";
    fetch("/api/friend/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ device: deviceId(), adult: true }) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (x) {
        if (!x.ok) {
          friendMsg = x.d && x.d.error === "rate_limited" ? "Too many tries. Please wait a bit."
            : x.d && x.d.error === "registrations_paused" ? "Please check back tomorrow."
            : "Something went wrong. Please try again.";
          render(); return;
        }
        var d = x.d;
        if (d.status === "matched") setFriend({ status: "matched", roomId: d.roomId, token: d.token });
        else setFriend({ status: "waiting", ticket: d.ticket });
        render();
      })
      .catch(function () { friendMsg = "Couldn't reach Nearune."; render(); });
  }

  function ageSheet() {
    var bg = el("div", { class: "sheet-bg" });
    var sh = el("div", { class: "sheet" });
    sh.appendChild(el("h2", { text: "Are you 18 or older?" }));
    var yes = el("button", { class: "btn", type: "button", text: "Yes, find me a friend" });
    var no = el("button", { class: "btn ghost", type: "button", text: "No" });
    yes.addEventListener("click", function () { document.body.removeChild(bg); startFriend(); });
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
    function check() {
      fetch("/api/friend/status?ticket=" + encodeURIComponent(f.ticket)).then(function (r) { return r.json(); }).then(function (d) {
        if (d.status === "matched") { setFriend({ status: "matched", roomId: d.roomId, token: d.token }); render(); }
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
    regular.forEach(function (r) { slots.appendChild(roomBox(r, false)); });
    for (var i = regular.length; i < MAX_ROOMS; i++) slots.appendChild(emptyBox(regular.length === 0 && i === 0));
    slots.appendChild(friendBox());
    document.getElementById("msg").textContent = friendMsg;
    pollFriend();
  }

  render();
  Promise.all(rooms.map(function (r) { return loadBrief(r.id); })).then(function () {
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
