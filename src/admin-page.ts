// Nearune — HTML for the standalone admin app's room-list page. Lives here
// (not in page.ts) so both the main app and the separate admin-app service
// can import it without either pulling in the other's unrelated code.

export type AdminRoomSummary = {
  roomId: string;
  // Display name the first partner typed (shown as the room title), if any.
  roomName?: string;
  createdAt: string | null;
  people: { who?: string; name: string; confirmed: boolean; location?: string }[];
  // Device, app-or-web and language the room was created from (no IP kept).
  via?: string | null;
  lastActive: string | null;
  daysAnswered: number;
  // Number of days on which BOTH people answered (for the funnel).
  bothDays?: number;
  pushCount: number;
  // People whose email sign-up is unconfirmed AND whose email we still hold,
  // so a reminder can be sent. reminders = how many have gone out already.
  remindable?: { who: string; name: string; reminders: number; remindedAt: string | null }[];
  // "Make a friend" rooms (matched strangers): friend = made by the matcher,
  // reported = someone reported the other person, closed = the room has ended.
  friend?: boolean;
  // How many messages tripped the vulgar/NSFW screen.
  flagged?: number;
  // Path of the invite link for the administrator, when this friend room is waiting for admin to join.
  adminJoin?: string;
  reported?: boolean;
  closed?: boolean;
  // Feature use in this room (counts only, no content).
  features?: { voice: number; puzzlePhotos: number; puzzleSolved: number; nhieRounds: number; photos: number };
};

export function adminEsc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Simple secret-gated page listing every room's creation time and recent
// activity — no answer text or photos, just enough to tell whether a room
// was created and whether it's being used. `secret` is embedded into each
// row's delete form so the action stays gated the same way the page itself
// is, without a separate login step.
const NOTICES: Record<string, string> = {
  sent: "Reminder email sent.",
  closed: "Room closed. Both people will see that it has ended.",
  renamed: "Room updated.",
  location_set: "Location updated.",
  city_required: "That location needs to be a city (for example, Palo Alto, CA). Nothing was changed.",
  location_failed: "Could not update the location. Check the logs.",
  code_taken: "That room code is already in use. Nothing was changed.",
  bad_code: "Room codes use only letters and numbers (4 to 40 characters). Nothing was changed.",
  rename_failed: "Could not rename that room. Check the logs.",
  too_soon: "A reminder went out in the last 20 hours; try again later.",
  max_reminders: "3 reminders already sent to this person.",
  nothing_pending: "Nothing pending for that person (they may have just confirmed).",
  no_email_kept: "No email on file (older than 7 days or registered before reminders existed).",
  send_failed: "The email provider refused the send. Check the logs.",
  not_configured: "Reminders aren't set up on this service yet (CRON_SECRET / APP_URL).",
  error: "Something went wrong sending the reminder.",
};

// Sign-up funnel over normal (invite) rooms: not the original room, not Make a
// friend matches. "Last 7 days" counts rooms created in the past week.
export function funnelHtml(rooms: AdminRoomSummary[]): string {
  const base = rooms.filter((r) => r.roomId && !r.friend && !r.closed);
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const stages = (list: AdminRoomSummary[]) => {
    const registered = list.filter((r) => r.people.some((p) => p.confirmed));
    const joined = list.filter((r) => r.people.filter((p) => p.confirmed).length >= 2);
    const bothOnce = list.filter((r) => (r.bothDays || 0) >= 1);
    const back = list.filter((r) => (r.bothDays || 0) >= 2);
    return [list.length, registered.length, joined.length, bothOnce.length, back.length];
  };
  const all = stages(base);
  const wk = stages(base.filter((r) => r.createdAt && Date.parse(r.createdAt) >= weekAgo));
  const labels = ["Room created", "Signed up", "Partner joined", "Both answered a day", "Both answered 2+ days"];
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) + "%" : "\u2014");
  const rowsHtml = labels
    .map((l, i) => `<tr><td>${l}</td><td>${all[i]}</td><td>${i === 0 ? "" : pct(all[i], all[i - 1])}</td><td>${wk[i]}</td><td>${i === 0 ? "" : pct(wk[i], wk[i - 1])}</td></tr>`)
    .join("");
  // Who is stuck, and who can still be reached by a notification.
  const waiting = base.filter((r) => r.people.some((p) => p.confirmed) && r.people.filter((p) => p.confirmed).length < 2);
  const oldWaiting = waiting.filter((r) => r.createdAt && Date.parse(r.createdAt) < Date.now() - 24 * 3600 * 1000);
  const reachable = oldWaiting.filter((r) => r.pushCount > 0).length;
  return `<h2>Room funnel</h2>
  <div class="tblwrap"><table class="funnel">
    <thead><tr><th>Step</th><th>All time</th><th>of previous</th><th>Last 7 days</th><th>of previous</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table></div>
  <p class="sub" style="margin-top:10px">${waiting.length} room${waiting.length === 1 ? " is" : "s are"} waiting for a partner; ${oldWaiting.length} for over 24 hours, and ${reachable} of those can still get a notification. Excludes the original room and Make a friend matches.</p>`;
}

