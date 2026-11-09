// Nearune admin — Analytics tab. Observability of new users and of everyone
// using the app: activity, time spent, the new-user journey, invites,
// notifications, feature use, traffic sources and the room funnel.
// Server-rendered; the only script is the chart tooltip and local-time fix.

import type { FunnelReport } from "./funnel";
import { adminEsc as esc, funnelHtml, type AdminRoomSummary } from "./admin-page";

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) + "%" : "—");

function tile(label: string, value: string, sub: string): string {
  return `<div class="tile"><div class="tl">${esc(label)}</div><div class="tv">${value}</div><div class="ts">${sub}</div></div>`;
}

// Stacked bars per day: returning (bottom) + new (top). 2px gaps, rounded
// data-ends, hover tooltip. Server-built SVG, no library.
function activityChart(rep: FunnelReport): string {
  const days = rep.daily;
  if (!days.length) return "";
  const W = 760, H = 220, padL = 34, padR = 8, padT = 10, padB = 26;
  const max = Math.max(1, ...days.map((d) => d.newUsers + d.returning));
  const nice = max <= 4 ? 4 : max <= 10 ? 10 : Math.ceil(max / 5) * 5;
  const iw = W - padL - padR, ih = H - padT - padB;
  const bw = iw / days.length;
  const barW = Math.max(3, Math.min(28, bw - 6));
  const y = (v: number) => padT + ih - (v / nice) * ih;
  const grid = [0, nice / 2, nice]
    .map((g) => `<line x1="${padL}" x2="${W - padR}" y1="${y(g)}" y2="${y(g)}" class="grid"/><text x="${padL - 6}" y="${y(g) + 4}" class="ax" text-anchor="end">${g}</text>`)
    .join("");
  const label = (iso: string) => { const d = new Date(iso + "T12:00:00Z"); return (d.getUTCMonth() + 1) + "/" + d.getUTCDate(); };
  const step = Math.ceil(days.length / 7);
  const bars = days
    .map((d, i) => {
      const x = padL + i * bw + (bw - barW) / 2;
      const r = 4;
      let out = "";
      const retTop = y(d.returning), base = y(0);
      if (d.returning > 0) {
        const h = Math.max(2, base - retTop - (d.newUsers > 0 ? 1 : 0));
        out += `<rect x="${x}" y="${base - h}" width="${barW}" height="${h}" rx="${d.newUsers > 0 ? 0 : Math.min(r, h / 2)}" class="b-ret"/>`;
      }
      if (d.newUsers > 0) {
        const top = y(d.newUsers + d.returning);
        const bottom = d.returning > 0 ? retTop - 1 : base;
        const h = Math.max(2, bottom - top);
        out += `<rect x="${x}" y="${bottom - h}" width="${barW}" height="${h}" rx="${Math.min(r, h / 2)}" class="b-new"/>`;
      }
      const tip = `${label(d.day)}: ${d.newUsers + d.returning} people (${d.newUsers} new, ${d.returning} returning) · ${d.app} app, ${d.web} web · ${d.minutes} min on screen`;
      out += `<rect x="${padL + i * bw}" y="${padT}" width="${bw}" height="${ih}" class="hit" data-tip="${esc(tip)}"/>`;
      if (i % step === 0 || i === days.length - 1) out += `<text x="${x + barW / 2}" y="${H - 8}" class="ax" text-anchor="middle">${label(d.day)}</text>`;
      return out;
    })
    .join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="People using Nearune each day">${grid}<line x1="${padL}" x2="${W - padR}" y1="${y(0)}" y2="${y(0)}" class="base"/>${bars}</svg>`;
}

function stepsTable(rep: FunnelReport): string {
  const base = rep.newUsers;
  let lastGroup = "";
  return rep.steps
    .map((st) => {
      const head = st.group !== lastGroup ? `<div class="sg">${esc(st.group)}</div>` : "";
      lastGroup = st.group;
      const w = base ? Math.max(st.count ? 2 : 0, Math.round((st.count / base) * 100)) : 0;
      return head + `<div class="srow"><span class="sl">${esc(st.label)}</span><span class="bar"><i style="width:${w}%"></i></span><span class="sn">${st.count}</span><span class="sp">${pct(st.count, base)}</span></div>`;
    })
    .join("");
}

function featuresHtml(rooms: AdminRoomSummary[]): string {
  const live = rooms.filter((r) => !r.closed && r.people.length > 0);
  const f = (r: AdminRoomSummary) => r.features || { voice: 0, puzzlePhotos: 0, puzzleSolved: 0, nhieRounds: 0, photos: 0 };
  const n = live.length;
  const voiceRooms = live.filter((r) => f(r).voice > 0).length;
  const puzzleRooms = live.filter((r) => f(r).puzzlePhotos > 0).length;
  const nhieRooms = live.filter((r) => f(r).nhieRounds > 0).length;
  const photoRooms = live.filter((r) => f(r).photos > 0).length;
  const tiles = [
    tile("Voice", `${voiceRooms}<small> of ${n}</small>`, `rooms where someone recorded their voice`),
    tile("Puzzle", `${puzzleRooms}<small> of ${n}</small>`, `rooms with a puzzle photo uploaded`),
    tile("Never Have I Ever", `${nhieRooms}<small> of ${n}</small>`, `rooms that played a round together`),
    tile("Photos", `${photoRooms}<small> of ${n}</small>`, `rooms where someone shared a photo`),
  ].join("");
  const rows = live
    .sort((a, b) => (b.daysAnswered || 0) - (a.daysAnswered || 0))
    .map((r) => {
      const x = f(r);
      const name = r.roomName ? esc(r.roomName) : r.roomId ? esc(r.roomId) : "(main room)";
      const dot = (v: number, txt: string) => (v > 0 ? `<span class="yes">${txt}</span>` : `<span class="no">—</span>`);
      return `<tr><td>${name}${r.friend ? ' <span class="muted">friend</span>' : ""}</td><td>${r.people.length}</td><td>${r.daysAnswered}</td>
        <td>${dot(x.voice, x.voice + " of " + r.people.length)}</td>
        <td>${dot(x.puzzlePhotos, x.puzzlePhotos + " photo" + (x.puzzlePhotos === 1 ? "" : "s") + (x.puzzleSolved ? ", " + x.puzzleSolved + " solved" : ""))}</td>
        <td>${dot(x.nhieRounds, x.nhieRounds + " round" + (x.nhieRounds === 1 ? "" : "s"))}</td>
        <td>${dot(x.photos, x.photos + " shared")}</td></tr>`;
    })
    .join("");
  return `<div class="tiles">${tiles}</div>
  <div class="tblwrap"><table><thead><tr><th>Room</th><th>People</th><th>Days answered</th><th>Voice recorded</th><th>Puzzle</th><th>Never Have I Ever</th><th>Photos</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="muted">No rooms yet.</td></tr>'}</tbody></table></div>`;
}

