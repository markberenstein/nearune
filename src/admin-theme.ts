// Shared look for every admin page (Home, Rooms, Analytics): the night-sky
// palette, Bricolage Grotesque + IBM Plex Mono, light and dark.
export const ADMIN_HEAD = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap">
<meta name="theme-color" content="#EEF0F6" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0B0E24" media="(prefers-color-scheme: dark)">`;

export const ADMIN_THEME_CSS = `
  :root { color-scheme: light; --bg:#EEF0F6; --surface:#FFFFFF; --ink:#16193A; --ink-soft:#4F5578; --soft:#4F5578; --line:#D5D9E8; --accent:#3B3FB5; --dot:#C2410C; --land:#C9CFE4; --ok:#1F7A4D; --warn:#B45309; --bad:#B3261E; --track:#E3E6F1;
    --c-ret:#3B3FB5; --c-new:#C2410C; --display:"Bricolage Grotesque", system-ui, sans-serif; --mono:"IBM Plex Mono", ui-monospace, monospace; }
  @media (prefers-color-scheme: dark) {
    :root { color-scheme: dark; --bg:#0B0E24; --surface:#141836; --ink:#ECEEFA; --ink-soft:#A3A9CF; --soft:#A3A9CF; --line:#2A305C; --accent:#9AA0FF; --dot:#FFB454; --land:#2A305C; --ok:#5FD39A; --warn:#F2B25C; --bad:#FF8A80; --track:#1F2448;
      --c-ret:#7C84EE; --c-new:#D2752A; }
  }
  body { font-family:var(--display) !important; background:var(--bg) !important; color:var(--ink); }
  h1 { font-weight:700 !important; letter-spacing:-0.01em; }
  h2 { font-weight:700 !important; }
  th, .tl, .sg, .sub, .hint, .updated, .note, .mini, .ts, .sp, .legend, .asof { font-family:var(--mono); }
  th, .tl, .sg { letter-spacing:0.06em !important; }
  .tv, .sn, .fs b { font-variant-numeric:tabular-nums; }
  table, .card, .tile, .notice, section { border-radius:10px !important; }
  .card, .tile, table, section, .notice { border-color:var(--line) !important; }
  .fs em, .refresh-btn { color:var(--accent); }
  .remind-btn { background:var(--accent) !important; border-color:var(--accent) !important; color:var(--surface) !important; }
  .del-btn { color:var(--bad) !important; }
  .del-btn:hover { background:var(--bad) !important; color:var(--surface) !important; border-color:var(--bad) !important; }
  .flag { color:var(--bad) !important; }
  .pill-active { background:color-mix(in srgb, var(--ok) 16%, transparent) !important; color:var(--ok) !important; }
  .pill-joined { background:color-mix(in srgb, var(--warn) 16%, transparent) !important; color:var(--warn) !important; }
  .tabs, .seg { display:flex; gap:4px; background:var(--surface); border:1px solid var(--line); border-radius:999px; padding:3px; }
  .tabs a, .seg a { padding:6px 14px; border-radius:999px; text-decoration:none; color:var(--ink-soft); font-weight:600; font-size:0.85rem; font-family:var(--display); }
  .tabs a.on, .seg a.on { background:var(--accent); color:var(--surface); }
  .bar i, .nbar > div { background:var(--accent) !important; }
  .bar, .nbar { background:var(--track) !important; }
  .head { flex-wrap:wrap; row-gap:10px; }
  @media (max-width:600px) { .head .tabs { order:3; margin-left:0; } }
  #tip { background:var(--ink) !important; color:var(--bg) !important; font-family:var(--mono); }
`;

export function adminTabs(on: "home" | "rooms" | "analytics", qs: string): string {
  const a = (k: string, href: string, label: string) => `<a${k === on ? ' class="on"' : ""} href="${href}?${qs}">${label}</a>`;
  return `<nav class="tabs">${a("home", "/", "Home")}${a("rooms", "/rooms", "Rooms")}${a("analytics", "/analytics", "Analytics")}</nav>`;
}