export function buildAdminPage(rooms: AdminRoomSummary[], secret: string, notice = ""): string {
  const noticeHtml = notice && NOTICES[notice] ? `<p class="notice">${adminEsc(NOTICES[notice])}</p>` : "";
  const secretQS = "secret=" + encodeURIComponent(secret);
  const rows = rooms
    .map((r) => {
      const label = r.roomId ? adminEsc(r.roomId) : "Original room";
      const created = r.createdAt ? "<span class=\"local-time\" data-ts=\"" + adminEsc(r.createdAt) + "\">" + adminEsc(new Date(r.createdAt).toLocaleString("en-US")) + " UTC</span>" : "<span class=\"muted\">unknown</span>";
      const people =
        r.people.length === 0
          ? "<span class=\"muted\">no one registered</span>"
          : r.people.map((p) => adminEsc(p.name) + (p.confirmed ? "" : " <span class=\"muted\">(pending)</span>") + ((r.remindable || []).some((x) => x.name === p.name) ? " <span class=\"muted\">(email unconfirmed)</span>" : "")).join(", ");
      // Where: each registered person's own location, plus how the room was
      // created (device and language) — the only origin hints that are kept.
      const locs = r.people.filter((p) => p.location).map((p) => adminEsc(p.name) + ": " + adminEsc(p.location || ""));
      const where =
        (locs.length ? locs.join("<br>") : "<span class=\"muted\">no location yet</span>") +
        (r.via ? "<br><span class=\"muted\">via " + adminEsc(r.via) + "</span>" : "");
      const active = r.lastActive ? adminEsc(r.lastActive) : "<span class=\"muted\">no answers yet</span>";
      const status = r.daysAnswered > 0 ? "active" : r.people.length > 0 ? "joined" : "empty";
      // The legacy "main room" (empty roomId) has no delete control here —
      // it's reachable only through the in-app "Delete my data" flow, so a
      // stray click on this page can't wipe the room actually in use.
      const remind = (r.remindable || [])
        .map((x) => `<form method="POST" action="/remind-room?${secretQS}" style="margin-bottom:6px">
            <input type="hidden" name="roomId" value="${adminEsc(r.roomId)}">
            <input type="hidden" name="who" value="${adminEsc(x.who)}">
            <button type="submit" class="remind-btn">Remind ${adminEsc(x.name)}</button>
            ${x.reminders ? `<span class="muted" style="font-size:0.72rem">sent ${x.reminders}\u00d7</span>` : ""}
          </form>`)
        .join("");
      const flags =
        (r.friend ? ` <span class="muted">friend match</span>` : "") +
        (r.reported ? ` <span class="flag">REPORTED</span>` : "") +
        (r.flagged ? ` <span class="flag">${r.flagged} FLAGGED MSG</span>` : "") +
        (r.adminJoin ? ` <a class="flag" href="https://nearune.ai${adminEsc(r.adminJoin)}" target="_blank">JOIN AS ADMIN</a>` : "") +
        (r.closed ? ` <span class="muted">closed</span>` : "");
      const closeBtn = r.roomId && !r.closed
        ? `<form method="POST" action="/close-room?${secretQS}" style="margin-bottom:6px" onsubmit="return confirm('Close room ${adminEsc(r.roomId)}? Both people will see that the room has ended.');">
            <input type="hidden" name="roomId" value="${adminEsc(r.roomId)}">
            <button type="submit" class="del-btn">Close</button>
          </form>`
        : "";
      const renameBtn = r.roomId && !r.closed
        ? `<form method="POST" action="/rename-room?${secretQS}" style="margin-bottom:6px" data-cur="${adminEsc(r.roomName || "")}" onsubmit="var n = prompt('New display name for this room (leave blank to remove the name):', this.dataset.cur); if (n === null) return false; this.elements.name.value = n; var c = prompt('New room code too? Letters and numbers only. The old code keeps working. Leave blank to keep the current code:', n.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16)); if (c === null) return false; this.elements.code.value = c; return true;">
            <input type="hidden" name="roomId" value="${adminEsc(r.roomId)}">
            <input type="hidden" name="name" value="">
            <input type="hidden" name="code" value="">
            <button type="submit" class="remind-btn">Rename</button>
          </form>`
        : "";
      const locBtns = r.roomId && !r.closed
        ? r.people.filter((p) => p.who).map((p) => `<form method="POST" action="/set-location?${secretQS}" style="margin-bottom:6px" data-cur="${adminEsc(p.location || "")}" data-nm="${adminEsc(p.name)}" onsubmit="var l = prompt('City for ' + this.dataset.nm + ' (for example Palo Alto, CA):', this.dataset.cur); if (l === null || !l.trim()) return false; this.elements.location.value = l.trim(); return true;">
            <input type="hidden" name="roomId" value="${adminEsc(r.roomId)}">
            <input type="hidden" name="who" value="${adminEsc(p.who || "")}">
            <input type="hidden" name="location" value="">
            <button type="submit" class="remind-btn">Set ${adminEsc(p.name)}\u2019s city</button>
          </form>`).join("")
        : "";
      const action = remind + renameBtn + locBtns + closeBtn + (r.roomId
        ? `<form method="POST" action="/delete-room?${secretQS}" onsubmit="return confirm('Delete room ${adminEsc(r.roomId)}? This permanently erases its answers, comments, and photos. This cannot be undone.');">
            <input type="hidden" name="roomId" value="${adminEsc(r.roomId)}">
            <button type="submit" class="del-btn">Delete</button>
          </form>`
        : `<span class="muted">—</span>`);
      return `<tr>
        <td>${label}${r.roomName ? `<br><span class="muted">\u201c${adminEsc(r.roomName)}\u201d</span>` : ""}</td>
        <td><span class="pill pill-${status}">${status}</span>${flags}</td>
        <td>${created}</td>
        <td>${people}</td>
        <td class="where">${where}</td>
        <td>${active}</td>
        <td>${r.daysAnswered}</td>
        <td>${r.pushCount}</td>
        <td>${action}</td>
      </tr>`;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nearune Admin</title>
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest?${secretQS}">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Nearune Admin">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="theme-color" content="#FBF3EC">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap">
<style>
  :root { color-scheme: light; --bg:#FBF3EC; --surface:#FFFFFF; --ink:#2B211B; --ink-soft:#8B7A6C; --line:#E8D9C8; --accent:#C1673B; }
  @media (prefers-color-scheme: dark) {
    :root { color-scheme: dark; --bg:#14171F; --surface:#1D2130; --ink:#F2EFE9; --ink-soft:#A9AAB8; --line:#2B3040; --accent:#E8B75A; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font-family:'Manrope',sans-serif; padding:32px 16px 80px; }
  .wrap { max-width:920px; margin:0 auto; }
  h1 { font-weight:800; font-size:1.4rem; margin:0 0 4px; }
  h2 { font-weight:800; font-size:1.05rem; margin:22px 0 10px; }
  table.funnel td:nth-child(n+2), table.funnel th:nth-child(n+2) { text-align:right; }
  .sub { color:var(--ink-soft); font-size:0.85rem; margin:0 0 24px; }
  table { width:100%; border-collapse:collapse; background:var(--surface); border:1px solid var(--line); border-radius:12px; overflow:hidden; font-size:0.85rem; }
  th, td { text-align:left; padding:10px 12px; border-bottom:1px solid var(--line); }
  th { color:var(--ink-soft); font-weight:600; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.02em; }
  tr:last-child td { border-bottom:none; }
  .muted { color:var(--ink-soft); }
  .pill { display:inline-block; padding:2px 8px; border-radius:999px; font-size:0.72rem; font-weight:600; }
  .pill-active { background:#DCEFD9; color:#2F6B2A; }
  .pill-joined { background:#F5E6C8; color:#8A6A1E; }
  .pill-empty { background:var(--line); color:var(--ink-soft); }
  @media (prefers-color-scheme: dark) {
    .pill-active { background:#1E3A1B; color:#8FD98A; }
    .pill-joined { background:#3A2E12; color:#E8B75A; }
  }
  .head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
  .refresh-btn { background:var(--surface); color:var(--accent); border:1px solid var(--line); border-radius:999px; padding:8px 16px; font-family:inherit; font-size:0.85rem; font-weight:700; cursor:pointer; white-space:nowrap; }
  .refresh-btn:active { opacity:0.6; }
  .updated { color:var(--ink-soft); font-size:0.75rem; margin:-16px 0 16px; }
  td.where { min-width:150px; }
  .tblwrap { overflow-x:auto; border-radius:12px; }
  .del-btn { background:none; border:1px solid var(--line); color:#B3442F; border-radius:8px; padding:4px 10px; font-size:0.78rem; font-family:inherit; font-weight:600; cursor:pointer; }
  .remind-btn { background:var(--accent); border:1px solid var(--accent); color:#fff; border-radius:8px; padding:4px 10px; font-size:0.78rem; font-family:inherit; font-weight:600; cursor:pointer; white-space:nowrap; }
  .notice { background:var(--surface); border:1px solid var(--line); border-radius:10px; padding:10px 14px; font-size:0.85rem; margin:0 0 16px; }
  .flag { color:#B3361F; font-weight:700; font-size:0.72rem; }
  .tabs { display:flex; gap:4px; background:var(--surface); border:1px solid var(--line); border-radius:999px; padding:3px; margin-left:auto; margin-right:10px; }
  .tabs a { padding:6px 14px; border-radius:999px; text-decoration:none; color:var(--ink-soft); font-weight:600; font-size:0.85rem; }
  .tabs a.on { background:var(--accent); color:#fff; }
  .nbar { background:var(--line); border-radius:6px; height:10px; overflow:hidden; }
  .nbar > div { background:var(--accent); height:100%; border-radius:6px; }
  table.nfun td:nth-child(4) { text-align:left; }
  tr.ngroup td { font-weight:700; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.04em; color:var(--ink-soft); padding-top:14px; text-align:left !important; }
  .del-btn:hover { background:#B3442F; color:#fff; border-color:#B3442F; }
</style>
</head>
<body>
<div class="wrap">
  <div class="head">
    <h1>Rooms</h1>
    <nav class="tabs"><a class="on" href="/?${secretQS}">Rooms</a><a href="/analytics?${secretQS}">Analytics</a></nav>
    <button type="button" class="refresh-btn" id="refresh-btn">&#8635; Refresh</button>
  </div>
  <p class="sub">${rooms.length} room${rooms.length === 1 ? "" : "s"} total. No answer content or photos shown here.</p>
  <p class="updated" id="updated"></p>
  ${noticeHtml}

  <h2>All rooms</h2>
  <div class="tblwrap"><table>
    <thead><tr><th>Room</th><th>Status</th><th>Created</th><th>People</th><th>Where</th><th>Last active</th><th>Days answered</th><th>Push subs</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
</div>
<script>
  (function () {
    document.getElementById("refresh-btn").addEventListener("click", function () {
      this.textContent = "Refreshing\u2026";
      location.reload();
    });
    var u = document.getElementById("updated");
    if (u) u.textContent = "Updated " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    // Show creation times in this device's own time zone.
    var els = document.querySelectorAll(".local-time");
    for (var i = 0; i < els.length; i++) {
      var d = new Date(els[i].getAttribute("data-ts"));
      if (!isNaN(d.getTime())) els[i].textContent = d.toLocaleString([], { month: "numeric", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
    }
  })();
</script>
</body>
</html>`;
}