export function buildAnalyticsPage(rooms: AdminRoomSummary[], rep: FunnelReport | null, secret: string): string {
  const qs = "secret=" + encodeURIComponent(secret);
  const d = rep ? rep.days : 7;
  const toggle = [7, 30, 90]
    .map((n) => `<a class="${n === d ? "on" : ""}" href="/analytics?${qs}&fdays=${n}">${n}d</a>`)
    .join("");
  const c = (k: string) => (rep ? rep.steps.find((x) => x.key === k)?.count || 0 : 0);
  const startedCount = rep
    ? Math.max(c("room_created") + c("friend_matched"), c("signed_up"))
    : 0;

  const kpis = rep
    ? [
        tile("Active this week", String(rep.activeWeek), `${rep.activeToday} today &middot; ${pct(rep.activeWeekApp, rep.activeWeek)} iPhone app`),
        tile("New users", String(rep.newUsers), `${rep.appUsers} app &middot; ${rep.webUsers} web &middot; last ${d} days`),
        tile("Got started", pct(startedCount, rep.newUsers), `${startedCount} created a room or got matched`),
        tile("Partner joined", pct(c("partner_joined"), rep.newUsers), `${c("partner_joined")} of ${rep.newUsers} new users`),
        tile("Time per day", `${rep.avgMinutesPerDay}<small> min</small>`, `average per person per active day &middot; ${rep.totalMinutes} min total`),
        tile("Notifications on", pct(c("notif_allowed"), c("notif_asked")), `${c("notif_allowed")} of ${c("notif_asked")} asked`),
      ].join("")
    : "";

  const r = rep ? rep.retention : { nextDay: 0, nextDayOf: 0, week: 0, weekOf: 0 };
  // Steps side by side; each shows its % of the step named in `of` (default:
  // the one before it).
  const flow = (items: [string, number, number?][]) =>
    `<div class="flow" style="grid-template-columns:repeat(${items.length}, minmax(0, 1fr))">${items
      .map(([l, v, of], i) => {
        const base = typeof of === "number" ? items[of][1] : i ? items[i - 1][1] : null;
        const ofLabel = typeof of === "number" ? " of " + items[of][0] : "";
        return `<div class="fs"><b>${v}</b><span>${esc(l)}</span>${base !== null ? `<em>${pct(v, base)}${esc(ofLabel)}</em>` : ""}</div>`;
      })
      .join("")}</div>`;

  const landing = rep && rep.landing.length
    ? rep.landing.map((x) => `<tr><td>/${esc(x.page)}</td><td>${esc(x.source)}</td><td>${x.views}</td><td>${x.taps}</td><td>${pct(x.taps, x.views)}</td></tr>`).join("")
    : `<tr><td colspan="5" class="muted">No landing page visits yet in this period.</td></tr>`;

  const recent = rep && rep.recent.length
    ? rep.recent
        .map((u) => `<tr><td><span class="local-time" data-ts="${new Date(u.first).toISOString()}">${esc(new Date(u.first).toISOString().slice(0, 16).replace("T", " "))} UTC</span></td>
          <td>${u.plat === "app" ? "iPhone app" : "web"}</td><td>${esc(u.last)}</td><td>${u.daysOpen}</td><td>${u.minutes}</td>
          <td class="muted small">${esc(u.reached.join(" → "))}</td></tr>`)
        .join("")
    : `<tr><td colspan="6" class="muted">No new users yet in this period.</td></tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Nearune Analytics</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<style>
  :root { color-scheme: light; --bg:#FBF3EC; --surface:#FFFFFF; --ink:#2B211B; --ink-soft:#8B7A6C; --line:#E8D9C8; --accent:#C1673B; --c-ret:#C1673B; --c-new:#3E7CB1; --track:#F1E6DA; }
  @media (prefers-color-scheme: dark) {
    :root { color-scheme: dark; --bg:#14171F; --surface:#1D2130; --ink:#F2EFE9; --ink-soft:#A9AAB8; --line:#2B3040; --accent:#E8B75A; --c-ret:#C87534; --c-new:#4F8FD6; --track:#262B3A; }
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  .wrap { max-width:1120px; margin:0 auto; padding:24px 16px 60px; }
  .head { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:6px; }
  h1 { font-size:1.5rem; margin:0; }
  .tabs, .seg { display:flex; gap:4px; background:var(--surface); border:1px solid var(--line); border-radius:999px; padding:3px; }
  .tabs { margin-left:auto; }
  .tabs a, .seg a { padding:6px 14px; border-radius:999px; text-decoration:none; color:var(--ink-soft); font-weight:600; font-size:0.85rem; }
  .tabs a.on, .seg a.on { background:var(--accent); color:#fff; }
  .sub { color:var(--ink-soft); font-size:0.85rem; margin:4px 0 18px; }
  h2 { font-size:1.05rem; margin:0 0 12px; }
  .card { background:var(--surface); border:1px solid var(--line); border-radius:16px; padding:18px; margin-bottom:16px; }
  .card .hint { color:var(--ink-soft); font-size:0.8rem; margin:-6px 0 12px; }
  .tiles { display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:12px; margin-bottom:16px; }
  .tile { background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:14px 16px; }
  .tl { color:var(--ink-soft); font-size:0.75rem; font-weight:600; text-transform:uppercase; letter-spacing:0.03em; }
  .tv { font-size:1.9rem; font-weight:800; margin:4px 0 2px; font-variant-numeric:tabular-nums; }
  .tv small { font-size:0.9rem; font-weight:600; color:var(--ink-soft); }
  .ts { color:var(--ink-soft); font-size:0.78rem; line-height:1.35; }
  .grid2 { display:grid; grid-template-columns:1.25fr 1fr; gap:16px; }
  @media (max-width: 820px) { .grid2 { grid-template-columns:1fr; } }
  .chart { width:100%; height:auto; display:block; }
  .chart .grid { stroke:var(--line); stroke-width:1; }
  .chart .base { stroke:var(--ink-soft); stroke-width:1; opacity:0.5; }
  .chart .ax { fill:var(--ink-soft); font-size:11px; }
  .chart .b-ret { fill:var(--c-ret); }
  .chart .b-new { fill:var(--c-new); }
  .chart .hit { fill:transparent; cursor:default; }
  .chart .hit:hover { fill:var(--ink); opacity:0.05; }
  .legend { display:flex; gap:16px; font-size:0.8rem; color:var(--ink-soft); margin:2px 0 8px; }
  .legend i { display:inline-block; width:10px; height:10px; border-radius:3px; margin-right:6px; vertical-align:-1px; }
  #tip { position:fixed; pointer-events:none; background:var(--ink); color:var(--bg); font-size:0.78rem; padding:6px 9px; border-radius:8px; display:none; max-width:280px; z-index:5; }
  .sg { font-size:0.7rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--ink-soft); margin:14px 0 6px; }
  .sg:first-child { margin-top:0; }
  .srow { display:grid; grid-template-columns:minmax(150px, 1.4fr) 1fr 36px 44px; align-items:center; gap:10px; padding:5px 0; font-size:0.86rem; }
  .bar { background:var(--track); border-radius:6px; height:8px; overflow:hidden; }
  .bar i { display:block; height:100%; background:var(--c-ret); border-radius:6px; }
  .sn, .sp { text-align:right; font-variant-numeric:tabular-nums; }
  .sp { color:var(--ink-soft); font-size:0.78rem; }
  .flow { display:grid; gap:8px; margin-bottom:6px; }
  .fs { background:var(--bg); border-radius:12px; padding:10px 12px; display:flex; flex-direction:column; min-width:0; }
  .fs b { font-size:1.3rem; }
  .fs span { color:var(--ink-soft); font-size:0.75rem; }
  .fs em { font-style:normal; font-size:0.72rem; color:var(--accent); font-weight:700; margin-top:2px; }
  .arr { align-self:center; color:var(--ink-soft); }
  .mini { color:var(--ink-soft); font-size:0.8rem; margin:10px 0 0; }
  .tblwrap { overflow-x:auto; }
  table { width:100%; border-collapse:collapse; font-size:0.85rem; }
  th, td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { color:var(--ink-soft); font-weight:600; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.03em; }
  table.funnel td:nth-child(n+2), table.funnel th:nth-child(n+2) { text-align:right; }
  .muted { color:var(--ink-soft); }
  .small { font-size:0.75rem; }
  .yes { font-weight:600; }
  .no { color:var(--ink-soft); }
  .note { color:var(--ink-soft); font-size:0.78rem; margin-top:10px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="head">
    <h1>Analytics</h1>
    <nav class="seg">${toggle}</nav>
    <nav class="tabs"><a href="/?${qs}">Rooms</a><a class="on" href="/analytics?${qs}">Analytics</a></nav>
  </div>
  <p class="sub">New users and everyone using Nearune, last ${d} days. Anonymous: a random ID per phone or browser, no names or messages. Counting began Nov 8, 2026.</p>

  ${rep ? `<div class="tiles">${kpis}</div>` : `<div class="card muted">Analytics data isn't available yet.</div>`}

  ${rep ? `<div class="card">
    <h2>People using Nearune each day</h2>
    <div class="legend"><span><i style="background:var(--c-ret)"></i>Returning</span><span><i style="background:var(--c-new)"></i>New</span></div>
    ${activityChart(rep)}
    <p class="note">Hover a day for details, including minutes on screen. Shows up to the last 30 days.</p>
  </div>` : ""}

  ${rep ? `<div class="grid2">
    <div class="card">
      <h2>New user journey</h2>
      <p class="hint">Share of the ${rep.newUsers} new users who reached each step.</p>
      ${stepsTable(rep)}
    </div>
    <div>
      <div class="card">
        <h2>Invites</h2>
        ${flow([["shared", c("invite_sent")], ["opened", c("invite_opened")], ["to App Store", c("invite_to_store"), 1], ["joined", c("invite_joined"), 1]])}
      </div>
      <div class="card">
        <h2>Notifications</h2>
        ${flow([["asked", c("notif_asked")], ["turned on", c("notif_allowed")]])}
        <p class="mini">Not now: <b>${c("notif_declined")}</b> &middot; Blocked in settings: <b>${c("notif_blocked")}</b></p>
      </div>
      <div class="card">
        <h2>Came back</h2>
        <div class="flow" style="grid-template-columns:repeat(2, minmax(0, 1fr))">
          <div class="fs"><b>${pct(r.nextDay, r.nextDayOf)}</b><span>came back the next day</span><em>${r.nextDay} of ${r.nextDayOf} new users</em></div>
          <div class="fs"><b>${pct(r.week, r.weekOf)}</b><span>still opening after a week</span><em>${r.week} of ${r.weekOf} new users</em></div>
        </div>
      </div>
    </div>
  </div>` : ""}

  <div class="card">
    <h2>Features in use</h2>
    <p class="hint">From each room's data (all time): voice, puzzle, Never Have I Ever, photos.${rep ? ` New users in this period: ${c("voice_recorded")} recorded their voice, ${c("voice_played")} heard a voice answer, ${c("puzzle_uploaded")} uploaded a puzzle photo, ${c("nhie_played")} played Never Have I Ever.` : ""}</p>
    ${featuresHtml(rooms)}
  </div>

  <div class="card">
    <h2>Where new users come from</h2>
    <p class="hint">Landing page visits and App Store taps by source. Tag ad links like ?utm_campaign=military_test.</p>
    <div class="tblwrap"><table class="funnel"><thead><tr><th>Page</th><th>Source</th><th>Visits</th><th>App Store taps</th><th>Tap rate</th></tr></thead><tbody>${landing}</tbody></table></div>
  </div>

  <div class="card">
    ${funnelHtml(rooms).replace("<h2>Room funnel</h2>", "<h2>Room funnel (all rooms, all time)</h2>")}
  </div>

  <div class="card">
    <h2>Recent new users</h2>
    <div class="tblwrap"><table><thead><tr><th>First seen</th><th>Where</th><th>Got as far as</th><th>Days</th><th>Minutes</th><th>Path</th></tr></thead><tbody>${recent}</tbody></table></div>
  </div>
</div>
<div id="tip"></div>
<script>
  (function () {
    var tip = document.getElementById("tip");
    document.addEventListener("mousemove", function (e) {
      var t = e.target && e.target.getAttribute && e.target.getAttribute("data-tip");
      if (!t) { tip.style.display = "none"; return; }
      tip.textContent = t; tip.style.display = "block";
      tip.style.left = Math.min(e.clientX + 12, window.innerWidth - 290) + "px"; tip.style.top = (e.clientY + 14) + "px";
    });
    document.addEventListener("touchstart", function (e) {
      var t = e.target && e.target.getAttribute && e.target.getAttribute("data-tip");
      if (!t) { tip.style.display = "none"; return; }
      var p = e.touches[0]; tip.textContent = t; tip.style.display = "block";
      tip.style.left = Math.min(p.clientX + 8, window.innerWidth - 290) + "px"; tip.style.top = (p.clientY - 50) + "px";
    }, { passive: true });
    var els = document.querySelectorAll(".local-time");
    for (var i = 0; i < els.length; i++) {
      var dt = new Date(els[i].getAttribute("data-ts"));
      if (!isNaN(dt.getTime())) els[i].textContent = dt.toLocaleString([], { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
    }
  })();
</script>
</body>
</html>`;
}
