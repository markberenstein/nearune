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
<title>My rooms — Nearune</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap">
<style>
  :root { color-scheme: light; --bg:#FBF3EC; --surface:#FFFFFF; --ink:#2B211B; --ink-soft:#6F6054; --line:#E8D9C8; --accent:#A9532B; --on-accent:#FFF8F1; --friend:#F3E6F3; --danger:#B3361F; }
  @media (prefers-color-scheme: dark) {
    :root { color-scheme: dark; --bg:#14171F; --surface:#1D2130; --ink:#F2EFE9; --ink-soft:#A9AAB8; --line:#2B3040; --accent:#E8B75A; --on-accent:#1D2130; --friend:#2A2338; --danger:#FF8A75; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font-family:'Manrope',sans-serif; padding:calc(40px + env(safe-area-inset-top)) 16px 40px; display:flex; justify-content:center; }
  .wrap { max-width:460px; width:100%; }
  h1 { font-weight:800; font-size:1.7rem; margin:0 0 6px; text-align:center; }
  .sub { color:var(--ink-soft); font-size:0.92rem; line-height:1.5; text-align:center; margin:0 0 22px; }
  .slot { background:var(--surface); border:1px solid var(--line); border-radius:18px; padding:18px 18px; margin:0 0 12px; }
  .slot.friend { background:var(--friend); }
  .slot.empty { border-style:dashed; text-align:center; }
  .slot h2 { font-size:1.05rem; font-weight:800; margin:0 0 4px; word-break:break-word; }
  .slot p { color:var(--ink-soft); font-size:0.88rem; line-height:1.45; margin:0 0 12px; }
  .tag { display:inline-block; font-size:0.7rem; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:var(--ink-soft); margin:0 0 6px; }
  .btn { display:inline-block; background:var(--accent); color:var(--on-accent); border:none; border-radius:999px; padding:10px 22px; font:inherit; font-weight:700; font-size:0.92rem; cursor:pointer; text-decoration:none; }
  .btn:disabled { opacity:0.5; cursor:default; }
  .btn.ghost { background:transparent; color:var(--accent); border:1px solid var(--line); }
  .link { background:none; border:none; padding:6px 4px; font:inherit; font-size:0.82rem; color:var(--ink-soft); text-decoration:underline; cursor:pointer; }
  .row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  .check { display:flex; gap:10px; align-items:flex-start; font-size:0.88rem; line-height:1.4; margin:0 0 12px; color:var(--ink); }
  .check input { margin-top:3px; width:18px; height:18px; flex:none; }
  .msg { font-size:0.85rem; color:var(--danger); margin:8px 0 0; min-height:1em; }
  .foot { text-align:center; margin-top:22px; font-size:0.8rem; }
  .foot a { color:var(--ink-soft); margin:0 6px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Your Nearune rooms</h1>
  <p class="sub">Up to three rooms of your own, plus one spot to meet someone new.</p>
  <div id="slots"></div>
  <p class="foot"><a href="/new">Got an invite? Paste it</a> · <a href="/recover">Find your room</a></p>
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

  function roomCard(entry, isFriend) {
    var id = entry.id, b = briefs[id];
    var title = id === "" ? "Original room" : id, line = "Loading…", closed = false, gone = false;
    if (b && b.gone) { line = "This room is no longer available."; gone = true; }
    else if (b && b.s) {
      var s = b.s, me = viewerOf(id), other = me === "mark" ? "nikita" : "mark";
      if (s.roomName) title = s.roomName;
      if (s.closed) { closed = true; line = s.closedBy === "admin" ? "This room was closed by Nearune." : "This room has ended."; }
      else if (me && s.people && s.people[other]) line = "Nearune partner: " + s.people[other].name + (s.people[other].location ? " · " + s.people[other].location : "");
      else if (s.pendingInvite && s.pendingInvite[other]) line = "Waiting for your partner to join.";
      else line = "Ready for your partner. Open it to send an invite.";
    }
    var card = el("div", { class: "slot" + (isFriend ? " friend" : "") });
    if (isFriend) card.appendChild(el("div", { class: "tag", text: "Make a friend" }));
    card.appendChild(el("h2", { text: title }));
    if (title !== (id === "" ? "Original room" : id) && id) card.appendChild(el("p", { class: "code", text: "Room code: " + id }));
    card.appendChild(el("p", { text: line }));
    var row = el("div", { class: "row" });
    if (!closed && !gone) row.appendChild(el("a", { class: "btn", href: roomHref(id), text: "Open" }));
    var rm = el("button", { class: "link", type: "button", text: closed || gone ? "Remove" : "Remove from this device" });
    rm.addEventListener("click", function () {
      if (closed || gone || window.confirm("Remove this room from this device? The room itself isn't deleted, and you can come back with its link.")) removeRoom(id);
    });
    row.appendChild(rm);
    card.appendChild(row);
    return card;
  }

  function emptySlot() {
    var card = el("div", { class: "slot empty" });
    card.appendChild(el("h2", { text: "Open spot" }));
    card.appendChild(el("p", { text: "Start a room with someone you know." }));
    card.appendChild(el("a", { class: "btn", href: "/new", text: "Start a room" }));
    return card;
  }

  // ---- Make a friend ----
  var friendMsg = "";
  var pollTimer = null;
  function setFriend(v) { if (v) jset(LS_FRIEND, v); else jdel(LS_FRIEND); }

  function startFriend(btn, box) {
    btn.disabled = true; friendMsg = "";
    fetch("/api/friend/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ device: deviceId(), adult: true }) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (x) {
        if (!x.ok) {
          friendMsg = x.d && x.d.error === "rate_limited" ? "Too many tries. Please wait a bit and try again."
            : x.d && x.d.error === "registrations_paused" ? "Nearune is catching up on new rooms. Please check back tomorrow."
            : "Something went wrong. Please try again.";
          render(); return;
        }
        var d = x.d;
        if (d.status === "matched") setFriend({ status: "matched", roomId: d.roomId, token: d.token });
        else setFriend({ status: "waiting", ticket: d.ticket });
        render();
      })
      .catch(function () { friendMsg = "Couldn't reach Nearune. Check your connection and try again."; render(); });
  }

  function friendSlot() {
    var card = el("div", { class: "slot friend" });
    var friendRoom = null;
    rooms.forEach(function (r) { if (r.friend) friendRoom = r; });
    if (friendRoom) return roomCard(friendRoom, true);
    var f = jget(LS_FRIEND, null);
    card.appendChild(el("div", { class: "tag", text: "Make a friend" }));
    if (f && f.status === "matched") {
      card.appendChild(el("h2", { text: "You've got a match!" }));
      card.appendChild(el("p", { text: "Say hello to someone new. You each choose your own name, city and language, and share one question a day. Photo sharing is off in these rooms, and you can report or leave any time." }));
      card.appendChild(el("a", { class: "btn", href: "/j/" + f.roomId + "/" + f.token, text: "Meet your match" }));
      return card;
    }
    if (f && f.status === "waiting") {
      card.appendChild(el("h2", { text: "Looking for your friend…" }));
      card.appendChild(el("p", { text: "We'll pair you with the next person who taps Make a friend. Keep this page open, or come back later: we'll hold your spot for up to a day." }));
      var cancel = el("button", { class: "btn ghost", type: "button", text: "Cancel" });
      cancel.addEventListener("click", function () {
        fetch("/api/friend/cancel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticket: f.ticket }) }).catch(function () {});
        setFriend(null); render();
      });
      card.appendChild(cancel);
      return card;
    }
    card.appendChild(el("h2", { text: "Meet someone new" }));
    card.appendChild(el("p", { text: "We'll pair you with another Nearune user who also wants a new friend. You each pick your own name and city, and answer one question a day. Photo sharing is off in these rooms." }));
    var cb = el("input", { type: "checkbox", id: "adult" });
    var label = el("label", { class: "check" }, [cb, el("span", { text: "I'm 18 or older." })]);
    card.appendChild(label);
    var go = el("button", { class: "btn", type: "button", text: "Find me a friend" });
    go.disabled = true;
    cb.addEventListener("change", function () { go.disabled = !cb.checked; });
    go.addEventListener("click", function () { startFriend(go, card); });
    card.appendChild(go);
    card.appendChild(el("p", { class: "msg", text: friendMsg }));
    return card;
  }

  function pollFriend() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    var f = jget(LS_FRIEND, null);
    if (!f || f.status !== "waiting") return;
    function check() {
      fetch("/api/friend/status?ticket=" + encodeURIComponent(f.ticket)).then(function (r) { return r.json(); }).then(function (d) {
        if (d.status === "matched") { setFriend({ status: "matched", roomId: d.roomId, token: d.token }); render(); }
        else if (d.status === "none") { setFriend(null); friendMsg = "Your wait timed out. Tap Find me a friend to try again."; render(); }
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
    regular.forEach(function (r) { slots.appendChild(roomCard(r, false)); });
    for (var i = regular.length; i < MAX_ROOMS; i++) slots.appendChild(emptySlot());
    slots.appendChild(friendSlot());
    pollFriend();
  }

  render();
  Promise.all(rooms.map(function (r) { return loadBrief(r.id); })).then(function () {
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
