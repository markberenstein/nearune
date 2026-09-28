// Nearune — HTML for the standalone admin app's room-list page. Lives here
// (not in page.ts) so both the main app and the separate admin-app service
// can import it without either pulling in the other's unrelated code.

export type AdminRoomSummary = {
  roomId: string;
  createdAt: string | null;
  people: { name: string; confirmed: boolean }[];
  lastActive: string | null;
  daysAnswered: number;
  pushCount: number;
};

function adminEsc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Simple secret-gated page listing every room's creation time and recent
// activity — no answer text or photos, just enough to tell whether a room
// was created and whether it's being used. `secret` is embedded into each
// row's delete form so the action stays gated the same way the page itself
// is, without a separate login step.
export function buildAdminPage(rooms: AdminRoomSummary[], secret: string): string {
  const secretQS = "secret=" + encodeURIComponent(secret);
  const rows = rooms
    .map((r) => {
      const label = r.roomId ? adminEsc(r.roomId) : "(main room)";
      const created = r.createdAt ? adminEsc(new Date(r.createdAt).toLocaleString("en-US")) : "<span class=\"muted\">unknown</span>";
      const people =
        r.people.length === 0
          ? "<span class=\"muted\">no one registered</span>"
          : r.people.map((p) => adminEsc(p.name) + (p.confirmed ? "" : " <span class=\"muted\">(pending)</span>")).join(", ");
      const active = r.lastActive ? adminEsc(r.lastActive) : "<span class=\"muted\">no answers yet</span>";
      const status = r.daysAnswered > 0 ? "active" : r.people.length > 0 ? "joined" : "empty";
      // The legacy "main room" (empty roomId) has no delete control here —
      // it's reachable only through the in-app "Delete my data" flow, so a
      // stray click on this page can't wipe the room actually in use.
      const action = r.roomId
        ? `<form method="POST" action="/delete-room?${secretQS}" onsubmit="return confirm('Delete room ${adminEsc(r.roomId)}? This permanently erases its answers, comments, and photos. This cannot be undone.');">
            <input type="hidden" name="roomId" value="${adminEsc(r.roomId)}">
            <button type="submit" class="del-btn">Delete</button>
          </form>`
        : `<span class="muted">—</span>`;
      return `<tr>
        <td>${label}</td>
        <td><span class="pill pill-${status}">${status}</span></td>
        <td>${created}</td>
        <td>${people}</td>
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
<title>Admin — Nearune</title>
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
  .del-btn { background:none; border:1px solid var(--line); color:#B3442F; border-radius:8px; padding:4px 10px; font-size:0.78rem; font-family:inherit; font-weight:600; cursor:pointer; }
  .del-btn:hover { background:#B3442F; color:#fff; border-color:#B3442F; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Rooms</h1>
  <p class="sub">${rooms.length} room${rooms.length === 1 ? "" : "s"} total. No answer content or photos shown here.</p>
  <table>
    <thead><tr><th>Room</th><th>Status</th><th>Created</th><th>People</th><th>Last active</th><th>Days answered</th><th>Push subs</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>
</body>
</html>`;
}
