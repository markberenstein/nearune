// Nearune — HTML for the standalone admin app's room-list page. Lives here
// (not in page.ts) so both the main app and the separate admin-app service
// can import it without either pulling in the other's unrelated code.

export type AdminRoomSummary = {
  roomId: string;
  createdAt: string | null;
  people: { name: string; confirmed: boolean; location?: string }[];
  // Device, app-or-web and language the room was created from (no IP kept).
  via?: string | null;
  lastActive: string | null;
  daysAnswered: number;
  pushCount: number;
  // People whose email sign-up is unconfirmed AND whose email we still hold,
  // so a reminder can be sent. reminders = how many have gone out already.
  remindable?: { who: string; name: string; reminders: number; remindedAt: string | null }[];
};

function adminEsc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Simple secret-gated page listing every room's creation time and recent
// activity — no answer text or photos, just enough to tell whether a room
// was created and whether it's being used. `secret` is embedded into each
// row's delete form so the action stays gated the same way the page itself
// is, without a separate login step.
const NOTICES: Record<string, string> = {
  sent: "Reminder email sent.",
  too_soon: "A reminder went out in the last 20 hours; try again later.",
  max_reminders: "3 reminders already sent to this person.",
  nothing_pending: "Nothing pending for that person (they may have just confirmed).",
  no_email_kept: "No email on file (older than 7 days or registered before reminders existed).",
  send_failed: "The email provider refused the send. Check the logs.",
  not_configured: "Reminders aren't set up on this service yet (CRON_SECRET / APP_URL).",
  error: "Something went wrong sending the reminder.",
};

export function buildAdminPage(rooms: AdminRoomSummary[], secret: string, notice = ""): string {
  const noticeHtml = notice && NOTICES[notice] ? `<p class="notice">${adminEsc(NOTICES[notice])}</p>` : "";
  const secretQS = "secret=" + encodeURIComponent(secret);
  const rows = rooms
    .map((r) => {
      const label = r.roomId ? adminEsc(r.roomId) : "(main room)";
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
      const action = remind + (r.roomId
        ? `<form method="POST" action="/delete-room?${secretQS}" onsubmit="return confirm('Delete room ${adminEsc(r.roomId)}? This permanently erases its answers, comments, and photos. This cannot be undone.');">
            <input type="hidden" name="roomId" value="${adminEsc(r.roomId)}">
            <button type="submit" class="del-btn">Delete</button>
          </form>`
        : `<span class="muted">—</span>`);
      return `<tr>
        <td>${label}</td>
        <td><span class="pill pill-${status}">${status}</span></td>
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
  .del-btn:hover { background:#B3442F; color:#fff; border-color:#B3442F; }
</style>
</head>
<body>
<div class="wrap">
  <div class="head">
    <h1>Rooms</h1>
    <button type="button" class="refresh-btn" id="refresh-btn">&#8635; Refresh</button>
  </div>
  <p class="sub">${rooms.length} room${rooms.length === 1 ? "" : "s"} total. No answer content or photos shown here.</p>
  <p class="updated" id="updated"></p>
  ${noticeHtml}
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
