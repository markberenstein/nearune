// Nearune — client page template, parameterized per room.

const RAW = String.raw`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<!-- user-scalable is off on purpose: the puzzle photo (puzzleZoomableGrid
     below) implements its own pinch-to-zoom/pan in JS via touch-action:none
     on .puzzle-grid-wrap. Leaving the native page pinch-zoom enabled too
     made the two fight over the same two-finger gesture — on iOS/WebKit a
     pinch can zoom the whole page instead of (or along with) shrinking the
     photo, since WebKit's native pinch-zoom isn't fully suppressed by
     touch-action or preventDefault() alone. Disabling page-level zoom
     leaves the custom pinch handler as the only thing listening. -->
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>Nearune</title>
<meta name="description" content="A private daily-question ritual for two people who live apart — one shared question a day, and a photo puzzle that slowly reveals itself as you keep your streak going.">
<link rel="icon" type="image/png" href="/favicon.png?v=__ICON_V__">
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=__ICON_V__">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap">
<style>
  :root {
    color-scheme: light;
    --bg: #FBF3EC;
    --surface: #FFFFFF;
    --surface-2: #F3E4D6;
    --ink: #2B211B;
    --ink-soft: #8B7A6C;
    --line: #E8D9C8;
    --accent: #C1673B;
    --accent-ink: #8A4A2B;
    --accent-2: #B98A52;
    --good: #7C8F63;
    --shadow: rgba(43,33,25,.10);
    --radius: 18px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      color-scheme: dark;
      --bg: #14171F;
      --surface: #1D2130;
      --surface-2: #2B3040;
      --ink: #F2EFE9;
      --ink-soft: #A9AAB8;
      --line: #2B3040;
      --accent: #E8B75A;
      --accent-ink: #E8B75A;
      --accent-2: #9576BE;
      --good: #9FB77E;
      --shadow: rgba(0,0,0,.45);
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--ink);
    font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    padding: 28px 16px 48px;
    display: flex;
    justify-content: center;
  }
  #app { width: 100%; max-width: 560px; display: flex; flex-direction: column; gap: 20px; }

  .wordmark {
    display: flex; align-items: center; justify-content: center; gap: 10px;
    font-family: 'Manrope', sans-serif; font-weight: 800;
    font-size: 1.7rem; letter-spacing: 0.01em; color: var(--accent);
  }
  .wordmark svg { width: 42px; height: 42px; flex: none; }

  .clocks {
    display: flex; align-items: center; justify-content: center; gap: 14px;
    background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
    padding: 14px 18px; box-shadow: 0 1px 2px var(--shadow); flex-wrap: wrap;
  }
  .clock-block { text-align: center; min-width: 108px; }
  .clock-block.clock-me { border: 2px solid #8C6FA8; border-radius: 6px; padding: 6px 10px; }
  .clock-city { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-soft); }
  .clock-time { font-variant-numeric: tabular-nums; font-size: 1.15rem; font-weight: 700; }
  .clock-divider { flex: none; color: var(--accent); opacity: 0.7; }
  .clock-divider svg { width: 18px; height: 18px; display: block; transform: rotate(20deg); }
  /* SANDBOX EXPERIMENT: the weather badge — the partner's current weather
     as a colored tile (like a native Home Screen weather widget) rather
     than a plain pill button, sitting side by side with the
     why-is-the-background-doing-this blurb. Tap the tile to expand a
     detail card (full width, below the row) with the place name, full
     condition, and a last-6-hours trend. Sits inline in the main app flow
     (built in renderApp(), where the "next question" countdown used to
     be) rather than as a fixed overlay. */
  #weather-widget { display: flex; flex-direction: column; gap: 10px; }
  .weather-widget-row { display: flex; flex-direction: row; align-items: center; gap: 14px; }
  .weather-widget-tile {
    display: flex; flex-direction: column; align-items: flex-start; justify-content: space-between;
    flex: none; width: 92px; height: 104px; border-radius: 20px; padding: 10px 12px;
    border: none; cursor: pointer; box-shadow: 0 4px 14px var(--shadow);
    color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.35);
  }
  .weather-widget-open { box-shadow: 0 4px 14px var(--shadow), 0 0 0 2px var(--accent); }
  .weather-widget-tile-icon { line-height: 1; }
  .weather-widget-tile-icon svg { width: 22px; height: 22px; display: block; }
  .weather-widget-tile-temp-wrap { display: flex; flex-direction: column; gap: 1px; }
  /* Apple's own Weather app renders the current temp in an ultra-light
     weight, not bold — bold read as a generic weather-widget look rather
     than anything resembling the real app. */
  .weather-widget-tile-temp { font-size: 1.55rem; font-weight: 300; line-height: 1; letter-spacing: -0.01em; }
  .weather-widget-tile-temp-secondary { font-size: 0.72rem; font-weight: 500; line-height: 1; opacity: 0.85; }
  .weather-widget-tile-humidity { font-size: 0.7rem; font-weight: 500; line-height: 1; opacity: 0.9; margin-top: 2px; }
  .weather-widget-tile-label { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.9; }
  .weather-widget-detail {
    padding: 10px 14px; background: var(--surface); border: 1px solid var(--line);
    border-radius: 12px; font-size: 0.78rem; color: var(--ink-soft); box-shadow: 0 2px 8px var(--shadow);
    max-width: 320px;
  }
  .weather-widget-detail-place { font-weight: 700; color: var(--ink); font-size: 0.88rem; margin-bottom: 2px; }
  .weather-widget-detail-sub { margin-top: 4px; font-style: italic; }
  .weather-widget-trend-label { margin-top: 10px; font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-soft); }
  .trend-bars { display: flex; align-items: flex-end; gap: 5px; height: 76px; margin-top: 6px; }
  .trend-bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
  .trend-bar-temp { font-size: 0.62rem; font-weight: 700; color: var(--ink); margin-bottom: 2px; white-space: nowrap; }
  .trend-bar-fill { width: 100%; max-width: 14px; background: var(--accent); border-radius: 4px 4px 2px 2px; opacity: 0.75; }
  .trend-bar-hour { font-size: 0.6rem; color: var(--ink-soft); margin-top: 3px; }
  .trend-bar-hum { font-size: 0.58rem; color: var(--ink-soft); margin-top: 1px; white-space: nowrap; }
  /* Sits beside the weather tile, so left-aligned rather than the old
     full-width centered line under the clocks. */
  .sky-line {
    text-align: left; font-style: italic; color: var(--ink-soft);
    font-size: 0.74rem; line-height: 1.4; margin: 0; flex: 1 1 auto; min-width: 0; text-wrap: balance;
  }

  /* SANDBOX EXPERIMENT: a fixed sky wash behind the whole page, tinted by
     the other person's current weather. Sits behind #app (negative
     z-index) and fades in/out via its own transition. Runs the full page
     height (not just a fading sliver at top) so it reads clearly as "the
     sky changed" rather than a faint smudge — see applyWeatherSky(). */
  #weather-sky {
    position: fixed; inset: 0; z-index: -1; pointer-events: none;
    transition: background 1.4s ease;
  }
  /* When weather is showing, wash the same tint faintly into the card
     surfaces too so it isn't only visible in the page margins. */
  body.weather-active .card,
  body.weather-active .clocks,
  body.weather-active .status-chip,
  body.weather-active .streak-card,
  body.weather-active .top-action-row {
    background: color-mix(in srgb, var(--surface) 86%, var(--weather-tint, transparent) 14%);
    transition: background 1.4s ease;
  }
  /* Text that sits directly on the weather-sky gradient (not inside one of
     the surface cards above) stays readable against it: pinned to a solid
     ink color rather than var(--ink)/var(--ink-soft), which flip to a pale
     color in dark mode and nearly disappear against the bright sky wash.
     --weather-ink is set per-render by applyWeatherSky() to dark ink for a
     bright (daytime) sky gradient or pale ink for a near-black (nighttime)
     one — a single hardcoded dark color used to go nearly invisible against
     a night sky's near-black gradient. switch-row links inside
     .top-action-row are excluded — those sit on a card surface and already
     get good contrast from var(--ink). */
  body.weather-active .sky-line,
  body.weather-active .sky-line strong,
  body.weather-active .cdt,
  body.weather-active .news-line,
  body.weather-active .music-line,
  body.weather-active .movie-line,
  body.weather-active .chart-list .chart-rank,
  body.weather-active .chart-list .chart-title,
  body.weather-active .switch-row:not(.top-action-row) .switch-link {
    color: var(--weather-ink, #2B211B);
  }

  .status-row { display: flex; gap: 10px; flex-wrap: wrap; }
  .status-chip {
    flex: 1 1 220px; display: flex; align-items: center; gap: 8px;
    background: var(--surface); border: 1px solid var(--line); border-radius: 999px;
    padding: 8px 14px; font-size: 0.82rem;
  }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
  .status-travel-flag { font-size: 0.75rem; line-height: 1; flex: none; }
  .status-chip input { border: none; background: transparent; color: var(--ink); font: inherit; flex: 1; min-width: 0; outline: none; }
  .status-chip input::placeholder { color: var(--ink-soft); }
  /* SANDBOX EXPERIMENT: the partner's chip is tappable to preview their
     home screen's background — a subtle affordance, not a full button. */
  .status-chip-preview:hover { border-color: var(--accent); }
  .status-chip-active { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--surface)); }

  .card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 26px 24px; box-shadow: 0 2px 10px var(--shadow); }
  .eyebrow { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-soft); display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
  .question { font-family: 'Manrope', sans-serif; font-weight: 700; font-size: 1.5rem; line-height: 1.3; text-wrap: balance; margin: 0 0 22px; }

  .answer-form { display: flex; flex-direction: column; gap: 10px; }
  textarea {
    width: 100%; resize: vertical; min-height: 84px; background: var(--surface-2);
    border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; color: var(--ink);
    font: inherit; font-size: 0.95rem; line-height: 1.5;
  }
  textarea:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  .send-btn {
    align-self: flex-end; background: var(--accent); color: #FFF8F1; border: none;
    border-radius: 999px; padding: 10px 22px; font: inherit; font-weight: 700; font-size: 0.9rem; cursor: pointer;
  }
  .send-btn:hover { filter: brightness(1.05); }
  .send-btn:disabled { opacity: 0.55; cursor: default; }

  .waiting { display: flex; align-items: center; gap: 10px; color: var(--ink-soft); font-size: 0.9rem; padding: 6px 2px; }
  .waiting svg { width: 18px; height: 18px; flex: none; animation: drift 2.6s ease-in-out infinite; }
  @keyframes drift { 0%, 100% { transform: translateX(0) rotate(0deg); } 50% { transform: translateX(4px) rotate(6deg); } }
  @media (prefers-reduced-motion: reduce) { .waiting svg { animation: none; } }

  .answers-reveal { display: flex; flex-direction: column; gap: 14px; }
  .answer-bubble { border-radius: 14px; padding: 14px 16px; border: 1px solid var(--line); }
  .answer-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; }
  .answer-name { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; }
  .answer-text { font-size: 0.98rem; line-height: 1.5; white-space: pre-wrap; margin: 0; }
  .translate-inline { display: block; margin-top: 6px; font-size: 0.88rem; font-style: italic; color: var(--ink-soft); border-left: 2px solid var(--line); padding-left: 8px; }
  .translate-inline-row { display: flex; align-items: baseline; gap: 6px; }
  .speak-btn { background: none; border: none; color: inherit; opacity: 0.6; cursor: pointer; padding: 0; line-height: 1; font-size: 0.92rem; flex: none; }
  .speak-btn:hover { opacity: 1; }
  .speak-btn:disabled { opacity: 0.3; cursor: default; }

  .voice-card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px 18px; display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
  .voice-card-title { font-family: 'Manrope', sans-serif; font-weight: 700; font-size: 0.92rem; }
  .voice-card-desc { font-size: 0.82rem; color: var(--ink-soft); margin: 0; line-height: 1.4; }
  .voice-card-error { font-size: 0.8rem; color: var(--bad, #B3261E); margin: 0; }
  .voice-card-prompt { font-size: 0.82rem; font-style: italic; color: var(--ink-soft); margin: 2px 0 0; }
  .voice-card-status-text { font-size: 0.8rem; color: var(--ink-soft); margin: 0; }
  .voice-card-actions { display: flex; gap: 8px; }
  .voice-card-howto { margin: 2px 0 0; }
  .voice-card-howto summary {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    font-size: 0.82rem; font-weight: 600; color: var(--ink);
    cursor: pointer; list-style: none;
    background: var(--bg); border: 1px solid var(--line); border-radius: 10px;
    padding: 9px 12px;
  }
  .voice-card-howto summary::-webkit-details-marker { display: none; }
  .voice-card-howto summary::marker { content: ""; }
  /* A CSS-drawn chevron (two rotated borders) rather than a text glyph —
     a Unicode arrow character here previously got mangled into its escape
     name ("u25B8") somewhere in the Windows/git round trip, so this avoids
     non-ASCII source entirely and still reads as a standard expander bar. */
  .voice-card-howto-chevron {
    width: 7px; height: 7px; flex-shrink: 0;
    border-right: 2px solid var(--ink-soft); border-bottom: 2px solid var(--ink-soft);
    transform: rotate(-45deg);
    transition: transform 0.15s ease;
  }
  .voice-card-howto[open] summary .voice-card-howto-chevron { transform: rotate(45deg); margin-top: -3px; }
  .voice-card-howto .voice-card-prompt { margin: 8px 2px 0; }
  .voice-card-howto-app { display: flex; align-items: center; gap: 8px; margin: 8px 2px 0; font-size: 0.82rem; color: var(--ink-soft); }
  .voice-card-howto-icon { width: 30px; height: 30px; border-radius: 7px; flex-shrink: 0; }
  .voice-card-howto-steps { margin: 8px 0 0; padding-left: 20px; font-size: 0.82rem; color: var(--ink-soft); line-height: 1.5; }
  .voice-card-howto-steps li { margin: 0 0 6px; }
  .voice-card-howto-steps li:last-child { margin-bottom: 0; }

  .edit-btn { background: none; border: none; color: inherit; opacity: 0.65; cursor: pointer; font-size: 0.74rem; text-decoration: underline; padding: 0; font-family: inherit; }
  .edit-btn:hover { opacity: 1; }
  .edit-form { display: flex; flex-direction: column; gap: 8px; }
  .edit-form textarea { min-height: 64px; }
  .edit-actions { display: flex; gap: 8px; justify-content: flex-end; }
  .mini-btn { border: none; border-radius: 999px; padding: 6px 14px; font: inherit; font-size: 0.78rem; font-weight: 700; cursor: pointer; }
  .mini-btn.primary { background: var(--accent); color: #FFF8F1; }
  .mini-btn.ghost { background: var(--surface-2); color: var(--ink); }
  .own-answer-visible { display: flex; flex-direction: column; gap: 8px; padding: 4px 2px 2px; }

  .comments { margin-top: 16px; padding-top: 14px; border-top: 1px dashed var(--line); display: flex; flex-direction: column; gap: 10px; }
  .journal-entry .comments { margin-top: 10px; padding-top: 10px; }
  .comment { display: flex; gap: 6px; font-size: 0.85rem; line-height: 1.4; }
  .comment-name { font-weight: 700; flex: none; }
  .comment-form { display: flex; gap: 8px; }
  .comment-form input { flex: 1; min-width: 0; background: var(--surface-2); border: 1px solid var(--line); border-radius: 999px; padding: 8px 14px; color: var(--ink); font: inherit; font-size: 0.85rem; outline: none; }
  .comment-form input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  .comment-send { background: var(--accent-ink); color: #fff; border: none; border-radius: 999px; padding: 8px 16px; font: inherit; font-size: 0.8rem; font-weight: 700; cursor: pointer; flex: none; }
  .comment-send:disabled, .comment-form input:disabled { opacity: 0.55; }

  .streak-card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px 22px; display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
  .streak-text { font-size: 0.88rem; color: var(--ink-soft); }
  .streak-text strong { color: var(--ink); font-size: 1.05rem; }
  .streak-dots { display: flex; gap: 6px; }
  .streak-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--surface-2); border: 1px solid var(--line); }
  .streak-dot.filled { background: var(--good); border-color: var(--good); }

  .puzzle-card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 22px; display: flex; flex-direction: column; gap: 14px; }
  .puzzle-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .puzzle-title { font-family: 'Manrope', sans-serif; font-weight: 700; font-size: 1.1rem; margin: 0; }
  .puzzle-progress { font-size: 0.8rem; color: var(--ink-soft); }
  .puzzle-explain { font-size: 0.83rem; color: var(--ink-soft); margin: 2px 0 4px; line-height: 1.4; }
  .puzzle-grid-wrap { position: relative; border-radius: 14px; overflow: hidden; touch-action: none; }
  .puzzle-zoom-overlay { position: fixed; inset: 0; background: #14100C; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 0; box-sizing: border-box; }
  .puzzle-zoom-overlay .puzzle-grid-wrap { width: 100vw; height: 100vh; border-radius: 0; box-shadow: none; }
  .puzzle-zoom-overlay .puzzle-grid { width: 100vmax; height: 100vmax; }
  .puzzle-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 3px; aspect-ratio: 1; border-radius: 14px; overflow: hidden; background: var(--surface-2); will-change: transform; }
  .puzzle-cell { background-repeat: no-repeat; background-size: 500% 500%; }
  .puzzle-cell.locked { background-image: none !important; background: var(--surface-2); display: flex; align-items: center; justify-content: center; }
  .puzzle-cell.locked svg { width: 16px; height: 16px; opacity: 0.28; }
  .puzzle-empty { display: flex; flex-direction: column; gap: 10px; align-items: center; text-align: center; padding: 20px 10px; color: var(--ink-soft); font-size: 0.88rem; }
  .puzzle-upload-btn { background: var(--accent); color: #FFF8F1; border: none; border-radius: 999px; padding: 9px 20px; font: inherit; font-weight: 700; font-size: 0.85rem; cursor: pointer; }
  .puzzle-upload-btn:disabled { opacity: 0.6; cursor: default; }
  .puzzle-replace { text-align: center; }
  .puzzle-replace-btn { background: none; border: none; color: var(--ink-soft); font: inherit; font-size: 0.76rem; text-decoration: underline; cursor: pointer; padding: 4px; }
  .puzzle-done-note { text-align: center; font-size: 0.85rem; color: var(--good); font-weight: 700; margin: 0; }
  .puzzle-setup { display: flex; flex-direction: column; gap: 8px; width: 100%; }
  .puzzle-setup input[type="text"] { width: 100%; background: var(--surface-2); border: 1px solid var(--line); border-radius: 999px; padding: 9px 14px; color: var(--ink); font: inherit; font-size: 0.85rem; outline: none; box-sizing: border-box; }
  .puzzle-setup input[type="text"]:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  .puzzle-setup select.lang-select { width: 100%; background: var(--surface-2); border: 1px solid var(--line); border-radius: 999px; padding: 9px 14px; color: var(--ink); font: inherit; font-size: 0.85rem; outline: none; box-sizing: border-box; appearance: none; -webkit-appearance: none; padding-right: 38px; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5l5 5 5-5' fill='none' stroke='%238a7a6a' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 16px center; background-size: 12px 8px; }
  .puzzle-setup select.lang-select:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  .puzzle-setup input[type="date"] { background: var(--surface-2); border: 1px solid var(--line); border-radius: 999px; padding: 8px 14px; color: var(--ink); font: inherit; font-size: 0.85rem; outline: none; box-sizing: border-box; }
  .puzzle-setup input[type="date"]:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  .travel-until-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .travel-until-label { font-size: 0.78rem; color: var(--ink-soft); white-space: nowrap; }
  .puzzle-setup-row { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
  .puzzle-choose-btn { background: var(--surface-2); border: 1px solid var(--line); color: var(--ink); border-radius: 999px; padding: 9px 16px; font: inherit; font-size: 0.83rem; cursor: pointer; }
  .puzzle-guess { display: flex; flex-direction: column; gap: 8px; }
  .puzzle-guess-row { display: flex; gap: 8px; }
  .puzzle-guess-row input { flex: 1; min-width: 0; background: var(--surface-2); border: 1px solid var(--line); border-radius: 999px; padding: 9px 14px; color: var(--ink); font: inherit; font-size: 0.85rem; outline: none; }
  .puzzle-guess-row input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  .puzzle-guess-btn { background: var(--accent-ink); color: #fff; border: none; border-radius: 999px; padding: 9px 18px; font: inherit; font-weight: 700; font-size: 0.83rem; cursor: pointer; flex: none; }
  .puzzle-guess-btn:disabled { opacity: 0.55; }
  .puzzle-guess-note { font-size: 0.83rem; color: var(--ink-soft); margin: 0; text-align: center; }
  .puzzle-question { font-size: 0.955rem; font-weight: 700; color: var(--ink); margin: 0; text-align: center; }
  .puzzle-batch-list { display: flex; flex-direction: column; gap: 12px; }
  .puzzle-batch-row { display: flex; flex-direction: column; gap: 6px; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
  .puzzle-batch-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .puzzle-batch-name { font-size: 0.78rem; color: var(--ink-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .puzzle-batch-row input { width: 100%; box-sizing: border-box; background: var(--surface-2); border: 1px solid var(--line); border-radius: 999px; padding: 7px 12px; color: var(--ink); font: inherit; font-size: 0.82rem; outline: none; }
  .puzzle-batch-remove { background: none; border: none; color: var(--ink-soft); font-size: 0.9rem; cursor: pointer; padding: 2px 6px; flex: none; }
  .puzzle-locked { display: flex; flex-direction: column; align-items: center; gap: 8px; padding-top: 4px; border-top: 1px dashed var(--line); margin-top: 4px; }

  .tab-bar { display: flex; gap: 4px; background: var(--surface); border: 1px solid var(--line); border-radius: 999px; padding: 4px; }
  .tab-btn { flex: 1; border: none; background: none; color: var(--ink-soft); font: inherit; font-weight: 700; font-size: 0.85rem; padding: 9px 12px; border-radius: 999px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; }
  .tab-btn.active { background: var(--accent); color: #FFF8F1; }
  .tab-badge { background: var(--accent-2); color: #fff; font-size: 0.68rem; font-weight: 700; border-radius: 999px; padding: 1px 7px; }
  .tab-btn.active .tab-badge { background: #FFF8F1; color: var(--accent); }
  .puzzle-flash { background: color-mix(in srgb, var(--good) 20%, var(--surface)); border: 1px solid var(--good); border-radius: 12px; padding: 11px 14px; font-size: 0.88rem; font-weight: 700; color: var(--ink); text-align: center; margin: 0; }

  .journal-toggle { background: none; border: none; color: var(--accent-ink); font: inherit; font-weight: 700; font-size: 0.85rem; cursor: pointer; padding: 6px 2px; text-align: left; display: flex; align-items: center; gap: 6px; }
  .journal-toggle .chevron { transition: transform 0.15s ease; }
  .journal-toggle.open .chevron { transform: rotate(90deg); }
  .journal { display: flex; flex-direction: column; gap: 14px; padding-top: 4px; }
  .journal-entry { border-left: 2px solid var(--line); padding-left: 14px; }
  .journal-date { font-size: 0.72rem; color: var(--ink-soft); letter-spacing: 0.04em; margin-bottom: 4px; }
  .journal-q { font-family: 'Manrope', sans-serif; font-weight: 600; font-size: 0.95rem; margin: 0 0 8px; }
  .journal-a { font-size: 0.85rem; margin-bottom: 4px; }
  .journal-a b { font-weight: 700; }
  .journal-empty { color: var(--ink-soft); font-size: 0.88rem; }

  .picker-overlay { position: fixed; inset: 0; background: rgba(20,16,28,0.55); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 20; }
  .picker-card { background: var(--surface); border-radius: var(--radius); padding: 30px 26px; max-width: 360px; width: 100%; text-align: center; box-shadow: 0 8px 30px var(--shadow); }
  .picker-card h2 { font-family: 'Manrope', sans-serif; font-weight: 700; font-size: 1.3rem; margin: 0 0 6px; }
  .picker-card p { color: var(--ink-soft); font-size: 0.88rem; margin: 0 0 20px; }
  .picker-choices { display: flex; flex-direction: column; gap: 10px; }
  .picker-btn { border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); border-radius: 12px; padding: 12px 16px; font: inherit; font-weight: 700; font-size: 0.95rem; cursor: pointer; }
  .picker-btn:hover { border-color: var(--accent); }

  .switch-row { text-align: center; }
  .switch-link { background: none; border: none; color: var(--ink-soft); font: inherit; font-size: 0.78rem; text-decoration: underline; cursor: pointer; padding: 4px; }
  /* The traveling button and (under it) the notifications link now sit
     right at the top of the page, directly over the full-height weather
     sky wash — too low-contrast there as plain text, so they get the same
     solid pill surface as the clock/status cards instead. Text inside
     switches to the stronger --ink (not --ink-soft) for the same reason. */
  .top-action-row {
    background: var(--surface); border: 1px solid var(--line); border-radius: 999px;
    padding: 10px 16px; text-align: center; margin: 0 0 12px;
  }
  .top-action-row .switch-link { color: var(--ink); }
  .offline-note { text-align: center; font-size: 0.8rem; color: var(--ink-soft); padding: 4px 8px; }
  .cdt { text-align: center; font-size: 0.78rem; color: var(--ink-soft); padding: 2px 8px; }
  /* SANDBOX EXPERIMENT: the fun-local-news line — same muted, centered
     treatment as .cdt so it doesn't compete for attention, just the
     headline itself underlined as a link out to the source. */
  .news-line { text-align: center; font-size: 0.95rem; color: var(--ink-soft); padding: 2px 8px; margin: 0; text-wrap: balance; }
  .news-link { color: var(--accent); text-decoration: underline; }
  /* SANDBOX EXPERIMENT: the music/movies chart lines — same muted,
     centered treatment as .news-line, with a small inline play button for
     the #1 song/trailer preview clip and an "expand to top 5" toggle. */
  .music-line, .movie-line { text-align: center; font-size: 0.95rem; color: var(--ink-soft); padding: 2px 8px; margin: 0; text-wrap: balance; }
  .music-link, .movie-link { color: var(--accent); text-decoration: underline; }
  .chart-play-btn { background: none; border: none; color: inherit; opacity: 0.7; cursor: pointer; padding: 0 2px; line-height: 1; font-size: 0.92rem; vertical-align: middle; }
  .chart-play-btn:hover { opacity: 1; }
  .chart-play-btn:disabled { opacity: 0.3; cursor: default; }
  .chart-expand-btn { background: none; border: none; color: var(--accent); text-decoration: underline; cursor: pointer; padding: 0; font: inherit; font-size: 0.85rem; }
  .chart-list { max-width: 420px; margin: 4px auto 0; padding: 0; list-style: none; text-align: left; }
  .chart-list li { display: flex; align-items: center; gap: 8px; padding: 4px 8px; font-size: 0.88rem; color: var(--ink-soft); }
  .chart-list .chart-rank { font-weight: 700; color: var(--ink); width: 1.2em; flex: none; text-align: right; }
  .chart-list .chart-title { color: var(--ink); }
  /* SANDBOX EXPERIMENT: the expanded "share a recent photo" image — sits
     inline below the voice-card's collapsed line, same expand-in-place
     spot as the chart-list above, capped so a tall portrait photo never
     dominates the page. */
  .shared-photo { display: block; width: 100%; max-height: 60vh; object-fit: contain; border-radius: 10px; margin-top: 8px; background: var(--surface-2); }
  [hidden] { display: none !important; }
</style>
<link rel="manifest" id="manifestLink" href="/manifest.json">
<meta name="theme-color" content="#FAF6EE" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#161320" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Nearune">
</head>
<body>
<div id="weather-sky"></div>
<div id="app"></div>
<script>
(function () {
  "use strict";

  var ROOM = "__ROOM__";
  var RP = ROOM ? "/r/" + ROOM : "";
  try {
    var manifestLinkEl = document.getElementById("manifestLink");
    if (manifestLinkEl) manifestLinkEl.href = RP + "/manifest.json";
  } catch (e) {}

  // The original room keeps its real placeholder names (Mark & Nikita) for
  // backward compatibility. Every other room gets generic, un-presuming
  // placeholders — a new couple should never see someone else's name before
  // they've registered their own.
  var PEOPLE = ROOM ? {
    mark: { name: "Person A", tz: "UTC", city: "", color: "var(--accent-ink)" },
    nikita: { name: "Person B", tz: "UTC", city: "", color: "var(--accent-2)" }
  } : {
    mark: { name: "Mark", tz: "America/Los_Angeles", city: "San Mateo", color: "var(--accent-ink)" },
    nikita: { name: "Nikita", tz: "Asia/Kolkata", city: "Delhi", color: "var(--accent-2)" }
  };

  // Registration supplies the real name/location/language per person — these
  // wrap PEOPLE so every display spot reads the registered value once it
  // exists, falling back to the original placeholders before that.
  function personName(key) {
    var p = state.people && state.people[key];
    return (p && p.name) || PEOPLE[key].name;
  }
  // Friendlier than the raw "Person A"/"Person B" placeholder specifically
  // for inviting someone who hasn't registered yet — once they have a real
  // name on file, that's used instead.
  function inviteeLabel(key) {
    var p = state.people && state.people[key];
    return (p && p.name) || t("your Nearune partner");
  }
  function personLocation(key) {
    var p = state.people && state.people[key];
    return (p && p.location) || PEOPLE[key].city;
  }
  // Single source of truth for the language picker (registration/invite
  // forms use a dropdown built from this list, so it's impossible to type
  // an unrecognized language or a typo like "Australian" — see LANGUAGES
  // below and its use in selectField()).
  var LANGUAGES = [
    ["English", "en"], ["Hindi", "hi"], ["Spanish", "es"], ["French", "fr"], ["German", "de"],
    ["Portuguese", "pt"], ["Italian", "it"], ["Mandarin Chinese", "zh"], ["Japanese", "ja"],
    ["Korean", "ko"], ["Arabic", "ar"], ["Farsi (Persian)", "fa"], ["Russian", "ru"],
    ["Bengali", "bn"], ["Punjabi", "pa"], ["Gujarati", "gu"], ["Marathi", "mr"], ["Tamil", "ta"],
    ["Telugu", "te"], ["Urdu", "ur"], ["Dutch", "nl"], ["Polish", "pl"], ["Turkish", "tr"],
    ["Vietnamese", "vi"], ["Thai", "th"], ["Indonesian", "id"], ["Tagalog (Filipino)", "tl"],
    ["Greek", "el"], ["Hebrew", "he"], ["Swedish", "sv"], ["Norwegian", "no"],
    ["Ukrainian", "uk"], ["Romanian", "ro"], ["Czech", "cs"], ["Swahili", "sw"],
    ["Gibberish", "gib"], ["Klingon", "tlh"]
  ];
  // The relationship picker shown to whoever registers first (see
  // registrationFlow()) — value is what's sent as the relationship field
  // to /api/register and stored once on the room (see questionPoolFor()
  // below for how it picks the daily question pool).
  var RELATIONSHIPS = [
    ["significant_other", "Significant other / partner"],
    ["family", "Family"],
    ["friend", "Friend"],
    ["its_complicated", "It's complicated"]
  ];
  var LANG_NAME_TO_CODE = (function () {
    var m = {};
    LANGUAGES.forEach(function (pair) { m[pair[0].toLowerCase()] = pair[1]; });
    m.mandarin = "zh"; m.chinese = "zh"; m.persian = "fa"; m.farsi = "fa"; m.filipino = "tl"; m.tagalog = "tl";
    return m;
  })();
  function normalizeLangCode(raw) {
    var s = (raw || "").trim().toLowerCase();
    if (!s) return null;
    if (LANG_NAME_TO_CODE[s]) return LANG_NAME_TO_CODE[s];
    if (/^[a-z]{2}$/.test(s)) return s;
    var first = s.split(/[\s(,]/)[0];
    if (LANG_NAME_TO_CODE[first]) return LANG_NAME_TO_CODE[first];
    // Not a language we recognize (e.g. someone typed a country or a typo,
    // like "Australian") — guessing a 2-letter code from the first letters
    // (e.g. "au") produces an invalid target language for the translate
    // API, which then shows its raw error text as if it were a translation.
    // Safer to say "unknown" than to guess wrong.
    return null;
  }
  function langCodeFor(key) {
    var p = state.people && state.people[key];
    var code = p && normalizeLangCode(p.language);
    if (code) return code;
    // The legacy room defaults its unregistered Nikita slot to Hindi (always
    // has). Any other room has no idea what language its people speak until
    // they actually register one, so it stays English (no translation) until
    // then — a brand-new couple shouldn't see Hindi appear out of nowhere.
    if (!ROOM && key === "nikita") return "hi";
    return "en";
  }
  function otherKeyOf(key) { return key === "mark" ? "nikita" : "mark"; }
  function questionTargetLang() {
    var mLang = langCodeFor("mark"), nLang = langCodeFor("nikita");
    if (mLang !== "en") return mLang;
    if (nLang !== "en") return nLang;
    return null;
  }

  // Three separate question pools, one per relationship type (see
  // RELATIONSHIPS above and questionPoolFor() below). QUESTIONS_SIGNIFICANT_OTHER
  // is the original list, unchanged, so every room created before the
  // relationship picker existed (including the legacy main room) keeps
  // getting exactly the questions it always has.
  var QUESTIONS_SIGNIFICANT_OTHER = [
    "What made you smile today, even for a second?",
    "If you were here right now, what would we be doing?",
    "What's a small thing from today you wish I'd seen?",
    "What song has been stuck in your head this week?",
    "What's the best thing you ate today?",
    "If we could teleport for one hour tonight, where would we go?",
    "What's a memory of us that randomly popped into your head recently?",
    "What's something you're looking forward to this week?",
    "What did your morning look like today, minute by minute?",
    "What's a word in your language you wish existed in mine?",
    "What's the last thing that made you laugh out loud?",
    "If you could hand me one item from where you are right now, what would it be?",
    "What's a small comfort that got you through today?",
    "What's something you learned about yourself this year?",
    "What would our perfect lazy Sunday look like?",
    "What's a smell that instantly reminds you of home?",
    "What's a skill you'd want to learn together?",
    "What's the view from wherever you're sitting right now?",
    "What's a compliment you got recently that you're still thinking about?",
    "What's your comfort show or movie right now?",
    "If we adopted a pet tomorrow, what would we get and what would we name it?",
    "What's something ordinary about today that you're grateful for?",
    "What's a place you've never been but really want to see?",
    "What's your current favorite way to waste ten minutes?",
    "What's something you're proud of yourself for this week?",
    "What's a food you want to cook for me someday?",
    "What's the weather doing where you are, and how does it feel?",
    "What's a childhood memory that came to mind recently?",
    "What's something you noticed about people today that stuck with you?",
    "If you had a free afternoon right now, what would you do with it?",
    "What's a tiny habit you've picked up lately?",
    "What's something you wish more people understood about your job?",
    "What's a question you wish I'd ask you more often?",
    "What's your favorite sound in the world right now?",
    "What's something you're curious about that has nothing to do with either of us?",
    "What's a color that matches your mood today?",
    "What's one thing you'd want me to know about your day without you saying it?",
    "What's a tradition, yours or mine, you want us to keep?",
    "What's something small I do that you like more than I probably realize?",
    "What's a book, article, or video you've thought about since you saw it?",
    "What's your ideal way to spend a rainy day?",
    "What's a place near you that feels like yours?",
    "What's something you're better at than you were a year ago?",
    "What's a food from home you miss most when you're away?",
    "What made today different from yesterday?",
    "What's something you'd want to frame and hang on a wall?",
    "What's a joke or bit only the two of us would find funny?",
    "What's a version of the future you like imagining?",
    "What's something you overheard or saw today that stuck with you?",
    "What's your go-to order when you don't want to think about it?",
    "What's a way I could surprise you this week, realistically?",
    "What's something about your city that you'd want to show me first?",
    "What's a small win from today that nobody else noticed?",
    "What's something you're better at explaining in person than by text?",
    "What's a scent, taste, or sound that makes you think of me?",
    "What's a question you've never been asked that you wish someone would ask?",
    "What's something you do differently when I'm not around?",
    "What's a story from your day that needs more detail than a text can give?",
    "What's something you want to remember about this exact week?",
    "What's a plan, even a small one, that you're excited about?",
    "What's something you'd want us to do together the very first evening we're in the same place?"
  ];

  // Family-relationship pool — warm and curious like the above, but without
  // assuming a romantic pairing (no "us as a couple" framing), so it reads
  // naturally between a parent and adult child, siblings, cousins, etc.
  var QUESTIONS_FAMILY = [
    "What made you smile today, even for a second?",
    "What's a small thing from today you wish I'd seen?",
    "What's the best thing you ate today?",
    "What's a memory of us growing up that randomly popped into your head recently?",
    "What's something you're looking forward to this week?",
    "What did your morning look like today, minute by minute?",
    "What's the last thing that made you laugh out loud?",
    "What's a small comfort that got you through today?",
    "What's something you learned about yourself this year?",
    "What would a perfect lazy Sunday look like for you right now?",
    "What's a smell that instantly reminds you of home?",
    "What's a skill you'd want to learn, given the chance?",
    "What's the view from wherever you're sitting right now?",
    "What's a compliment you got recently that you're still thinking about?",
    "What's your comfort show or movie right now?",
    "What's something ordinary about today that you're grateful for?",
    "What's a place you've never been but really want to see?",
    "What's your current favorite way to waste ten minutes?",
    "What's something you're proud of yourself for this week?",
    "What's a family recipe or dish you want to make sure doesn't get lost?",
    "What's the weather doing where you are, and how does it feel?",
    "What's a childhood memory that came to mind recently?",
    "What's something you noticed about people today that stuck with you?",
    "If you had a free afternoon right now, what would you do with it?",
    "What's a tiny habit you've picked up lately?",
    "What's something you wish more people understood about your job?",
    "What's a question you wish I'd ask you more often?",
    "What's your favorite sound in the world right now?",
    "What's something you're curious about lately that has nothing to do with work?",
    "What's a color that matches your mood today?",
    "What's one thing you'd want me to know about your day without you saying it?",
    "What's a family tradition you want to make sure we keep?",
    "What's something small I do that you appreciate more than I probably realize?",
    "What's a book, article, or video you've thought about since you saw it?",
    "What's your ideal way to spend a rainy day?",
    "What's a place near you that feels like yours?",
    "What's something you're better at than you were a year ago?",
    "What's a food from home you miss most when you're away?",
    "What made today different from yesterday?",
    "What's something you'd want to frame and hang on a wall?",
    "What's a story from our family that you hope gets told for generations?",
    "What's a version of the future you like imagining?",
    "What's something you overheard or saw today that stuck with you?",
    "What's your go-to order when you don't want to think about it?",
    "What's something about your city or town you'd want to show me first?",
    "What's a small win from today that nobody else noticed?",
    "What's something you're better at explaining in person than by text?",
    "What's a scent, taste, or sound that reminds you of our family?",
    "What's a question you've never been asked that you wish someone would ask?",
    "What's something you do differently when you're on your own?",
    "What's a story from your day that needs more detail than a text can give?",
    "What's something you want to remember about this exact week?",
    "What's a plan, even a small one, that you're excited about?",
    "What's a piece of advice from an older relative that's stuck with you?",
    "What's something you hope the next generation of our family holds onto?",
    "What's a holiday or gathering memory you still think about?",
    "What's something you'd want us to do together the next time we're all in the same place?",
    "What's a strength you think runs in our family?",
    "What's something you're grateful I'm part of your life for?",
    "What's a question about our family history you've always wanted answered?"
  ];

  // Friend-relationship pool — casual and curious, catching-up energy
  // rather than the warmth-coded ones above; still daily-check-in shaped so
  // it fits the same card.
  var QUESTIONS_FRIEND = [
    "What made you laugh today, even for a second?",
    "What's a small thing from today you wish I'd seen?",
    "What's the best thing you ate today?",
    "What's a memory of us that randomly popped into your head recently?",
    "What's something you're looking forward to this week?",
    "What did your morning look like today, minute by minute?",
    "What's the last thing that made you laugh out loud?",
    "What's a small win that got you through today?",
    "What's something you learned about yourself this year?",
    "What would your perfect lazy Sunday look like right now?",
    "What's a smell that instantly reminds you of home?",
    "What's a skill you'd want to learn together if we lived closer?",
    "What's the view from wherever you're sitting right now?",
    "What's a compliment you got recently that you're still thinking about?",
    "What's your comfort show or movie right now?",
    "What's something ordinary about today that you're grateful for?",
    "What's a place you've never been but really want to see?",
    "What's your current favorite way to waste ten minutes?",
    "What's something you're proud of yourself for this week?",
    "What's a food you want to try cooking or eating together someday?",
    "What's the weather doing where you are, and how does it feel?",
    "What's a memory from when we first met that you still think about?",
    "What's something you noticed about people today that stuck with you?",
    "If you had a free afternoon right now, what would you do with it?",
    "What's a tiny habit you've picked up lately?",
    "What's something you wish more people understood about your job?",
    "What's a question you wish I'd ask you more often?",
    "What's your favorite sound in the world right now?",
    "What's something you're curious about that has nothing to do with either of us?",
    "What's a color that matches your mood today?",
    "What's one thing you'd want me to know about your day without you saying it?",
    "What's a running joke or bit between us you hope never dies?",
    "What's something small I do that you like more than I probably realize?",
    "What's a book, article, or video you've thought about since you saw it?",
    "What's your ideal way to spend a rainy day?",
    "What's a place near you that feels like yours?",
    "What's something you're better at than you were a year ago?",
    "What's a food from home you miss most when you're away?",
    "What made today different from yesterday?",
    "What's something you'd want to frame and hang on a wall?",
    "What's a joke or bit only the two of us would find funny?",
    "What's a version of the future you like imagining?",
    "What's something you overheard or saw today that stuck with you?",
    "What's your go-to order when you don't want to think about it?",
    "What's something about your city that you'd want to show me first?",
    "What's a small win from today that nobody else noticed?",
    "What's something you're better at explaining in person than by text?",
    "What's a scent, taste, or sound that makes you think of good times with me?",
    "What's a question you've never been asked that you wish someone would ask?",
    "What's something you do differently when I'm not around?",
    "What's a story from your day that needs more detail than a text can give?",
    "What's something you want to remember about this exact week?",
    "What's a plan, even a small one, that you're excited about?",
    "What's something about your city that you'd want to show me first thing if I visited?",
    "What's a trip or hangout we keep talking about but haven't actually planned?",
    "What's something you're better at than you give yourself credit for?",
    "What's a story about us you'd tell at a party?",
    "What's something you'd want us to do together the very first time we're in the same city again?",
    "What's a way I could surprise you this week, realistically?",
    "What's something you're grateful we became friends over?"
  ];

  // Picks the right pool for this room's relationship (see RelationshipType
  // in types.ts). Unset — every room created before this existed, plus the
  // legacy main room — defaults to significant_other so nothing already
  // running changes which questions it gets. its_complicated gets the same
  // pool as significant_other (falls through to the default below).
  function questionPoolFor() {
    var rel = state && state.relationship;
    if (rel === "family") return QUESTIONS_FAMILY;
    if (rel === "friend") return QUESTIONS_FRIEND;
    return QUESTIONS_SIGNIFICANT_OTHER;
  }

  var EPOCH_MS = Date.UTC(2026, 0, 1);
  var DAY_MS = 86400000;
  var POLL_MS = 6000;

  var PUZZLE_COLS = 5;
  var PUZZLE_ROWS = 5;
  var PUZZLE_TOTAL = PUZZLE_COLS * PUZZLE_ROWS;
  var PUZZLE_ORDER = [16, 12, 9, 19, 18, 6, 5, 10, 15, 21, 11, 17, 1, 14, 22, 13, 2, 23, 4, 24, 7, 8, 0, 3, 20];

  function dateKey(d) {
    // Mirrors the server: new day rolls over at 6:30am IST (always the
    // more-advanced of Mark's/Nikita's two zones).
    var parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
    var y, m, day, hh, mm;
    parts.forEach(function (p) {
      if (p.type === "year") y = +p.value;
      if (p.type === "month") m = +p.value;
      if (p.type === "day") day = +p.value;
      if (p.type === "hour") hh = +p.value;
      if (p.type === "minute") mm = +p.value;
    });
    var ms = Date.UTC(y, m - 1, day);
    if (hh < 6 || (hh === 6 && mm < 30)) ms -= DAY_MS;
    var dt = new Date(ms);
    return dt.getUTCFullYear() + "-" + String(dt.getUTCMonth() + 1).padStart(2, "0") + "-" + String(dt.getUTCDate()).padStart(2, "0");
  }
  function keyToUtcMs(key) { var bits = key.split("-").map(Number); return Date.UTC(bits[0], bits[1] - 1, bits[2]); }
  function keyOffsetDays(key, delta) {
    var d = new Date(keyToUtcMs(key) + delta * DAY_MS);
    return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
  }
  function questionForKey(key) {
    var pool = questionPoolFor();
    var days = Math.floor((keyToUtcMs(key) - EPOCH_MS) / DAY_MS);
    var idx = ((days % pool.length) + pool.length) % pool.length;
    return pool[idx];
  }
  function formatDateLabel(key) {
    var d = new Date(keyToUtcMs(key) + 12 * 3600000);
    return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(d);
  }
  function clockFor(tz) { return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date()); }
  // The registering browser's own IANA zone — captured automatically so the
  // other person's clock is correct without asking anyone to pick a
  // timezone by hand (free-text "location" alone can't reliably give us one).
  function browserTz() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { return ""; }
  }
  function personTz(key) {
    var p = state.people && state.people[key];
    return (p && p.tz) || PEOPLE[key].tz;
  }
  // Mirrors util.ts's TRAVEL_EARLY_DAYS/travelActive — see that file's
  // comments for what each field means. Kept in sync by hand since the
  // client has no way to import server code.
  var TRAVEL_EARLY_DAYS = 2;
  function travelActive(person, todayKey) {
    if (!person || !person.travelLocation) return false;
    if (person.travelUntil && person.travelUntil < todayKey) return false;
    if (person.travelFrom && person.travelFrom > todayKey) {
      var earliestShow = person.travelShowEarly ? keyOffsetDays(person.travelFrom, -TRAVEL_EARLY_DAYS) : person.travelFrom;
      if (todayKey < earliestShow) return false;
    }
    return true;
  }
  // Whether the given person key is (effectively) traveling right now —
  // drives the small plane marker shown wherever their clock/weather/lore
  // is displayed, so their partner knows what they're seeing is a travel
  // city, not home.
  function personIsTraveling(key) {
    var p = state.people && state.people[key];
    return travelActive(p, dateKey(new Date()));
  }
  // Travel-aware versions of personLocation/personTz, for the clock only —
  // everything else about that person (their status, answers, etc.) stays
  // tied to their real home location/tz.
  function effectiveClockLocation(key) {
    var p = state.people && state.people[key];
    if (travelActive(p, dateKey(new Date())) && p.travelLocation) return p.travelLocation;
    return personLocation(key);
  }
  function effectiveClockTz(key) {
    var p = state.people && state.people[key];
    if (travelActive(p, dateKey(new Date())) && p.travelTz) return p.travelTz;
    return personTz(key);
  }
  function nextRolloverMs() {
    var n = Date.now(), d = new Date(n);
    var c = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 1, 0, 0);
    return n >= c ? c + DAY_MS : c;
  }
  function countdownText() {
    var diff = nextRolloverMs() - Date.now();
    var hrs = Math.max(0, Math.floor(diff / 3600000));
    var mins = Math.max(0, Math.floor((diff % 3600000) / 60000));
    return tTemplate("Next question in {h} hours and {m} minutes", { h: hrs, m: mins });
  }

  // localStorage keys are scoped per room (ROOM is "" for the original
  // legacy room), so "who am I" in one couple's room never leaks into
  // another room created later in the same browser. The legacy room falls
  // back to the old unscoped key so existing sessions aren't disrupted.
  var VIEWER_LS_KEY = "sameSkyViewer:" + ROOM;
  var TAB_LS_KEY = "sameSkyTab:" + ROOM;
  // Unlike the keys above, this one is NOT room-scoped — it's how a device
  // remembers which single room it belongs to, so a fresh visit to "/" can
  // send a brand-new visitor straight into registering their own room
  // instead of landing them in the legacy room (see redirectToMyRoom()).
  var MY_ROOM_LS_KEY = "nearuneMyRoom";

  var state = { version: 1, answers: {}, status: {}, comments: {} };
  // SANDBOX EXPERIMENT: current weather at each person's location, as last
  // fetched from /api/weather — null entries until the first fetch
  // resolves. See currentSkyWeather() — it's always the OTHER person's
  // weather, from whichever of the two you're currently viewing as.
  var weatherByPerson = { mark: null, nikita: null };
  // SANDBOX EXPERIMENT: whether the weather widget's detail card is open —
  // tap the badge to toggle. Resets whenever who you're viewing as changes
  // so a stale detail card never lingers.
  var weatherExpanded = false;
  // SANDBOX EXPERIMENT: top local news story (biased toward fun/quirky) at
  // each person's location, as last fetched from /api/news — null entries
  // until the first fetch resolves, or if nothing came back for that
  // location. See currentPartnerNews() — always the OTHER person's story,
  // same "peek into their world" idea as the weather badge.
  var newsByPerson = { mark: null, nikita: null };
  // SANDBOX EXPERIMENT: top songs/movies chart (country-level — see
  // music.ts/movies.ts) near each person, as last fetched from
  // /api/music and /api/movies — same "peek into their world" idea as the
  // weather badge and news line, and same null-until-loaded shape. Each
  // fetch already returns the full top 5, so expanding the list is just a
  // UI toggle (musicExpanded/moviesExpanded below), no extra round trip.
  var musicByPerson = { mark: null, nikita: null };
  var moviesByPerson = { mark: null, nikita: null };
  var musicExpanded = false;
  var moviesExpanded = false;
  // SANDBOX EXPERIMENT: "share a recent photo" — person.photoAt (see
  // types.ts) says whether/when a photo is on file; photoExpanded is purely
  // local UI state, same inline-expand pattern as weatherExpanded/
  // musicExpanded/moviesExpanded above (tap to reveal the full photo below
  // the collapsed line, tap again to collapse — not a separate overlay).
  var photoExpanded = false;
  var photoUploadState = { uploading: false, error: "" };
  var viewerKey = null;
  var soloRegistration = false;
  try {
    viewerKey = localStorage.getItem(VIEWER_LS_KEY);
    if (viewerKey === null && !ROOM) viewerKey = localStorage.getItem("sameSkyViewer");
  } catch (e) {}
  if (viewerKey !== "mark" && viewerKey !== "nikita") viewerKey = null;

  // The confirm-email link comes back as "?viewer=mark" (or "nikita") so
  // whoever just confirmed lands straight on their next step, even if this
  // browser context (e.g. an email app's in-app browser) doesn't share
  // localStorage with wherever they originally registered — without this,
  // they'd hit the "who's here?" picker instead.
  try {
    var viewerParam = new URLSearchParams(location.search).get("viewer");
    if (viewerParam === "mark" || viewerParam === "nikita") {
      viewerKey = viewerParam;
      localStorage.setItem(VIEWER_LS_KEY, viewerParam);
      if (ROOM) localStorage.setItem(MY_ROOM_LS_KEY, ROOM);
      var cleanUrl = location.pathname;
      history.replaceState(null, "", cleanUrl);
    }
  } catch (e) {}

  var activeTab = "today";
  try {
    var storedTab = localStorage.getItem(TAB_LS_KEY);
    if (storedTab === null && !ROOM) storedTab = localStorage.getItem("sameSkyTab");
    if (storedTab === "puzzle" || storedTab === "today" || storedTab === "local") activeTab = storedTab;
  } catch (e) {}
  var puzzleFlashMsg = null;

  // Favicon (daily-rotating heart, sky-gradient background) is served
  // server-side as real PNGs via <link rel="icon">/<link rel="apple-touch-icon">
  // set in PAGE_HTML's <head> — no client-side favicon logic needed here.

  var online = true;
  // While a slow write is in flight (today, only the voice-sample clone —
  // it calls out to ElevenLabs and can take several seconds), the 6s poll()
  // below can land in between: it reads state from before the write, but
  // its response arrives after the write already updated "state" locally,
  // silently reverting it. Any poll that resolves before this timestamp is
  // ignored instead of applied, so our own fresher write always wins.
  var suppressPollUntil = 0;
  var journalOpen = false;
  var draftText = "";
  var editingEntry = null;
  var editDraftText = "";
  var commentDrafts = {};
  // Whoever's weather/news is being PREVIEWED right now (see statusRow's
  // chip tap and effectiveViewKey below) — separate from viewerKey, your
  // actual, device-pinned identity. Previewing your partner's screen never
  // changes viewerKey, so it can't make you answer, edit your status, or
  // do anything else as them — see effectiveViewKey's comment for why
  // that split exists. Not persisted: always starts back at null (your
  // own view) on reload.
  var previewKey = null;

  // Traveling: lets you temporarily tell your partner's weather/local-lore/
  // clock to treat you as being somewhere other than home — see
  // travelBlock(). travelFormOpen/travelDraft are this device's own
  // in-progress edit; the actual traveling state lives on your profile in
  // state.people (travelLocation/travelFrom/travelUntil/travelShowEarly),
  // same as everything else server-synced. The start date lets travel be
  // scheduled ahead of time instead of starting immediately; the early-show
  // option lets your partner see it a couple of days before that start
  // date instead of exactly on it.
  var travelFormOpen = false;
  var travelDraft = { location: "", from: "", until: "", showEarly: true };
  var travelBusy = false;
  var travelError = "";

  // Push notifications / app-icon badge. "unsupported" means this browser
  // can't do Web Push at all (e.g. Safari in a regular tab rather than an
  // installed home-screen app); "off"/"on"/"busy" track this device's own
  // subscription state, kept in localStorage so the button doesn't flicker
  // between checks.
  var PUSH_LS_KEY = ROOM ? "nearunePush_" + ROOM : "nearunePush";
  var pushState = "off"; // "unsupported" | "off" | "on" | "busy"
  var pushError = "";
  // Warmed eagerly on load (see warmPush() below) so tapping "Enable
  // reminders" can call pushManager.subscribe() with as little as possible
  // between the tap and the permission request — Safari on iOS only shows
  // the permission prompt when it's tightly tied to a real tap, and a
  // network round-trip (fetching the VAPID key, registering the service
  // worker) in between is enough to make it silently refuse with no prompt
  // and no visible error at all.
  var vapidKeyCache = null;
  var swRegistrationCache = null;
  try { if (localStorage.getItem(PUSH_LS_KEY) === "on") pushState = "on"; } catch (e) {}

  // Whether the one-time "want a daily reminder?" dialog (see
  // pushPromptDialog() below) has already been shown and answered on this
  // device, BY THIS PERSON — set the first time it's dismissed, either way
  // (enabled or "Not now"), so it never asks that person again. Keyed by
  // viewerKey as well as room (not just room): on a device only one of you
  // ever uses that's a distinction without a difference, but if the two of
  // you ever do share one device (testing, a shared family tablet), keying
  // by room alone would let whoever answers first silently suppress the
  // dialog for the other person too — computed fresh each call rather than
  // cached, since viewerKey can still be unset the first time renderApp()
  // runs and can change later (the "Not {name}? Switch" link). The
  // persistent link under the traveling button (pushToggleRow) stays as the
  // ongoing way to turn reminders on later regardless.
  function pushPromptLsKey() {
    return (ROOM ? "nearunePushPrompted_" + ROOM : "nearunePushPrompted") + "_" + (viewerKey || "");
  }
  function isPushPromptDismissed() {
    try { return localStorage.getItem(pushPromptLsKey()) === "1"; } catch (e) { return false; }
  }
  function dismissPushPrompt() {
    try { localStorage.setItem(pushPromptLsKey(), "1"); } catch (e) {}
  }
  // A real modal (reuses the "Who's here?" picker's overlay/card styling)
  // offering to turn reminders on, rather than just the quiet link — shown
  // once, the first time this device reaches the main app after finishing
  // registration (see renderApp()'s call site for exactly when).
  // awaitingPartner: true when whoever's seeing this hasn't had their
  // partner join yet (they're about to land on, or are on, the "invite your
  // partner" screen right after this) — the message tells them push is also
  // how they'll hear the moment that happens, since nothing else will unless
  // they happen to have the app open.
  function pushPromptDialog(awaitingPartner) {
    var body = awaitingPartner
      ? t("Turn these on and we'll let you know the moment your partner accepts your invite — plus a daily nudge whenever today's question is ready.")
      : t("Nearune can let you know when today's question is ready, so neither of you misses a day.");
    var card = h("div", { class: "picker-card" }, [
      h("h2", { text: t("Want a daily reminder?") }),
      h("p", { text: body })
    ]);
    if (pushError) card.appendChild(h("p", { class: "puzzle-guess-note", text: pushError }));
    var choices = h("div", { class: "picker-choices" });
    var enableBtn = h("button", { class: "picker-btn", text: pushState === "busy" ? t("Working…") : t("Turn on notifications") });
    enableBtn.disabled = pushState === "busy";
    enableBtn.addEventListener("click", function () { dismissPushPrompt(); enablePush(); });
    var notNowBtn = h("button", { class: "picker-btn", text: t("Not now") });
    notNowBtn.addEventListener("click", function () { dismissPushPrompt(); renderApp(); });
    choices.appendChild(enableBtn);
    choices.appendChild(notNowBtn);
    card.appendChild(choices);
    return h("div", { class: "picker-overlay" }, [card]);
  }

  function isComplete(key) {
    var a = state.answers[key];
    return !!(a && a.mark && a.mark.text && a.nikita && a.nikita.text);
  }
  function totalCompleteDays() {
    return Object.keys(state.answers).filter(isComplete).length;
  }
  // How many consecutive days (ending on dateKeyVal, inclusive) you'd both
  // shown up as of that day — the same "streak" shown on the Today tab,
  // just evaluated as of a past date instead of today. 0 if that day wasn't
  // completed at all.
  function streakLengthAt(dateKeyVal) {
    if (!isComplete(dateKeyVal)) return 0;
    var count = 0;
    var cursor = dateKeyVal;
    while (isComplete(cursor)) { count++; cursor = keyOffsetDays(cursor, -1); }
    return count;
  }
  // Keeping the streak alive earns more pieces per day, not just one: 5
  // days running bumps it to 2 a day, 10 days running bumps it to 3.
  function piecesForStreakLength(streakLen) {
    if (streakLen >= 10) return 3;
    if (streakLen >= 5) return 2;
    return 1;
  }
  function streakInfo() {
    var today = dateKey(new Date());
    var count = 0;
    var cursor = isComplete(today) ? today : keyOffsetDays(today, -1);
    while (isComplete(cursor)) { count++; cursor = keyOffsetDays(cursor, -1); }
    var last7 = [];
    for (var i = 6; i >= 0; i--) { var k = keyOffsetDays(today, -i); last7.push({ key: k, done: isComplete(k) }); }
    return { count: count, last7: last7 };
  }
  function journalEntries() {
    return Object.keys(state.answers).filter(isComplete).sort().reverse().slice(0, 30);
  }

  async function api(path, body) {
    var res = await fetch(RP + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error("request failed");
    var next = await res.json();
    state = next;
    online = true;
    return next;
  }

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      if (k === "text") el.textContent = attrs[k];
      else if (k === "html") el.innerHTML = attrs[k];
      else if (k.indexOf("on") === 0 && typeof attrs[k] === "function") el.addEventListener(k.slice(2), attrs[k]);
      else el.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) el.appendChild(c); });
    return el;
  }

  // Apple's own Voice Memos app icon, inlined as a small data URI —
  // base64 (plain ASCII) rather than referencing it by name alone, since
  // the instructions below need people to recognize the icon on their
  // home screen, not just read its name.
  // A single short sentence (the original version of this script) gave
  // ElevenLabs too little pitch range and too few phonemes to work with —
  // a 60-75s version fixed that but read as a chore, so this lands in
  // between: ~30-35s read naturally, still mixing a statement, a question,
  // and a warmer aside for intonation range without feeling like an essay.
  var VOICE_SAMPLE_SCRIPT = "Hi, it's me. I hope this message finds you smiling today. I've been thinking about you all day — what are you up to right now? No matter how far apart we are, you're always on my mind, from the moment I wake up to the moment I fall asleep. I can't wait to see you again soon, sharing a meal instead of a screen. Until then, take care of yourself — my heart's right there with you.";
  var VOICE_MEMOS_ICON_DATA_URL ="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAASjElEQVR42tVaW49kV3X+1tr71Omq6p7uuXR7rp4LgwkawGPHhJCQmHCJlEgmUQjYRIYHvyJA+QVRkodciJQnXhEyD9ysCEshdpQgQMJRFMYXEmwHwoxxe2Z6ZnrGM119qcvZa3152OdUV8/NPTYvHLWme6pOndpr7bW+9a1vL/niF/8av8pXvKO7RWSbd/KOHps/wjv93PYMEAEgIJ3uRjbf90u/RERUah9xux6Jt7uJgIglM3oIoSzbU+WUqjg54bjmXlJESE7aTd5sa+TGHRAIqtFoOBiMqgoiQVW2rue6vZfrDGD9ZZL/dlAoTpqlsj21sGvP7OxsWZaqofaQaP3FzfOcoOrE02X8t0PrD235NeEygm4pjYbD4fra+utXr/Z6K0LEoI19EI5tYH5AAABG5qdsrp4kBJLMNIYD+w/Nz8+HGEGoKKB0t5TMUzKzlCwld3fCCZLunv91d3fLf5v7+CV3z/8DqSEURVGWZVm2ujMznZnp2dnZmR07du3etbq6ev78ufXVtSJGkBAQAq/3qnEZFYjNput49YCklMpu+9jRY53OtCcLDKPh8PzFi+fOnV9evrTaW+33+6OqspSSJXcnmw+TBJxGUjwkGcICaSQb83I2bUaaioQQptrtuV07jxw79s4TJ/YfPLBzbld3eubcubOXL1wMMYAUIUUIKoTwHN4OyN/9/V8hbxHpgEBSStMz08eOHw8hCoXmL7348qlTpxYXFzfW1819HIjaxMwNSa9UKiJg4oDUoZK3XgTkZhwRBJH3hcD0zOzJ++//3d/70MzcDvPq4vkLr507W4QgE5mgAKQOpDj2fb16S2Wnfez421VVJaxcW3n66ad//MIL1aiKMYYixm2AkAC0alT1Cp1ia0qQFDrO9fE6NgFHEGLMzx32N374ve+fOX3645/4+MG7D9+1d19yW1paKkLMEJHtBwVCUQkf/eiHmgyGkaJ6/PjxolUGCcvLl7/+ta+/+D8vxljEGFX1OpzaAjsTkOKepHPXnpOfriDVtV+oxjsBUxRFXLl29Wf/+9ODdx+e27W72+lubGxs9PsaNOdzNr3ejRyT2SZLae/efZ3OtBArV1e+9Y1vvnLmTLvdzp6rnQcSmv02sIqEuhAK+NiCymzvB/5834c/f/QP/1I6ey2l7RtAwOhFLHorK9/6+teWly/GIh44cDDGwunZgyRYVycoWbvV3drt9p4982ZG86ef+tczp8+UZWmWsol1ItJztsL8wW6nFK9gRJKJe8Sdo7WUMBpVnirH5lvbvIweQ1i+dOFf//k7Varanc7uXbtTMkrtR9a4J5pDgEBy27VrdwghhvjST15+4YXni6LIsDh5OUTcja6Wfn9HewYckoTTY2MhQwyL3//H1Vf+c/Hf/yGtLKrEOzXAwUQrYuunP3nxZy++VBRxbtdODdEmKiUm0dNB0TCzYxbAaDj60X/9aDQa3TTE1cWEwkD60AYwEXdNhYvXdcldNKThNb9yxtcXJbQ9x90dXXVcMFXp+VM/SlU11em0O11LToHXtEkA1br0OspyqixLFbm4dGFxcTGEcKP7SYJu4nA1CCQYksHF3WGkkO4Cd6iqhmixo2LKXOnv4BKvN1ODLr766vKlS62i6Ha7TpLCBs0cVAcJcfeyLEMICjl39tza+pqq3jw6wWBwMSVBFXowTZqQktEcUEdwOuFwpTnqonWnIQQn3UWx1lu9uHQhhDA1NZVrMilsqFKGZyFZli0A5lxeXk4pbe9r3FFsSDL3T+3cMy+eDE6p1BrY4lu/UkqXLl0E0Gq1VDWXfbKuBgpqfiHGQhBSspWVle0EKQmBiaUjIUwlP9T1NiR5Al28xjY2GEfyTdNsd19dXXX3EIKKNiAoGUmVyLYgxoKAmW1sbNxmx51g/eNkpFefXpjdpeiPDMmd7iAz2tU3cxKF38QFoL+xkVIKIWhoimkOJNZslICIBILJbDQaTX64rq7ZkQIlKE4qQReCEE+kCUNOEJIKA0XoaIx5E63WRHHmoL+RDNBQk4+GRhEyZqM1Z09VVaVqsvQCENbFL7cKIAgLTqfkQKTDJDkDSdMRvTAQ1Giomjr/Vpq10XDk5gKIKElCJP8jiJsBmg1IqarSTVBZAELIgERvm3Kkg4Z+ZxZBE4KMVSsgVWZJaISJ61vrQkm4e+5jpMmrcXuz2UNJkzG5EdkCnUIHHVTDny0szOpgSKoHOBqscbiqiyvdqof3zu5TSVbVANfkwE0LyxvnACnS9LGyBQ9IauNeFVFS8ndMhlDNbeowsENFCGBhQ3jdihqohIMuPqpSRd9XhJJmdMDhCta8NfcP4xVMRul1WTf57QRFtP4cwyQMAjWZY91HIreFWx4EQKjqIg6DD5lCNXj0roWZkEZMm7dRaH5Pp9WhjZIYfQxAAPr9/tra2uc+97nDhw/3+/1JkWYLWtxgVX5BpPaCQJoF1+7T67DdJ01vrgqpEjohdHF1yELL2yYVJLPTnAMjDD61sLAgNqKhoQ8iqKrqvvvum56enp+fb7fb7g5gY2OjqqptVOhNgJmQkMZImnOAuUcQiLjZZKRmwO86gyfL4QaHhSGTmzSdcN0Oi0uywQjMINs0XzIcDR977LEDBw70ej13H41Gg8Hg5MmTc3NzGbInt+ImhYcU1Qkca5YvE0mcVwqARroTBA108RjdHj64MEvZqIYkHBSYupoYHLkVdRghoJAC0/EuCj0vcWNjw8xExMwOHDhA8tFHHz18+PBwOFTVfr9fVdWNHfaYjajqmMCBNeJwggtN2NVQKfFA6jUZgNgno+DpT3ftmqENAZIGoA43J8VBz9IdnMjMlCDNbNfu3SGEDEEisr6+/tnPfvbYsWPXrl0zs36/3+v1HnnkkaNHj165ciWllNcwHA7z33mZOiFrcQzeYDZg3JOBgGXdBrm02vunypZ73+GOk9OxbW6OhkwgbwjHadVU9fy2iAwGgy984fMHDx4cDAbXdRckR6PR+973vpmZmXvvvXdmZubkyZPz8/N5Nw4ePNjtdlNKORQ16I1a4BhGN90vIu5uZkImWKD9yV0LHYFRQF91jkD1mg75mBE2taX+2UpCi6IFyKTgVTN+kX6//+ijjx47duzq1aurq6uf+cxn9u/f/8gjjxw6dOixxx67995719fXJUuAotgq/Y5dETN+Si5uoLs5GRz0MEL679V+n5ZTonRQ3LG5QgfFadjkt74JnQRp7q1WK/tlXMjMLLsphPDcc89dvny5KIoY46lTp3q93g9+8IOrV68+88wzi4uLRVHkqiqaEb7u7IS1uCAyFncJIYRibu5WCRQMjm8uLbXJSHHwdXGkAEpevgPOptK45zrHRqnKhTe2iieeeOLixQsxxjE6dzqdEEJKqSzLr3zlK5nxxxgff/zx2dnZ0WhUFMVTTz0VYyzL0r3Jga2itdxKXnc3dweh9ErEYmRi1FBJ66uvLBtdJNHhE1WmroLNJtSWkO5exPjd736XWqhIjp+iKJ5++umlpaWZmRlVVdVut/ulL31pMBjs2LEDQFmWADqdzmQxVlHZlLU5qXHH2mW1LA23LFxmMJUIVMA3Lry+5lUfKLUQ5NUDEDoc0qy4CSGvVZscS91udzDycmpKVVNKrVbrySefnJqaeumll15//fUQgoj0ej1VHVcDAGY2maqqNU2QzK4AkFmnjJOIKwIzN3eQrjXKJPGX1/qFqAbND1bCKc0+NJouQXopEUJjneHqcDNRffbUqWvXrmWhoNPpdLvdxx9/vAkSDyHcVqAQkfFxAa/TMGOjuOeoprsxy7dNWyiQVpCcyOok1ZEQKDCKZWmAdAeo/vzaxqozetYKLEtUrbL9+Fe/OhgM2u32OIlbrRau42W3amcIUZBKeK1LZ5AmBIgyTj4AAjMzs0b8ql92CABxCEnxSoonzl++liRSjU7CATFXhG9fuDTtgpCBM1VSf1/Goi9/+ctLS0tlWY5ZxjYMyOiTO4Gb9EVRIY0XKahT7brDofwWhSm3kZCfr6WukupsnpuE8BgVpiNCR6qlQWsFEARjjC+//HKMMca4nXVPMATWWi7zSmomkYEpTtKOzFXqA4vrjCVcWCn+6bUrl6ndogrJ3QWsex1CKEMQCMWTS8sXE49orI9iGtdNTU1dR5632ZKJigJed6cQUpujmphpHUHCRLhJ7HhDU+kA9P9GwwgNCE2UKVzEhZluk0o5PRg4BWLYVNH4VsSVEFsQ59iAmjdQhHF8Vud0EcnEq0H2G84SwVJqQTsLvQ5LMIM5tfEtWxoGWzXtt9LUC1AURdMPu9QqykQhEyDUkikzONRB3zD1Sb01n5Jg3OSimpJSaveMG6pMJbwRnXhLbewWh+fXvVWWpUhubOvQl+aoY3zMSksGYqosJ2njjZvOnD0CgA4xFP9xtbdu0MYq4Hop1Em5vcR3a4mazlYspqam8qrMTLYeOEfJeQimlIQsy1bQ8Aa4NkYmUkX+7fLlbnBKTALxABqhIKTeAQGvVxO2HTyS+Wyn0wVoluhUFdG8D5TcE2eMStXI3Hfs2NFud3LzcdM2b7KryP4to3oovnF28WIyRBgoLlu60tt0u7cQrsevm1m7094xuwNAGlXwGmk2zyuajJbhcJCq0ezc7J49u8zsVng3mZcJblBxa7meNYWHFs2a07JGi2ko6+0edcu36L5nz/zs7CzI0WBAuohoLgyNsFXz1cFgMBgMOu32O95xTxYO3kBbZ2Z8SgaDTeWzW0I9EAk32as3o2mJ6rHjx7rT01l1Vqk3IMfoZk+sqqmq1tfXzP3+X79/ZnbG7FY2iMMBB6oWg8ITAKohGZia8yobjSqmUTVwT7k+3OklIqmyPXvmf+3Eu0MIaTRcX1+tG39xChQikg+9m2Pnq1evDof9w0eOvP/9v3ljFztxsO7iMJHTlZkRkggYVLxO8dFosOedH1048QdHT37MteVmd5TB9fGRuwgeeOC9h+6+m/DVXm80GqoK4DLRGqg2WlEIYXV1dbXXo9vHHnro6NG7h8Nsw1ZBEy40Ei7xO4uvrSQPCnGLJmMtyMgD9z00d/A39t//cDFzl6Uh7mQT8tqqqnrniRO/8+CDRQxWpeXl5aY/lmZkgSIMH/7wB7N+LgKSg8Fgbm52Zmb6yJEjzz///MZGP8bWpP8EInBXFYrnESXCwkTVEUGqUlW1d8y99uN/ufzT7xUhbBFGtjEUVlXV2++55xMPf/Ku/ftV9eLFi1euXIkxAAxSm5BrWfjIRz6YSYNkIWQ4dPfp6emFhT3H33b85ZdfunqtV8Qodd5LzTAab7hCIVsFdEooestnLjz37SunnwmBolHeaFxt7Nesf73rXe/+5CcfPnzkCER7vZVXX301BFWBiqhI5qdjAx4c0yECqrq6uqqq7XZn4a6F97zn3tevXDl//nxWzlQVKipajzuJaP3V112IqhDGGFWDClRUJkT8GxHT3VNKIjI/P//ggx986I/+eN++/VDdWF8/c+bnpEdVqe3MHVhuMyl/+zd/MaagWQJwMCXbu3ff/v37ilhUlT377LM//OEzp0+fXl1dTck2fTYRNzcbDJPJEQ4RmThIaUaFREIIRVF0u935hfm3HX/biRPvOnT33aEoBNLr9V75xS/cqqBB6oeMt6uOh6gQr9sEqCjpAokxLC2d7/f7Bw7s73Tav/2B33rgvQ8sLS2dPXv2/Pml3kpvfWNjY319VFXuLqKqGoKq5F8aQlANIQRVCRpU864Fza27iKrGIrZaZTlVtqfanW5nbufOubm5TrcbQiA9WVq+tHxhaUmAGEKTsg2NE45jMk7Qa8ndlpCAFEWxsnJtfX119+49czt3ttvtQ4cOHT5yJANcsmTJzNybE2dumfuTcUzK1iG6iVQXaTYhs8N8ODQYDHq93uXlSxvr6zFGFQXZEIZ6dEomBvJi/azcswtdIJnZu7diSO4XLlxYXl7udDqdTqecardarRBCjEU9syOS+QhBqHIznbipIcsWeJ+o0HU1N7OUqsGgv7HR31hfHw6HQbUoCgCUMepnO7k5OZiVuXoASupTAgXqw1NVkkFVVUmsra31er1cs1VVJKjoOBLHCI2mD/ItStoErWhqBevxuUYudYdTVFS1VRRZKJkEKJmIono7xy1lrgA5yQT1hODmaBgJIIQwbtbcs5YuY+2FW1Y5OVUqm8rxRGZvHrjUYS2qKmGMSy5Sn0NKnrjEeOlSE2mOZ+Y0NLHV3LLZEcttRoInYmPryc/NB4snmqGJk9ubz8NuepmyZXz4hjFYQRwvewvk3XCz3HbC7zYD0bcyZntnxxNH8rf4mm2M4/H2w9z8ZYx/v/lpcsWv+PX/mxPc1hheMdUAAAAASUVORK5CYII=";
  var PLANE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l17-7-6 17-3-7-8-3z"/></svg>';

  var LOGO_MARK_SVG = '<svg viewBox="0 0 24 24"><defs><linearGradient id="wmSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#4FA8E0"/><stop offset="45%" stop-color="#8C6FA8"/><stop offset="100%" stop-color="#C6912E"/></linearGradient><clipPath id="wmHeartClip"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></clipPath></defs><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="url(#wmSky)"/><g clip-path="url(#wmHeartClip)"><circle cx="7" cy="6.4" r="0.34" fill="#FAF6EE" opacity="0.85"/><circle cx="9.4" cy="5.2" r="0.24" fill="#FAF6EE" opacity="0.7"/><circle cx="15.6" cy="5.8" r="0.3" fill="#FAF6EE" opacity="0.6"/><circle cx="5.2" cy="9.5" r="0.22" fill="#FAF6EE" opacity="0.55"/><circle cx="12.2" cy="4.6" r="0.2" fill="#FAF6EE" opacity="0.65"/><circle cx="18" cy="9.2" r="0.26" fill="#FAF6EE" opacity="0.5"/><circle cx="8.6" cy="12.4" r="0.18" fill="#FAF6EE" opacity="0.45"/><circle cx="16.4" cy="12.8" r="0.2" fill="#FAF6EE" opacity="0.4"/><circle cx="6.2" cy="4.2" r="0.16" fill="#FAF6EE" opacity="0.5"/><circle cx="13.8" cy="7.6" r="0.16" fill="#FAF6EE" opacity="0.4"/></g><path d="M4 16 Q 11 12.2 15.8 9.6" fill="none" stroke="#FAF6EE" stroke-width="0.4" stroke-dasharray="0.35 1.2" stroke-linecap="round" opacity="0.85"/><g transform="translate(11.2,7.3) rotate(12) scale(0.32)"><path d="M3 12l17-7-6 17-3-7-8-3z" fill="#FAF6EE"/></g></svg>';

  var translationCache = {}; // "src>tgt::text" -> translated string, or null on failure
  var translationPending = {};
  var translationAttempts = {};
  var TRANSLATE_MAX_ATTEMPTS = 3;

  function safeRerender() {
    var active = document.activeElement;
    var busy = active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT");
    if (!busy) renderApp();
  }

  function scheduleTranslate(text, target, alt) {
    if (!target) return;
    var key = target + "|" + (alt || "") + "::" + text;
    if (translationCache.hasOwnProperty(key) || translationPending[key]) return;
    translationPending[key] = true;
    fetch(RP + "/api/translate?target=" + encodeURIComponent(target) + (alt ? "&alt=" + encodeURIComponent(alt) : "") + "&text=" + encodeURIComponent(text))
      .then(function (res) {
        if (!res.ok) throw new Error("bad status");
        return res.json();
      })
      .then(function (data) {
        translationCache[key] = (data && data.translated) || null;
        delete translationPending[key];
        delete translationAttempts[key];
        safeRerender();
      })
      .catch(function () {
        delete translationPending[key];
        var attempts = (translationAttempts[key] || 0) + 1;
        translationAttempts[key] = attempts;
        if (attempts < TRANSLATE_MAX_ATTEMPTS) {
          setTimeout(function () { scheduleTranslate(text, target, alt); }, attempts * 1500);
        } else {
          translationCache[key] = null;
          safeRerender();
        }
      });
  }

  // Vocalizer — speaks text aloud via the browser's built-in text-to-speech
  // (no API key, no server round-trip: every modern mobile/desktop browser
  // ships voices for these languages). Mapped to full BCP-47 locale tags
  // (not just the bare 2-letter code) since that's what gets a browser to
  // actually pick a matching voice rather than silently falling back to a
  // default one. "Gibberish" and "Klingon" have no real-world voice behind
  // them (same reason they have no real translation API — see translate.ts)
  // so they're simply absent here, and canSpeak()/speakButton() skip
  // rendering a button for them rather than mis-speaking in English.
  var SPEECH_LANG_MAP = {
    en: "en-US", hi: "hi-IN", es: "es-ES", fr: "fr-FR", de: "de-DE", pt: "pt-PT",
    it: "it-IT", zh: "zh-CN", ja: "ja-JP", ko: "ko-KR", ar: "ar-SA", fa: "fa-IR",
    ru: "ru-RU", bn: "bn-IN", pa: "pa-IN", gu: "gu-IN", mr: "mr-IN", ta: "ta-IN",
    te: "te-IN", ur: "ur-PK", nl: "nl-NL", pl: "pl-PL", tr: "tr-TR", vi: "vi-VN",
    th: "th-TH", id: "id-ID", tl: "fil-PH", el: "el-GR", he: "he-IL", sv: "sv-SE",
    no: "nb-NO", uk: "uk-UA", ro: "ro-RO", cs: "cs-CZ", sw: "sw-KE",
  };
  function canSpeak(lang) {
    return !!lang && !!SPEECH_LANG_MAP[lang] && typeof window !== "undefined" && !!window.speechSynthesis;
  }
  // Only two people ever use this app, so their genders are fixed rather
  // than a profile field someone sets — used below to pick a sensibly
  // gendered browser voice for whichever of them hasn't recorded a cloned
  // sample yet, instead of whatever voice the device happens to default to
  // for a given language (which is often just "the first one in the list"
  // and can land on either gender regardless of who's speaking).
  var VOICE_GENDER = { mark: "male", nikita: "female" };
  // SpeechSynthesisVoice has no standard gender field, so this is a
  // name-based heuristic covering the common built-in voices on iOS/macOS
  // (where this app actually runs) plus the usual Chrome/Android/Windows
  // ones, in case it's ever opened there too.
  var FEMALE_VOICE_HINTS = ["female", "samantha", "victoria", "karen", "moira", "tessa", "veena", "fiona", "susan", "zira", "allison", "ava", "serena", "kate", "amelie", "anna", "lekha", "mariska", "monica", "paulina", "yuna", "mei-jia", "sin-ji", "ting-ting"];
  var MALE_VOICE_HINTS = ["male", "alex", "daniel", "fred", "albert", "arthur", "gordon", "lee", "tom", "aaron", "david", "oliver", "james", "thomas", "diego", "jorge", "luca", "rishi", "yannick", "xander"];
  // English has many regional accents, so SPEECH_LANG_MAP's flat "en" ->
  // "en-US" used to send everyone's English fallback voice out in a
  // generic American accent, even someone registered in Delhi or London —
  // and, for anyone whose own language ISN'T English (see otherUiLang),
  // made the "hear in original language" (English) and "hear in your
  // language" (their language) buttons sound like two unrelated people
  // instead of the same one. Each person's tz is captured automatically
  // at registration (see types.ts) from wherever they actually are, so it's
  // used here to pick an English accent that matches them, with no profile
  // field to set. This list only needs to cover tz prefixes for places an
  // English voice accent actually differs; anything unlisted (and anyone
  // with no tz yet) just gets the plain "en-US" default, same as before.
  var TZ_EN_LOCALE = [
    [/^Asia\/(Kolkata|Calcutta)$/, "en-IN"],
    [/^Asia\/(Karachi)$/, "en-IN"],
    [/^Asia\/(Dhaka)$/, "en-IN"],
    [/^Asia\/(Colombo)$/, "en-IN"],
    [/^Europe\/(London|Belfast)$/, "en-GB"],
    [/^Europe\/Dublin$/, "en-IE"],
    [/^Australia\//, "en-AU"],
    [/^Pacific\/Auckland$/, "en-NZ"],
    [/^Africa\/Johannesburg$/, "en-ZA"],
    [/^America\/Toronto$|^America\/Vancouver$|^America\/(Edmonton|Winnipeg|Halifax|St_Johns)$/, "en-CA"],
  ];
  function enLocaleFor(authorKey) {
    var tz = authorKey && state.people && state.people[authorKey] && state.people[authorKey].tz;
    if (!tz) return "en-US";
    for (var i = 0; i < TZ_EN_LOCALE.length; i++) {
      if (TZ_EN_LOCALE[i][0].test(tz)) return TZ_EN_LOCALE[i][1];
    }
    return "en-US";
  }
  var cachedVoices = null;
  function getVoicesSafe() {
    if (typeof window === "undefined" || !window.speechSynthesis) return [];
    var v = window.speechSynthesis.getVoices();
    if (v && v.length) cachedVoices = v;
    return cachedVoices || v || [];
  }
  // iOS (confirmed via live diagnostic logging) returns an EMPTY voice list
  // from the very first getVoices() call of a fresh session — the list
  // loads asynchronously and usually isn't ready yet by the time the page
  // has barely rendered. Without this, whichever line got spoken first
  // (typically today's question, the first thing on screen) found zero
  // voices, picked no voice at all, and fell back to the browser's bare
  // default — while everything spoken a few seconds later, once the list
  // had loaded, correctly got pinned to the person's proper voice. That's
  // exactly what made the question and a reply sound like two different
  // voices. Kicking off getVoices() here, as soon as this script runs
  // (well before anyone can tap a speak button), and catching the
  // voiceschanged event that fires once the real list is ready, gives the
  // list time to load before it's actually needed.
  if (typeof window !== "undefined" && window.speechSynthesis) {
    getVoicesSafe();
    try {
      window.speechSynthesis.addEventListener("voiceschanged", getVoicesSafe);
    } catch (e) {}
  }
  // Picks the best-matching installed voice for the given BCP-47 lang and
  // gender hint. Prefers an exact locale + gender match (e.g. a female
  // en-IN voice), then falls back in stages — same language family
  // ignoring region, then gender-only, then whatever's installed — down to
  // null (meaning: let the browser use its own default for that utterance,
  // same as before this existed).
  function pickVoiceFor(lang, gender) {
    var voices = getVoicesSafe();
    if (!voices.length) return null;
    var full = (lang || "").toLowerCase();
    var prefix = full.split("-")[0];
    var hints = gender === "female" ? FEMALE_VOICE_HINTS : gender === "male" ? MALE_VOICE_HINTS : null;
    function hinted(v) {
      if (!hints) return false;
      var n = v.name.toLowerCase();
      return hints.some(function (h) { return n.indexOf(h) !== -1; });
    }
    var exact = voices.filter(function (v) { return v.lang && v.lang.toLowerCase() === full; });
    var byPrefix = voices.filter(function (v) { return v.lang && v.lang.toLowerCase().indexOf(prefix) === 0; });
    var pools = [exact.filter(hinted), byPrefix.filter(hinted), exact, byPrefix, voices];
    for (var i = 0; i < pools.length; i++) if (pools[i].length) return pools[i][0];
    return null;
  }
  // A person's fallback voice is picked ONCE per person and reused for
  // every line attributed to them, in whichever language that particular
  // line happens to be in — not re-picked per call based on that line's
  // language. Most devices only have one voice MODEL per language, so
  // picking per-call (English voice for English lines, Hindi voice for
  // Hindi lines) meant the question and a reply from the same person could
  // come out of two audibly different synthetic voices even though both
  // were nominally "their" fallback. Pinning one voice (keyed to their own
  // registered language — e.g. a Hindi/Indian-accented voice for someone
  // whose language is Hindi) and reusing its voice+lang pair for
  // everything they "say" keeps it sounding like one consistent narrator
  // for that person, the same way their real cloned voice would once they
  // record a sample.
  var personVoiceCache = {};
  function personVoice(authorKey) {
    if (!authorKey) return null;
    if (personVoiceCache[authorKey]) return personVoiceCache[authorKey];
    var ownLang = langCodeFor(authorKey) || "en";
    var locale = ownLang === "en" ? enLocaleFor(authorKey) : (SPEECH_LANG_MAP[ownLang] || "en-US");
    var gender = VOICE_GENDER[authorKey];
    var voice = pickVoiceFor(locale, gender);
    // Only cache once a real voice list is available — getVoices() can come
    // back empty before the browser has loaded its voices, and caching a
    // null result then would pin "no voice" forever for this session.
    if (!voice) return null;
    var result = { voice: voice, locale: locale };
    personVoiceCache[authorKey] = result;
    return result;
  }
  function speak(text, lang, authorKey) {
    if (!canSpeak(lang) || !text) return;
    try {
      window.speechSynthesis.cancel(); // stop anything already playing first
      var u = new SpeechSynthesisUtterance(text);
      // Until someone records a voice sample, always use the device's own
      // default voice for the language. A hand-picked "gendered" voice from the
      // name heuristic above could land on iOS novelty voices (Fred, Albert)
      // that sound harsh, so personVoice() is intentionally not used here.
      u.lang = lang === "en" ? enLocaleFor(authorKey) : SPEECH_LANG_MAP[lang];
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }
  function personHasVoice(key) {
    var p = state.people && state.people[key];
    return !!(p && p.hasVoice);
  }
  // SANDBOX EXPERIMENT: plays a 30s song preview from the music chart (see
  // chartPlayButton below) — a single shared <audio> element so starting
  // one preview stops whichever one was already playing, the same
  // one-at-a-time rule as activeCloneAudio.
  //
  // activeChartUrl (not a button reference) is the source of truth for
  // which preview is playing. A background poll calls renderApp() every
  // few seconds (see POLL_MS) independent of anything the person does,
  // which rebuilds every button from scratch — an earlier version tracked
  // the *button element* that started playback, so the very next poll's
  // rebuild replaced it with a brand-new button that always started back
  // at "▶️", even while the audio was still genuinely playing underneath
  // (the audio itself is untouched by a rerender — only the stale button
  // reference was the problem). Deriving each button's icon from
  // activeChartUrl + activeChartAudio.paused instead means every rebuild
  // — poll-triggered or not — reconstructs the correct icon for whichever
  // preview (if any) is actually still playing.
  var activeChartAudio = null;
  var activeChartUrl = null;
  function stopChartAudio() {
    if (activeChartAudio) { try { activeChartAudio.pause(); } catch (e) {} }
  }
  function playChartPreview(url) {
    if (!url) return;
    stopChartAudio();
    var audio = new Audio(url);
    activeChartAudio = audio;
    activeChartUrl = url;
    function onStop() {
      // Guards against a stale event from an audio element that's already
      // been superseded by a newer tap (see stopChartAudio() above).
      if (activeChartAudio === audio) {
        activeChartAudio = null;
        activeChartUrl = null;
        renderApp();
      }
    }
    audio.addEventListener("ended", onStop);
    audio.addEventListener("pause", onStop);
    audio.addEventListener("error", onStop);
    audio.play().catch(onStop);
    renderApp(); // optimistic — flips this button to the stop icon right away, not on the next poll
  }
  // kind "video" (movie trailers) opens a plain YouTube-search link in a
  // new tab instead of playing anything inline — movies.ts's previewUrl
  // used to be Apple's own trailer stream, played in an in-app <video>, but
  // that stream can be region-gated behind an Apple ID/Apple Music
  // association and one person on this app hit real trouble with it (the
  // app itself crashed trying to play it). A plain link needs no account
  // and can't crash the app the way an in-app native video player can.
  // Song previews (kind "audio") stay inline, toggled by tapping the same
  // button again — those come from Deezer now (see music.ts), a plain mp3
  // with no such gating.
  function chartPlayButton(previewUrl, label, kind) {
    if (!previewUrl) return null;
    var btn = h("button", { class: "chart-play-btn", type: "button" });
    if (kind === "video") {
      btn.textContent = "▶️";
      btn.setAttribute("aria-label", label || "Watch trailer");
      btn.addEventListener("click", function () { window.open(previewUrl, "_blank", "noopener"); });
      return btn;
    }
    var isPlaying = activeChartUrl === previewUrl && activeChartAudio && !activeChartAudio.paused;
    btn.textContent = isPlaying ? "⏸️" : "▶️";
    btn.setAttribute("aria-label", isPlaying ? "Stop preview" : (label || "Play preview"));
    btn.addEventListener("click", function () {
      if (activeChartUrl === previewUrl && activeChartAudio && !activeChartAudio.paused) {
        activeChartAudio.pause();
        return;
      }
      playChartPreview(previewUrl);
    });
    return btn;
  }
  var activeCloneAudio = null;
  // Plays "text" in authorKey's own cloned voice when they've recorded one
  // (works for either the original text or its translation — ElevenLabs'
  // multilingual model can speak the cloned voice in any supported
  // language, so a translated line still comes out sounding like your
  // partner, not a generic voice). Falls back to the plain browser
  // text-to-speech above whenever there's no clone, or the clone call fails.
  // unlockedAudio: an <audio> element whose play() was called synchronously
  // inside a tap handler (see speakButton below), before the clone fetch
  // has even started. iOS WKWebView only allows audio playback that's a
  // direct consequence of a user gesture — the real clone audio can't be
  // ready yet (it's a ~1-2s round trip to synthesize), so by the time
  // fetch() resolves and we'd normally call .play(), iOS no longer
  // considers it gesture-initiated and silently rejects it, which used to
  // make every clone playback fall back to the generic browser voice. Reusing
  // this SAME element (set its .src and play() again once the blob is
  // ready) carries the original gesture's permission forward, so the
  // delayed playback still succeeds.
  function speakAs(text, lang, authorKey, unlockedAudio) {
    if (!text) return;
    if (authorKey && personHasVoice(authorKey)) {
      try { if (activeCloneAudio && activeCloneAudio !== unlockedAudio) activeCloneAudio.pause(); } catch (e) {}
      var audio = unlockedAudio || new Audio();
      activeCloneAudio = audio;
      fetch(RP + "/api/speak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ who: authorKey, text: text }),
      })
        .then(function (res) { if (!res.ok) throw new Error("tts_failed"); return res.blob(); })
        .then(function (blob) {
          var url = URL.createObjectURL(blob);
          // If a newer tap started a different clone playback while this
          // fetch was still in flight, activeCloneAudio has already moved
          // on to that other <audio> element — pausing it back when the
          // newer one started doesn't stop THIS callback from still firing
          // later and calling .play() on its own element regardless, which
          // is what produced two overlapping voice tracks on a quick
          // double-tap. Bail out here instead of playing a superseded request.
          if (audio !== activeCloneAudio) { URL.revokeObjectURL(url); return; }
          audio.addEventListener("ended", function () { URL.revokeObjectURL(url); });
          audio.src = url;
          audio.play().catch(function () { URL.revokeObjectURL(url); speak(text, lang, authorKey); });
        })
        .catch(function () { speak(text, lang, authorKey); });
      return;
    }
    speak(text, lang, authorKey);
  }
  function speakButton(text, lang, label, authorKey) {
    var hasClone = !!authorKey && personHasVoice(authorKey);
    if (!text || (!canSpeak(lang) && !hasClone)) return null;
    return h("button", {
      class: "speak-btn",
      type: "button",
      "aria-label": label,
      title: label,
      onclick: function (e) {
        e.preventDefault();
        e.stopPropagation();
        var unlockedAudio = null;
        if (hasClone) {
          // Fire a play() attempt synchronously, right in the tap handler,
          // on an element with no audio loaded yet — this is purely to
          // register the gesture with iOS; there's nothing to actually
          // hear yet, and the attempt is expected to do nothing or reject.
          unlockedAudio = new Audio();
          try {
            var p = unlockedAudio.play();
            if (p && p.catch) p.catch(function () {});
          } catch (err) {}
        }
        speakAs(text, lang, authorKey, unlockedAudio);
      },
    }, [document.createTextNode("🔊")]);
  }

  function translateBlock(text, target, alt, authorKey) {
    if (!text || !target || target === alt) return h("div", { class: "translate-inline", hidden: "true" });
    var key = target + "|" + (alt || "") + "::" + text;
    scheduleTranslate(text, target, alt);
    var val = translationCache[key];
    var wrap = h("div", { class: "translate-inline" });
    if (val === undefined) {
      wrap.appendChild(document.createTextNode("Translating…"));
    } else if (!val) {
      wrap.setAttribute("hidden", "true");
    } else {
      var row = h("div", { class: "translate-inline-row" });
      // Hear it spoken in the original writer's language first — the point
      // isn't just comprehension, it's actually hearing your partner's
      // language — then an optional button to hear the translation spoken
      // back in the reader's own language. Both go through authorKey's own
      // cloned voice when they have one recorded.
      var origBtn = speakButton(text, alt, t("Hear in original language"), authorKey);
      if (origBtn) row.appendChild(origBtn);
      row.appendChild(h("span", { text: val }));
      var ownBtn = speakButton(val, target, t("Hear in your language"), authorKey);
      if (ownBtn) row.appendChild(ownBtn);
      wrap.appendChild(row);
    }
    return wrap;
  }

  // UI-copy translation: every static label/button/note in the app is
  // authored in English. Rather than switching each screen to just one
  // language, both languages show together everywhere — the same
  // convention the app already uses for exchanged answers/comments — so
  // either person always sees the same page. t() is for inline copy
  // (buttons, short labels, composed messages): returns "English
  // (Translated)" once a translation comes back, or just the English
  // original while pending or if both people are English speakers.
  // uiTranslateBlock() is for paragraph-level copy (the daily question,
  // longer notes): returns a separate translated line, styled exactly like
  // the rest of the app's dual-language display.
  function otherUiLang() {
    // Only one extra language can show alongside English on a given device,
    // so when the two people picked two different non-English languages,
    // this device shows whichever one the CURRENT viewer actually reads —
    // not always mark's, which was the old (wrong) behavior: e.g. mark set
    // to Hindi and nikita set to Farsi used to show every device English +
    // Hindi, leaving nikita reading UI copy in a language she doesn't speak.
    if (viewerKey) {
      var mine = langCodeFor(viewerKey);
      if (mine !== "en") return mine;
    }
    var mLang = langCodeFor("mark"), nLang = langCodeFor("nikita");
    if (mLang !== "en") return mLang;
    if (nLang !== "en") return nLang;
    return null;
  }
  function t(text) {
    if (!text) return text;
    var lang = otherUiLang();
    if (!lang) return text;
    var key = lang + "|en::" + text;
    scheduleTranslate(text, lang, "en");
    var val = translationCache[key];
    return val ? text + " (" + val + ")" : text;
  }
  function uiTranslateBlock(text, authorKey) {
    return translateBlock(text, otherUiLang(), "en", authorKey);
  }
  function tTemplate(template, vars) {
    // Translation services translate the WORDS inside {name}-style tokens
    // too (e.g. "{total}" comes back as "{कुल}", since "total" itself gets
    // translated) — so the named token is swapped for a bare digit before
    // translating, which survives round-trip intact, and vars are
    // substituted back in afterward by that same index.
    var keys = Object.keys(vars || {});
    var indexed = template;
    keys.forEach(function (k, i) { indexed = indexed.split("{" + k + "}").join("{" + i + "}"); });
    var translated = t(indexed);
    keys.forEach(function (k, i) { translated = translated.split("{" + i + "}").join(String(vars[k])); });
    return translated;
  }

  var PUZZLE_LOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

  function puzzleUnlockedCount() {
    // The server computes this authoritatively (same streak-speed-up rules,
    // see util.ts puzzleUnlockedCount) so both devices always agree — this
    // local math only covers state the server hasn't returned yet.
    if (typeof state.puzzleUnlocked === "number") return state.puzzleUnlocked;
    if (state.puzzleSolved) return PUZZLE_TOTAL;
    if (!state.puzzleRoundStartDate) return 0;
    var start = state.puzzleRoundStartDate;
    var unlocked = 0;
    Object.keys(state.answers).forEach(function (k) {
      if (k >= start && isComplete(k)) unlocked += piecesForStreakLength(streakLengthAt(k));
    });
    unlocked += (state.puzzleBonusCredits || 0);
    return Math.min(Math.max(unlocked, 0), PUZZLE_TOTAL);
  }

  function readAndCompressImage(file, maxDim, quality, callback) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        var w = Math.max(1, Math.round(img.width * scale));
        var hgt = Math.max(1, Math.round(img.height * scale));
        var canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = hgt;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, hgt);
        callback(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Best-effort EXIF GPS read → reverse-geocoded place name (silently no-ops if absent).
  function exifString(view, offset, length) {
    var s = "";
    for (var i = 0; i < length; i++) s += String.fromCharCode(view.getUint8(offset + i));
    return s;
  }
  function readGPSFromJPEG(file, callback) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var view = new DataView(e.target.result);
        if (view.getUint16(0, false) !== 0xffd8) { callback(null); return; }
        var offset = 2;
        while (offset < view.byteLength - 1) {
          if (view.getUint8(offset) !== 0xff) break;
          var marker = view.getUint8(offset + 1);
          if (marker === 0xe1) {
            var exifOffset = offset + 4;
            if (exifString(view, exifOffset, 4) !== "Exif") { callback(null); return; }
            var tiffOffset = exifOffset + 6;
            var little = view.getUint16(tiffOffset, false) === 0x4949;
            var firstIFDOffset = view.getUint32(tiffOffset + 4, little);
            var ifd0 = tiffOffset + firstIFDOffset;
            var gpsIFDOffset = null;
            var numEntries = view.getUint16(ifd0, little);
            for (var i = 0; i < numEntries; i++) {
              var entryOffset = ifd0 + 2 + i * 12;
              if (view.getUint16(entryOffset, little) === 0x8825) {
                gpsIFDOffset = tiffOffset + view.getUint32(entryOffset + 8, little);
                break;
              }
            }
            if (!gpsIFDOffset) { callback(null); return; }
            var gps = {};
            var gpsEntries = view.getUint16(gpsIFDOffset, little);
            for (var j = 0; j < gpsEntries; j++) {
              var gOffset = gpsIFDOffset + 2 + j * 12;
              var gTag = view.getUint16(gOffset, little);
              if (gTag === 1) gps.latRef = String.fromCharCode(view.getUint8(gOffset + 8));
              else if (gTag === 3) gps.lonRef = String.fromCharCode(view.getUint8(gOffset + 8));
              else if (gTag === 2 || gTag === 4) {
                var dataOffset = tiffOffset + view.getUint32(gOffset + 8, little);
                var vals = [];
                for (var k = 0; k < 3; k++) {
                  var num = view.getUint32(dataOffset + k * 8, little);
                  var den = view.getUint32(dataOffset + k * 8 + 4, little);
                  vals.push(den ? num / den : 0);
                }
                var deg = vals[0] + vals[1] / 60 + vals[2] / 3600;
                if (gTag === 2) gps.lat = deg; else gps.lon = deg;
              }
            }
            if (typeof gps.lat === "number" && typeof gps.lon === "number") {
              callback({
                lat: gps.latRef === "S" ? -gps.lat : gps.lat,
                lon: gps.lonRef === "W" ? -gps.lon : gps.lon
              });
            } else {
              callback(null);
            }
            return;
          } else if (marker === 0xd8 || marker === 0xd9) {
            offset += 2;
          } else {
            offset += 2 + view.getUint16(offset + 2, false);
          }
        }
        callback(null);
      } catch (err) {
        callback(null);
      }
    };
    reader.onerror = function () { callback(null); };
    reader.readAsArrayBuffer(file.slice(0, 131072)); // EXIF lives near the start of the file
  }
  function lookupPlaceName(lat, lon, callback) {
    fetch(RP + "/api/geocode?lat=" + lat + "&lon=" + lon)
      .then(function (res) { if (!res.ok) throw new Error("bad status"); return res.json(); })
      .then(function (data) { callback((data && data.place) || ""); })
      .catch(function () { callback(""); });
  }

  function puzzleImgSrc() {
    if (!state.puzzleCurrentId) return null;
    return RP + "/api/puzzle-image?id=" + encodeURIComponent(state.puzzleCurrentId);
  }
  function puzzleQueueRemaining() {
    return (state.puzzleQueue ? state.puzzleQueue.length : 0);
  }

  function puzzleGrid(imgSrc) {
    var unlocked = puzzleUnlockedCount();
    var grid = h("div", { class: "puzzle-grid" });
    for (var i = 0; i < PUZZLE_TOTAL; i++) {
      var rank = PUZZLE_ORDER.indexOf(i);
      var row = Math.floor(i / PUZZLE_COLS), col = i % PUZZLE_COLS;
      if (rank < unlocked) {
        var bgX = (col / (PUZZLE_COLS - 1)) * 100;
        var bgY = (row / (PUZZLE_ROWS - 1)) * 100;
        grid.appendChild(h("div", { class: "puzzle-cell", style: "background-image:url(" + imgSrc + ");background-position:" + bgX + "% " + bgY + "%;" }));
      } else {
        grid.appendChild(h("div", { class: "puzzle-cell locked", html: PUZZLE_LOCK_SVG }));
      }
    }
    return grid;
  }

  function puzzleZoomableGrid(imgSrc) {
    var wrap = h("div", { class: "puzzle-grid-wrap" });
    var grid = puzzleGrid(imgSrc);
    wrap.appendChild(grid);

    var scale = 1, panX = 0, panY = 0;
    var pinchStartDist = 0, pinchStartScale = 1;
    var panStartX = 0, panStartY = 0, pointerStartX = 0, pointerStartY = 0;
    var lastTapTime = 0;
    var overlay = null, placeholder = null;

    function ensurePlaceholder() {
      if (!placeholder && wrap.parentNode) {
        placeholder = document.createComment("puzzle-zoom-placeholder");
        wrap.parentNode.insertBefore(placeholder, wrap);
      }
    }
    function activateZoom() {
      ensurePlaceholder();
      if (!overlay) {
        overlay = h("div", { class: "puzzle-zoom-overlay" });
        overlay.addEventListener("click", function (e) { if (e.target === overlay) resetZoom(); });
      }
      if (!overlay.parentNode) {
        document.body.appendChild(overlay);
        overlay.appendChild(wrap);
      }
    }
    function deactivateZoom() {
      if (overlay && overlay.parentNode) {
        if (placeholder && placeholder.parentNode) {
          placeholder.parentNode.insertBefore(wrap, placeholder);
        }
        overlay.parentNode.removeChild(overlay);
      }
    }
    function updateZoomState() {
      if (scale > 1) activateZoom(); else deactivateZoom();
    }
    function resetZoom() {
      scale = 1; panX = 0; panY = 0;
      applyTransform();
    }
    function clampPan() {
      var gw = grid.offsetWidth * scale;
      var gh = grid.offsetHeight * scale;
      var maxX = Math.max(0, (gw - wrap.clientWidth) / 2);
      var maxY = Math.max(0, (gh - wrap.clientHeight) / 2);
      panX = Math.min(Math.max(panX, -maxX), maxX);
      panY = Math.min(Math.max(panY, -maxY), maxY);
    }
    function applyTransform() {
      updateZoomState();
      clampPan();
      grid.style.transform = "translate(-50%,-50%) translate(" + panX + "px," + panY + "px) scale(" + scale + ")";
      grid.style.position = "relative";
      grid.style.left = "50%";
      grid.style.top = "50%";
    }
    function clampScale(s) { return Math.min(Math.max(s, 1), 8); }
    function dist(t1, t2) {
      var dx = t1.clientX - t2.clientX, dy = t1.clientY - t2.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    wrap.addEventListener("touchstart", function (e) {
      if (e.touches.length === 2) {
        pinchStartDist = dist(e.touches[0], e.touches[1]);
        pinchStartScale = scale;
      } else if (e.touches.length === 1) {
        pointerStartX = e.touches[0].clientX;
        pointerStartY = e.touches[0].clientY;
        panStartX = panX; panStartY = panY;
        var now = Date.now();
        if (now - lastTapTime < 300) {
          scale = scale > 1 ? 1 : 2.5;
          if (scale === 1) { panX = 0; panY = 0; }
          applyTransform();
        }
        lastTapTime = now;
      }
    }, { passive: true });
    wrap.addEventListener("touchmove", function (e) {
      if (e.touches.length === 2) {
        e.preventDefault();
        var d = dist(e.touches[0], e.touches[1]);
        scale = clampScale(pinchStartScale * (d / pinchStartDist));
        applyTransform();
      } else if (e.touches.length === 1 && scale > 1) {
        e.preventDefault();
        panX = panStartX + (e.touches[0].clientX - pointerStartX);
        panY = panStartY + (e.touches[0].clientY - pointerStartY);
        applyTransform();
      }
    }, { passive: false });

    return wrap;
  }

  var puzzleGuessDraft = "";
  var puzzleBatchItems = []; // { file, answer }

  function puzzleAdvance() {
    fetch(RP + "/api/puzzle-advance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ who: viewerKey })
    })
      .then(function (res) { return res.json(); })
      .then(function (next) { state = next; online = true; renderApp(); })
      .catch(function () { online = false; renderApp(); });
  }

  function puzzleBatchForm() {
    var wrap = h("div", { class: "puzzle-setup" });

    var fileInput = document.createElement("input");
    fileInput.type = "file"; fileInput.accept = "image/*"; fileInput.multiple = true; fileInput.style.display = "none";
    var chooseBtn = h("button", { class: "puzzle-choose-btn", text: t("Choose up to 10 photos") });
    chooseBtn.addEventListener("click", function () { fileInput.click(); });

    var list = h("div", { class: "puzzle-batch-list" });
    var submitBtn = h("button", { class: "puzzle-upload-btn", text: t("Load pictures") });

    function refreshSubmit() {
      submitBtn.disabled = puzzleBatchItems.length === 0 || puzzleBatchItems.some(function (it) { return !it.answer.trim(); });
    }
    function renderList() {
      list.innerHTML = "";
      puzzleBatchItems.forEach(function (item, i) {
        var row = h("div", { class: "puzzle-batch-row" });
        var head = h("div", { class: "puzzle-batch-head" });
        head.appendChild(h("span", { class: "puzzle-batch-name", text: item.file.name }));
        var rm = h("button", { class: "puzzle-batch-remove", text: "✕" });
        rm.addEventListener("click", function () { puzzleBatchItems.splice(i, 1); renderList(); refreshSubmit(); });
        head.appendChild(rm);
        row.appendChild(head);
        var q = document.createElement("input");
        q.type = "text"; q.maxLength = 120; q.placeholder = t("Question (optional — defaults to \"where is this?\")");
        q.value = item.question || "";
        q.addEventListener("input", function () { item.question = q.value; });
        row.appendChild(q);
        var ans = document.createElement("input");
        ans.type = "text"; ans.maxLength = 120; ans.placeholder = t("Answer");
        ans.value = item.answer;
        ans.addEventListener("input", function () { item.answer = ans.value; refreshSubmit(); });
        row.appendChild(ans);
        list.appendChild(row);
      });
    }

    fileInput.addEventListener("change", function () {
      var room = 10 - puzzleBatchItems.length;
      var files = Array.prototype.slice.call(fileInput.files || [], 0, room);
      files.forEach(function (f) {
        var item = { file: f, answer: "", question: "" };
        puzzleBatchItems.push(item);
        readGPSFromJPEG(f, function (coords) {
          if (!coords) return;
          lookupPlaceName(coords.lat, coords.lon, function (place) {
            if (place && !item.answer) {
              item.answer = place;
              renderList();
              refreshSubmit();
            }
          });
        });
      });
      fileInput.value = "";
      renderList();
      refreshSubmit();
    });

    refreshSubmit();
    submitBtn.addEventListener("click", function () {
      if (!puzzleBatchItems.length) return;
      submitBtn.disabled = true;
      submitBtn.textContent = "Loading…";
      Promise.all(puzzleBatchItems.map(function (it) {
        return new Promise(function (resolve) {
          readAndCompressImage(it.file, 900, 0.82, function (dataUrl) { resolve({ dataUrl: dataUrl, answer: it.answer.trim(), question: (it.question || "").trim() }); });
        });
      })).then(function (items) {
        return fetch(RP + "/api/puzzle-batch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ who: viewerKey, items: items })
        });
      }).then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
        .then(function (result) {
          online = true;
          if (!result.ok || result.body.error) {
            // The upload itself worked — the server just refused to swap in
            // a new puzzle while the current one is still unsolved. Surface
            // that clearly instead of silently corrupting local state with
            // the error body (what used to happen here).
            submitBtn.disabled = false;
            submitBtn.textContent = t("Load pictures");
            var msg = result.body && result.body.error === "in_progress"
              ? t("There's already a puzzle in progress — solve it (or ask your partner to) before loading a new one.")
              : t("Couldn't load those pictures — try again.");
            setActiveTab("puzzle", msg);
            return;
          }
          state = result.body;
          var count = (state.puzzleQueue ? state.puzzleQueue.length : 0) + (state.puzzleCurrentId ? 1 : 0);
          puzzleBatchItems = [];
          var loadedTemplate = count === 1 ? "Loaded {count} photo — first one's up now." : "Loaded {count} photos — first one's up now.";
          setActiveTab("puzzle", tTemplate(loadedTemplate, { count: count }));
        })
        .catch(function () {
          online = false;
          submitBtn.disabled = false;
          submitBtn.textContent = t("Load pictures");
          renderApp();
        });
    });

    renderList();
    wrap.appendChild(chooseBtn);
    wrap.appendChild(fileInput);
    wrap.appendChild(list);
    wrap.appendChild(submitBtn);
    return wrap;
  }

  function puzzleLockedNote() {
    var remaining = 1 + puzzleQueueRemaining();
    var total = state.puzzleQueueTotal || remaining;
    var loaderName = state.puzzleQueueBy ? personName(state.puzzleQueueBy) : "";
    var wrap = h("div", { class: "puzzle-locked" });
    var lockedMsg = loaderName
      ? tTemplate("{name} loaded {total} pictures — {remaining} left in this batch.", { name: loaderName, total: total, remaining: remaining })
      : tTemplate("{total} pictures — {remaining} left in this batch.", { total: total, remaining: remaining });
    wrap.appendChild(h("p", { class: "puzzle-guess-note", text: lockedMsg }));
    var btn = h("button", { class: "puzzle-upload-btn", text: t("Choose photos") });
    btn.disabled = true;
    wrap.appendChild(btn);
    return wrap;
  }

  function puzzleGuessBlock() {
    var today = dateKey(new Date());
    var guessedToday = state.puzzleLastGuessDate === today;
    var isSetter = viewerKey === state.puzzleSetBy;
    var wrap = h("div", { class: "puzzle-guess" });
    if (isSetter) {
      var otherName = personName(otherKeyOf(viewerKey));
      if (state.puzzleQuestion) {
        wrap.appendChild(h("p", { class: "puzzle-question", text: state.puzzleQuestion }));
      }
      wrap.appendChild(h("p", { class: "puzzle-guess-note", text: tTemplate("You set this one — waiting for {name} to guess.", { name: otherName }) }));
      return wrap;
    }
    if (guessedToday) {
      var msg = state.puzzleLastGuessCorrect
        ? t("🎉 You got it!")
        : tTemplate("Today's guess: “{guess}” — not quite. Try again tomorrow.", { guess: state.puzzleLastGuessText });
      wrap.appendChild(h("p", { class: "puzzle-guess-note", text: msg }));
      if (!state.puzzleLastGuessCorrect && state.puzzleLastGuessText && state.puzzleLastGuessBy) {
        wrap.appendChild(translateBlock(state.puzzleLastGuessText, langCodeFor(otherKeyOf(state.puzzleLastGuessBy)), langCodeFor(state.puzzleLastGuessBy), state.puzzleLastGuessBy));
      }
      return wrap;
    }
    if (state.puzzleQuestion && state.puzzleSetBy) {
      wrap.appendChild(h("p", { class: "puzzle-question", text: state.puzzleQuestion }));
      wrap.appendChild(translateBlock(state.puzzleQuestion, langCodeFor(viewerKey), langCodeFor(state.puzzleSetBy), state.puzzleSetBy));
    }
    var input = document.createElement("input");
    input.type = "text"; input.maxLength = 120;
    input.placeholder = state.puzzleQuestion ? t("Your answer…") : t("Guess where (or what) this is…");
    input.value = puzzleGuessDraft;
    input.addEventListener("input", function () { puzzleGuessDraft = input.value; });
    var btn = h("button", { class: "puzzle-guess-btn", text: t("Guess") });
    function submitGuess() {
      var text = puzzleGuessDraft.trim();
      if (!text) return;
      btn.disabled = true;
      fetch(RP + "/api/puzzle-guess", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ who: viewerKey, text: text })
      })
        .then(function (res) {
          if (!res.ok) throw new Error("rejected");
          return res.json();
        })
        .then(function (next) { state = next; online = true; puzzleGuessDraft = ""; renderApp(); })
        .catch(function () { btn.disabled = false; renderApp(); });
    }
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); submitGuess(); } });
    btn.addEventListener("click", submitGuess);
    wrap.appendChild(h("div", { class: "puzzle-guess-row" }, [input, btn]));
    return wrap;
  }

  function puzzleSection() {
    var inBatch = !!state.puzzleCurrentId;
    var unlocked = puzzleUnlockedCount();
    var card = h("div", { class: "puzzle-card" }, [
      h("div", { class: "puzzle-head" }, [
        h("p", { class: "puzzle-title", text: t("Us, one piece at a time") }),
        h("span", { class: "puzzle-progress", text: tTemplate("{n} / {total} pieces", { n: unlocked, total: PUZZLE_TOTAL }) })
      ]),
      h("p", { class: "puzzle-explain", text: t("One of you loads up to 10 pictures, each with a question you both know the answer to. Each day you both answer that day's question, a new piece is revealed — keep the streak going and it speeds up: 2 pieces a day after 5 days running, 3 after 10. Guess the puzzle's answer right and the whole picture is revealed, then the next one begins.") })
    ]);
    if (!inBatch) {
      card.appendChild(puzzleBatchForm());
      if (state.puzzleQueueBy) {
        card.appendChild(h("p", { class: "puzzle-guess-note", text: tTemplate("Last loaded by {name} ({total} pictures).", { name: personName(state.puzzleQueueBy), total: state.puzzleQueueTotal || 0 }) }));
      }
    } else {
      card.appendChild(puzzleZoomableGrid(puzzleImgSrc()));
      if (state.puzzleSolved) {
        card.appendChild(h("p", { class: "puzzle-done-note", text: tTemplate("Solved — it was “{answer}.” ✧", { answer: state.puzzleAnswer }) }));
        if (state.puzzleAnswer && state.puzzleSetBy) {
          card.appendChild(translateBlock(state.puzzleAnswer, langCodeFor(otherKeyOf(state.puzzleSetBy)), langCodeFor(state.puzzleSetBy), state.puzzleSetBy));
        }
        var nextBtn = h("button", { class: "puzzle-upload-btn", text: puzzleQueueRemaining() > 0 ? t("Next picture →") : t("Finish batch") });
        nextBtn.addEventListener("click", function () { nextBtn.disabled = true; puzzleAdvance(); });
        card.appendChild(nextBtn);
      } else {
        card.appendChild(puzzleGuessBlock());
      }
      card.appendChild(puzzleLockedNote());
    }
    return card;
  }

  function startEdit(dateKeyVal) {
    editingEntry = dateKeyVal;
    var mineEntry = state.answers[dateKeyVal] && state.answers[dateKeyVal][viewerKey];
    editDraftText = (mineEntry && mineEntry.text) || "";
    renderApp();
  }
  function cancelEdit() { editingEntry = null; renderApp(); }
  // Posts under viewerKey — your actual, device-pinned identity (see
  // previewKey below: tapping your partner's status chip to preview their
  // weather never touches viewerKey, so there's no "wait, who am I
  // answering as" moment to confirm here any more).
  async function saveEdit(dateKeyVal) {
    var text = editDraftText.trim();
    if (!text) return;
    try { await api("/api/answer", { date: dateKeyVal, who: viewerKey, text: text }); }
    catch (e) { online = false; }
    editingEntry = null;
    renderApp();
  }
  function ownAnswerEditor(dateKeyVal) {
    var wrap = h("div", { class: "edit-form" });
    var ta = document.createElement("textarea");
    ta.value = editDraftText;
    ta.addEventListener("input", function () { editDraftText = ta.value; });
    var actions = h("div", { class: "edit-actions" });
    var cancel = h("button", { class: "mini-btn ghost", text: t("Cancel") });
    cancel.addEventListener("click", cancelEdit);
    var save = h("button", { class: "mini-btn primary", text: t("Save") });
    save.addEventListener("click", function () { saveEdit(dateKeyVal); });
    actions.appendChild(cancel); actions.appendChild(save);
    wrap.appendChild(ta); wrap.appendChild(actions);
    return wrap;
  }

  async function sendComment(dateKeyVal) {
    var text = (commentDrafts[dateKeyVal] || "").trim();
    if (!text) return;
    try { await api("/api/comment", { date: dateKeyVal, who: viewerKey, text: text }); }
    catch (e) { online = false; }
    commentDrafts[dateKeyVal] = "";
    renderApp();
  }
  function commentsBlock(dateKeyVal) {
    var wrap = h("div", { class: "comments" });
    var list = (state.comments && state.comments[dateKeyVal]) || [];
    list.forEach(function (c) {
      var person = PEOPLE[c.who] ? { name: personName(c.who), color: PEOPLE[c.who].color } : { name: t("Someone"), color: "var(--ink-soft)" };
      var cDiv = h("div", { class: "comment" }, [
        h("span", { class: "comment-name", style: "color:" + person.color, text: person.name + ":" }),
        h("span", { text: c.text })
      ]);
      cDiv.appendChild(translateBlock(c.text, langCodeFor(otherKeyOf(c.who)), langCodeFor(c.who), c.who));
      wrap.appendChild(cDiv);
    });
    var form = h("div", { class: "comment-form" });
    var input = document.createElement("input");
    input.type = "text"; input.maxLength = 200; input.placeholder = t("Reply to this day…");
    input.value = commentDrafts[dateKeyVal] || "";
    input.addEventListener("input", function () { commentDrafts[dateKeyVal] = input.value; });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); sendComment(dateKeyVal); } });
    var send = h("button", { class: "comment-send", text: t("Reply") });
    send.addEventListener("click", function () { sendComment(dateKeyVal); });
    form.appendChild(input); form.appendChild(send);
    wrap.appendChild(form);
    return wrap;
  }

  function setActiveTab(tab, flashMsg) {
    activeTab = tab;
    try { localStorage.setItem(TAB_LS_KEY, tab); } catch (e) {}
    if (flashMsg) puzzleFlashMsg = flashMsg;
    renderApp();
  }

  function tabBar() {
    var unlocked = puzzleUnlockedCount();
    var todayBtn = h("button", { class: "tab-btn" + (activeTab === "today" ? " active" : ""), text: t("Today") });
    todayBtn.addEventListener("click", function () { setActiveTab("today"); });
    var localBtn = h("button", { class: "tab-btn" + (activeTab === "local" ? " active" : ""), text: t("Local Feel") });
    localBtn.addEventListener("click", function () { setActiveTab("local"); });
    var puzzleBtn = h("button", { class: "tab-btn" + (activeTab === "puzzle" ? " active" : "") }, [
      document.createTextNode(t("Puzzle") + " "),
      h("span", { class: "tab-badge", text: unlocked + "/" + PUZZLE_TOTAL })
    ]);
    puzzleBtn.addEventListener("click", function () { setActiveTab("puzzle"); });
    return h("div", { class: "tab-bar" }, [todayBtn, localBtn, puzzleBtn]);
  }

  function puzzleFlashBanner() {
    if (!puzzleFlashMsg) return null;
    var msg = puzzleFlashMsg;
    puzzleFlashMsg = null;
    return h("p", { class: "puzzle-flash", text: msg });
  }

  // Email lives only in these in-memory drafts + the one-time send.
  var inviteParams = (function () {
    try {
      var p = new URLSearchParams(location.search);
      var iv = p.get("invite"), tk = p.get("token");
      if ((iv === "mark" || iv === "nikita") && tk) return { who: iv, token: tk };
    } catch (e) {}
    return null;
  })();
  var registerDraft = { name: "", email: "", location: "", language: "", languageTouched: false, relationship: "" };
  var acceptDraft = { name: "", location: "", language: "", languageTouched: false };
  // Looks up the typed location and, unless the person has already picked
  // a language themselves, pre-selects the language most likely spoken
  // there — still just a starting point, freely changeable via the
  // dropdown. Debounced so it fires once typing pauses, not per keystroke.
  var geoSuggestTimer = null;
  // Set by languageSelectField whenever it builds the dropdown currently on
  // screen, so the geo-suggest callback below can paint a fresh value onto
  // it directly — a full safeRerender() would silently no-op while the
  // person is still typing in the location field (it stays focused on
  // mobile until they tap away), which left the dropdown looking stuck.
  var lastLangSelectEl = null;
  function suggestLanguageFromLocation(draft, locationText) {
    if (geoSuggestTimer) clearTimeout(geoSuggestTimer);
    if (draft.languageTouched || !locationText.trim()) return;
    geoSuggestTimer = setTimeout(function () {
      fetch(RP + "/api/geo?location=" + encodeURIComponent(locationText.trim()))
        .then(function (r) { return r.json(); })
        .then(function (info) {
          if (draft.languageTouched) return; // they picked one while we were waiting
          if (info && info.language && draft.location.trim() === locationText.trim()) {
            draft.language = info.language;
            if (lastLangSelectEl && document.body.contains(lastLangSelectEl)) {
              lastLangSelectEl.value = info.language;
            } else {
              safeRerender();
            }
          }
        })
        .catch(function () {});
    }, 600);
  }
  var inviteEmailDraft = "";
  var regBusy = false, regError = "", showRegisterForm = false, showInviteForm = false;
  var showDeleteConfirm = false, deleteConfirmText = "", deleteBusy = false, deleteError = "";

  function textField(value, placeholder, onInput) {
    var i = document.createElement("input");
    i.type = "text"; i.placeholder = t(placeholder); i.value = value;
    i.addEventListener("input", function () { onInput(i.value); });
    return i;
  }
  // A dropdown of known languages — replaces free-text entry so a typo or
  // an unlisted language (like "Farsi" used to be) can't silently produce
  // no translation. "Choose a language" is a real placeholder option so
  // nothing's picked by default; picking one is required to register.
  function languageSelectField(value, onInput) {
    var sel = document.createElement("select");
    sel.className = "lang-select";
    lastLangSelectEl = sel;
    var placeholder = document.createElement("option");
    placeholder.value = ""; placeholder.textContent = t("Choose a language"); placeholder.disabled = true;
    if (!value) placeholder.selected = true;
    sel.appendChild(placeholder);
    LANGUAGES.forEach(function (pair) {
      var opt = document.createElement("option");
      opt.value = pair[0]; opt.textContent = pair[0];
      if (value === pair[0]) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", function () { onInput(sel.value); });
    return sel;
  }
  // Shown only to whoever registers first (soloRegistration) — see
  // registrationFlow(). Sets the room's shared relationship, which picks
  // the daily question pool for both people (questionPoolFor() in
  // questionForKey() above) for as long as the room exists.
  function relationshipSelectField(value, onInput) {
    var sel = document.createElement("select");
    sel.className = "lang-select";
    var placeholder = document.createElement("option");
    placeholder.value = ""; placeholder.textContent = t("Your relationship to each other"); placeholder.disabled = true;
    if (!value) placeholder.selected = true;
    sel.appendChild(placeholder);
    RELATIONSHIPS.forEach(function (pair) {
      var opt = document.createElement("option");
      opt.value = pair[0]; opt.textContent = t(pair[1]);
      if (value === pair[0]) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", function () { onInput(sel.value); });
    return sel;
  }

  function acceptInviteForm() {
    var card = h("div", { class: "card" }, [
      h("div", { class: "eyebrow" }, [h("span", { text: t("You're invited") })]),
      h("p", { class: "question", text: t("Finish setting up your Nearune.") })
    ]);
    var form = h("div", { class: "puzzle-setup" });
    form.appendChild(textField(acceptDraft.location, "Where you're based", function (v) { acceptDraft.location = v; suggestLanguageFromLocation(acceptDraft, v); }));
    form.appendChild(textField(acceptDraft.name, "Preferred name", function (v) { acceptDraft.name = v; }));
    form.appendChild(languageSelectField(acceptDraft.language, function (v) { acceptDraft.language = v; acceptDraft.languageTouched = true; }));
    if (regError) form.appendChild(h("p", { class: "puzzle-guess-note", text: t(regError) }));
    var btn = h("button", { class: "puzzle-upload-btn", text: regBusy ? t("Joining…") : t("Join Nearune") });
    btn.disabled = regBusy;
    btn.addEventListener("click", function () {
      if (!acceptDraft.name.trim()) { regError = "Enter your name."; renderApp(); return; }
      regBusy = true; regError = ""; renderApp();
      fetch(RP + "/api/accept-invite", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: inviteParams.token, name: acceptDraft.name.trim(), location: acceptDraft.location.trim(), language: acceptDraft.language.trim(), tz: browserTz() })
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
          regBusy = false;
          if (!res.ok) { regError = t("That invite link isn't valid."); renderApp(); return; }
          state = res.data;
          viewerKey = res.data.who;
          try { localStorage.setItem(VIEWER_LS_KEY, viewerKey); } catch (e) {}
          if (ROOM) { try { localStorage.setItem(MY_ROOM_LS_KEY, ROOM); } catch (e) {} }
          try {
            var u = new URL(location.href);
            u.searchParams.delete("invite"); u.searchParams.delete("token");
            history.replaceState({}, "", u.toString());
          } catch (e) {}
          inviteParams = null;
          online = true;
          renderApp();
          // Their weather / Local Feel were never fetched while the invite
          // screen was showing — load them now instead of waiting for the
          // next scheduled refresh.
          loadWeather(); loadNews(); loadMusic(); loadMovies();
        })
        .catch(function () { regBusy = false; regError = t("Something went wrong — try again."); renderApp(); });
    });
    form.appendChild(btn);
    card.appendChild(form);
    return card;
  }

  var lastConfirmUrl = "";
  function submitRegister() {
    var name = registerDraft.name.trim(), email = registerDraft.email.trim();
    if (!name || !email) { regError = t("Name and email or Instagram handle required."); renderApp(); return; }
    // Only the first registrant's choice is asked for (see
    // registrationFlow()) and only their choice is ever saved (the server
    // ignores a relationship on a room that already has one) — so this is
    // only required when it's actually shown.
    if (soloRegistration && !registerDraft.relationship) { regError = t("Pick how you two know each other."); renderApp(); return; }
    regBusy = true; regError = ""; renderApp();
    fetch(RP + "/api/register", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ who: viewerKey, name: name, contact: email, location: registerDraft.location.trim(), language: registerDraft.language.trim(), tz: browserTz(), relationship: registerDraft.relationship || undefined })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        regBusy = false;
        if (!res.ok) {
          regError = res.data && res.data.error === "rate_limited"
            ? t("Too many attempts — wait a bit and try again.")
            : t("Couldn't register — try again.");
          renderApp(); return;
        }
        lastConfirmUrl = res.data._confirmUrl || "";
        state = res.data;
        showRegisterForm = false;
        if (ROOM) { try { localStorage.setItem(MY_ROOM_LS_KEY, ROOM); } catch (e) {} }
        regError = res.data._emailSent === false ? t("Registered, but the email failed to send — try again.") : "";
        renderApp();
      })
      .catch(function () { regBusy = false; regError = t("Something went wrong — try again."); renderApp(); });
  }

  function registrationFlow() {
    var mine = state.people && state.people[viewerKey];
    var awaiting = state.pendingConfirm && state.pendingConfirm[viewerKey];
    if (mine && awaiting && !showRegisterForm) {
      var wait = h("div", { class: "card" }, [
        h("div", { class: "eyebrow" }, [h("span", { text: t("Almost there") })]),
        h("p", { class: "question", text: t("Check your email for a confirmation link.") }),
        h("p", { class: "puzzle-guess-note", text: t("Don't see it? Check your spam folder.") })
      ]);
      if (regError) wait.appendChild(h("p", { class: "puzzle-guess-note", text: t(regError) }));
      var rowBtns = [];
      var again = h("button", { class: "switch-link", text: t("Resend confirmation") });
      again.addEventListener("click", function () { showRegisterForm = true; renderApp(); });
      rowBtns.push(again);
      // No email provider configured (sandbox) or the email just failed to
      // send — either way this link finishes the same confirmation an email
      // would have, without waiting on one.
      if (lastConfirmUrl) rowBtns.push(copyLinkButton(lastConfirmUrl, t("Copy confirmation link")));
      wait.appendChild(h("div", { class: "switch-row" }, rowBtns));
      return wait;
    }
    var subtitle = soloRegistration
      ? t("You're the first one here — tell us a bit about yourself.")
      : tTemplate("You're registering as {name}.", { name: personName(viewerKey) });
    var card = h("div", { class: "card" }, [
      h("div", { class: "eyebrow" }, [h("span", { text: t("Set up your account") })]),
      h("p", { class: "question", text: subtitle })
    ]);
    var form = h("div", { class: "puzzle-setup" });
    form.appendChild(textField(registerDraft.location, "Where you're based", function (v) { registerDraft.location = v; suggestLanguageFromLocation(registerDraft, v); }));
    form.appendChild(textField(registerDraft.name, "Preferred name", function (v) { registerDraft.name = v; }));
    form.appendChild(textField(registerDraft.email, "Your email or Instagram handle", function (v) { registerDraft.email = v; }));
    form.appendChild(h("p", { class: "puzzle-guess-note", text: t("An Instagram handle works too — it just can't be used to recover a lost link, so keep your Nearune link handy.") }));
    form.appendChild(languageSelectField(registerDraft.language, function (v) { registerDraft.language = v; registerDraft.languageTouched = true; }));
    // Only the first person through sets this — it's shared by the room
    // (questionPoolFor() uses it for both people's daily question), so
    // asking again on the second person's own registration would just be
    // a choice that silently gets thrown away.
    if (soloRegistration) {
      form.appendChild(relationshipSelectField(registerDraft.relationship, function (v) { registerDraft.relationship = v; }));
    }
    if (regError) form.appendChild(h("p", { class: "puzzle-guess-note", text: t(regError) }));
    var btn = h("button", { class: "puzzle-upload-btn", text: regBusy ? t("Sending…") : t("Register") });
    btn.disabled = regBusy;
    btn.addEventListener("click", submitRegister);
    form.appendChild(btn);
    card.appendChild(form);
    if (!soloRegistration) {
      var sw = h("button", { class: "switch-link", text: tTemplate("Not {name}? Switch", { name: personName(viewerKey) }) });
      sw.addEventListener("click", function () { viewerKey = null; previewKey = null; weatherExpanded = false; try { localStorage.removeItem(VIEWER_LS_KEY); } catch (e) {} renderApp(); });
      card.appendChild(h("div", { class: "switch-row" }, [sw]));
    }
    var lost = h("div", { class: "switch-row" }, [h("a", { href: "/recover", class: "switch-link", text: t("Already registered somewhere? Recover your link") })]);
    card.appendChild(lost);
    return card;
  }

  var lastInviteUrl = "";
  function submitInvite() {
    var email = inviteEmailDraft.trim();
    if (!email) { regError = t("Enter an email or Instagram handle first."); renderApp(); return; }
    regBusy = true; regError = ""; renderApp();
    fetch(RP + "/api/invite", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ who: viewerKey, contact: email })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        regBusy = false;
        if (!res.ok) {
          regError = res.data && res.data.error === "rate_limited"
            ? t("Too many attempts — wait a bit and try again.")
            : t("Couldn't send invite — try again.");
          renderApp(); return;
        }
        lastInviteUrl = res.data._inviteUrl || "";
        state = res.data;
        showInviteForm = false;
        regError = res.data._emailSent === false ? t("Saved, but the email failed to send — try again.") : "";
        renderApp();
      })
      .catch(function () { regBusy = false; regError = t("Something went wrong — try again."); renderApp(); });
  }

  function copyLinkButton(url, label, cls) {
    var labelText = label || t("Copy invite link");
    var btn = h("button", { class: cls || "switch-link", text: labelText });
    btn.addEventListener("click", function () {
      var done = function () { btn.textContent = t("Copied!"); setTimeout(function () { btn.textContent = labelText; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, done);
      else { window.prompt(t("Copy this link:"), url); done(); }
    });
    return btn;
  }

  // Opens the phone's share sheet (so the link can go out as an Instagram DM,
  // text, etc.) where the browser supports it; otherwise falls back to
  // copying the link.
  function shareLinkButton(url, label, cls) {
    var labelText = label || t("Share invite link");
    var btn = h("button", { class: cls || "switch-link", text: labelText });
    btn.addEventListener("click", function () {
      if (navigator.share) {
        navigator.share({ title: "Nearune", url: url }).catch(function () {});
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { btn.textContent = t("Copied!"); setTimeout(function () { btn.textContent = labelText; }, 1500); }, function () {});
      } else {
        window.prompt(t("Copy this link:"), url);
      }
    });
    return btn;
  }

  function inviteFlow(otherKey) {
    var pending = state.pendingInvite && state.pendingInvite[otherKey];
    var pendingHandle = state.pendingInviteHandle && state.pendingInviteHandle[otherKey];
    var otherLabel = inviteeLabel(otherKey);
    var card = h("div", { class: "card" }, [h("div", { class: "eyebrow" }, [h("span", { text: tTemplate("Invite {name}", { name: otherLabel }) })])]);
    if (pending && !showInviteForm) {
      if (pendingHandle) {
        // Instagram-handle invite: nothing was sent anywhere — the link is
        // the invite, and the inviter delivers it themselves.
        card.appendChild(h("p", { class: "question", text: tTemplate("Send {name} this link — Nearune can't message Instagram for you.", { name: "@" + pendingHandle }) }));
        if (!lastInviteUrl) card.appendChild(h("p", { class: "puzzle-guess-note", text: t("Tap below to get a fresh link to send.") }));
        if (lastInviteUrl) {
          // Show the link itself, with real buttons and a next-step hint.
          card.appendChild(h("p", { class: "puzzle-guess-note", style: "word-break: break-all; background: var(--surface-2); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; margin: 0 0 12px;", text: lastInviteUrl }));
          card.appendChild(h("div", { class: "puzzle-setup-row", style: "margin-bottom: 10px;" }, [
            shareLinkButton(lastInviteUrl, t("Share link"), "puzzle-upload-btn"),
            copyLinkButton(lastInviteUrl, t("Copy link"), "puzzle-choose-btn")
          ]));
          card.appendChild(h("p", { class: "puzzle-guess-note", text: tTemplate("Paste it into an Instagram message to {name}. They tap it and set up their side.", { name: "@" + pendingHandle }) }));
        }
      } else {
        card.appendChild(h("p", { class: "question", text: tTemplate("Invite emailed — waiting for {name} to accept.", { name: otherLabel }) }));
        card.appendChild(h("p", { class: "puzzle-guess-note", text: tTemplate("Ask {name} to check their spam folder if it doesn't show up soon.", { name: otherLabel }) }));
        if (lastInviteUrl) card.appendChild(h("p", { class: "puzzle-guess-note", text: t("Email may not land — safer to send this link yourself.") }));
      }
      // After two days with no sign-up, nudge the inviter to send the link
      // themselves (text, Instagram or email) — emails can sit in spam.
      var invAt = state.pendingInviteAt && state.pendingInviteAt[otherKey];
      var invDays = invAt ? Math.floor((Date.now() - Date.parse(invAt)) / 86400000) : 0;
      if (invDays >= 2) {
        card.appendChild(h("p", { class: "puzzle-guess-note", style: "font-weight: 600;", text: tTemplate("It's been {days} days and {name} hasn't joined yet. Tap below for a fresh link, then send it yourself by text, Instagram or email.", { days: String(invDays), name: otherLabel }) }));
      }
      if (regError) card.appendChild(h("p", { class: "puzzle-guess-note", text: t(regError) }));
      var row = [];
      // With a handle invite and the link already on screen, Share/Copy are
      // all that's needed. The regenerate button only appears when the link
      // is gone (e.g. after a reload), since that's the only way to get it back.
      if (!(pendingHandle && lastInviteUrl)) {
        var again = h("button", { class: "switch-link", text: pendingHandle ? t("Get invite link") : t("Resend invite") });
        again.addEventListener("click", function () { showInviteForm = true; renderApp(); });
        row.push(again);
      }
      if (lastInviteUrl && !pendingHandle) row.push(copyLinkButton(lastInviteUrl));
      if (row.length) card.appendChild(h("div", { class: "switch-row" }, row));
    } else {
      card.appendChild(h("p", { class: "question", text: tTemplate("{name} hasn't joined yet — send an invite.", { name: otherLabel }) }));
      var form = h("div", { class: "puzzle-setup" });
      form.appendChild(textField(inviteEmailDraft, otherLabel + "'s email or Instagram handle", function (v) { inviteEmailDraft = v; }));
      form.appendChild(h("p", { class: "puzzle-guess-note", text: t("With an Instagram handle, you'll get a link to send them yourself.") }));
      if (regError) form.appendChild(h("p", { class: "puzzle-guess-note", text: t(regError) }));
      var btn = h("button", { class: "puzzle-upload-btn", text: regBusy ? t("Sending…") : t("Send invite") });
      btn.disabled = regBusy;
      btn.addEventListener("click", submitInvite);
      form.appendChild(btn);
      card.appendChild(form);
    }
    return card;
  }

  // Home screen while your invited partner hasn't joined yet: your own clock,
  // "Pending" (with days since the invite) for them, your own weather and Local
  // Feel, and the invite card. Replaced by the full two-person screen the moment
  // they register.
  // The weather and Local Feel fetches run once when the page opens — before a
  // brand-new person has registered, so they come back empty. Re-run them once
  // the person's profile (location) exists, and again after the partner joins.
  var soloFeedKey = "";
  function ensureSoloFeed() {
    var me = state.people && state.people[viewerKey];
    var k = me ? viewerKey + "|" + (me.location || "") + "|" + (me.travelLocation || "") : "";
    if (!k || k === soloFeedKey) return;
    soloFeedKey = k;
    loadWeather(); loadNews(); loadMusic(); loadMovies();
  }
  function renderSoloHome(app, otherKey) {
    if (showDeleteConfirm) { app.appendChild(deleteConfirmScreen()); return; }
    ensureSoloFeed();
    app.appendChild(header());
    var travelRow = travelBlock();
    if (travelRow) app.appendChild(travelRow);
    // Registered by email but not yet confirmed: show your own sky right
    // away, with the "check your email" card where the invite card will go
    // (the server only lets confirmed people send invites).
    if (!isConfirmedKey(viewerKey)) app.appendChild(registrationFlow());
    else app.appendChild(inviteFlow(otherKey));
    var weatherBlock = weatherWidgetBlock();
    if (weatherBlock) app.appendChild(weatherBlock);
    var newsBlock = newsLineBlock();
    if (newsBlock) app.appendChild(newsBlock);
    var musicBlock = musicLineBlock();
    if (musicBlock) app.appendChild(musicBlock);
    var moviesBlock = moviesLineBlock();
    if (moviesBlock) app.appendChild(moviesBlock);
    var pushRow = pushToggleRow();
    if (pushRow) app.appendChild(pushRow);
    var foot = h("div", { class: "switch-row" });
    foot.appendChild(h("a", { class: "switch-link", href: "/privacy", text: t("Privacy") }));
    foot.appendChild(h("a", { class: "switch-link", href: "/terms", text: t("Terms") }));
    var del = h("button", { class: "switch-link", text: t("Delete my data") });
    del.addEventListener("click", function () { showDeleteConfirm = true; deleteConfirmText = ""; deleteError = ""; renderApp(); });
    foot.appendChild(del);
    app.appendChild(foot);
    if (!online) app.appendChild(h("p", { class: "offline-note", text: t("Having trouble syncing — check your connection.") }));
  }

  function renderApp() {
    var app = document.getElementById("app");
    if (!app) return;
    app.innerHTML = "";

    if (inviteParams) { app.appendChild(acceptInviteForm()); return; }
    // A brand-new room (not the legacy one) with nobody registered yet has
    // only one real person so far — whoever has the link. This stays true
    // across every render (not just the one where viewerKey gets assigned),
    // since state.people is what actually tells us nobody's registered.
    var nobodyRegisteredYet = !!(ROOM && (!state.people || (!state.people.mark && !state.people.nikita)));
    soloRegistration = nobodyRegisteredYet;
    if (!viewerKey) {
      // Skip the "who's here" picker (it would show placeholder names, not
      // anyone real) and put the first visitor straight into registering.
      if (nobodyRegisteredYet) {
        viewerKey = "mark";
        soloRegistration = true;
        try { localStorage.setItem(VIEWER_LS_KEY, "mark"); } catch (e) {}
      } else {
        app.appendChild(pickerOverlay()); return;
      }
    }

    // The legacy room (no ROOM id) predates this registration/confirm
    // system entirely — Mark and Nikita have real hardcoded placeholder
    // identities there (see PEOPLE) and have always used the app without
    // ever going through it, so it never gates them. Every other room
    // (created via /new) is registration-required from the start.
    if (ROOM) {
      var mine = state.people && state.people[viewerKey];
      var otherKey = viewerKey === "mark" ? "nikita" : "mark";
      if (mine && !mine.confirmed && state.pendingConfirm && state.pendingConfirm[viewerKey] && !showRegisterForm && !isConfirmedKey(otherKey)) {
        renderSoloHome(app, otherKey); return;
      }
      if (!mine || !mine.confirmed) { app.appendChild(registrationFlow()); return; }

      var other = state.people && state.people[otherKey];
      var otherConfirmedYet = !!(other && other.confirmed);

      // One-time "want a daily reminder?" dialog — shown as soon as YOUR OWN
      // registration is confirmed, which for whoever registers first is
      // before they've even sent their partner's invite (not after, like it
      // used to be — that left them no way to turn push on until their
      // partner had already joined, so the "your partner joined!" push
      // below had nobody to send to). pushPromptDialog() is told whether the
      // partner's already in yet so it can say the right thing either way.
      // isPushPromptDismissed() is set the first time this is answered,
      // either way, so it never shows again to THIS person; the persistent
      // pushToggleRow link further down stays as the ongoing way back in.
      if (pushSupported() && pushState === "off" && !isPushPromptDismissed()) {
        app.appendChild(pushPromptDialog(!otherConfirmedYet)); return;
      }

      if (!otherConfirmedYet) { renderSoloHome(app, otherKey); return; }
      if (soloFeedKey) { soloFeedKey = ""; loadWeather(); loadNews(); loadMusic(); loadMovies(); }
    }

    if (showDeleteConfirm) { app.appendChild(deleteConfirmScreen()); return; }

    app.appendChild(header());
    // Traveling button sits right under the clock/timezone block at the
    // very top of the page. The "enable notifications" link used to sit
    // right under it too — moved to the bottom of the page, under the
    // voice-recording box, per feedback (see its new call site below).
    var travelRow = travelBlock();
    if (travelRow) app.appendChild(travelRow);
    app.appendChild(statusRow());
    // SANDBOX EXPERIMENT: the weather badge + blurb now sit here (where the
    // "next question" countdown used to be), right under the status row.
    var weatherBlock = weatherWidgetBlock();
    if (weatherBlock) app.appendChild(weatherBlock);
    app.appendChild(tabBar());
    // The fun local-news line, the music/movies chart lines, and the shared
    // photo card live on their own "Local Feel" tab now (per feedback — the
    // Today tab was getting cluttered), with nothing else alongside them.
    // Today and Puzzle stay focused on the question/journal and the puzzle
    // itself, respectively.
    if (activeTab === "local") {
      var newsBlock = newsLineBlock();
      if (newsBlock) app.appendChild(newsBlock);
      var musicBlock = musicLineBlock();
      if (musicBlock) app.appendChild(musicBlock);
      var moviesBlock = moviesLineBlock();
      if (moviesBlock) app.appendChild(moviesBlock);
      var photoBlock = photoCardBlock();
      if (photoBlock) app.appendChild(photoBlock);
    } else {
      app.appendChild(h("p", { class: "cdt", id: "cd-note", text: countdownText() }));
      if (activeTab === "puzzle") {
        var flash = puzzleFlashBanner();
        if (flash) app.appendChild(flash);
        app.appendChild(puzzleSection());
      } else {
        app.appendChild(questionCard());
        app.appendChild(streakCard());
        app.appendChild(journalSection());
      }
      // Moved below the Today/Puzzle content (and "Look back at past days" on
      // the Today tab specifically) per feedback — used to sit right under
      // the status row at the very top of the page. Shown on the Today tab
      // only — on the Puzzle and Local Feel tabs it read as unrelated
      // clutter (it's an account-level voice setting, not tied to either).
      if (activeTab === "today") {
        var voiceBlock = voiceRecorderBlock();
        if (voiceBlock) app.appendChild(voiceBlock);
      }
    }
    // The "enable notifications" link — now sits here, under the
    // voice-recording box, instead of up under the traveling button (see
    // that call site above). Only renders while notifications are actually
    // off (pushToggleRow() returns null once they're on).
    var pushRow = pushToggleRow();
    if (pushRow) app.appendChild(pushRow);
    app.appendChild(switchRow());
    if (!online) app.appendChild(h("p", { class: "offline-note", text: t("Having trouble syncing — check your connection.") }));
  }

  // A registered person shows their real name ("I'm Dan"). The legacy room
  // (no ROOM id) keeps real placeholder names too, so it can always say
  // "I'm Mark"/"I'm Nikita" even before anyone's gone through registration.
  // Any other room's not-yet-registered slot can't say "I'm Person B" in
  // the first person, so it offers to register instead.
  function pickerButtonLabel(key) {
    var p = state.people && state.people[key];
    if (p && p.name) return "I'm " + p.name;
    if (!ROOM) return "I'm " + PEOPLE[key].name;
    return t("I haven't registered yet");
  }
  function pickerOverlay() {
    return h("div", { class: "picker-overlay" }, [
      h("div", { class: "picker-card" }, [
        h("h2", { text: "Who's here?" }),
        h("p", { text: "So Nearune knows whose answer is whose." }),
        h("div", { class: "picker-choices" }, [
          h("button", { class: "picker-btn", onclick: function () { chooseViewer("mark"); } }, [document.createTextNode(pickerButtonLabel("mark"))]),
          h("button", { class: "picker-btn", onclick: function () { chooseViewer("nikita"); } }, [document.createTextNode(pickerButtonLabel("nikita"))])
        ])
      ])
    ]);
  }
  // Sets your ACTUAL identity for this device — everything you do (answer,
  // edit your status, comment, guess the puzzle) posts as this from here
  // on. Only called from the "who's here?" picker (first use) and the
  // explicit "Not {name}? Switch" link — never from a status-chip tap, see
  // previewAsPartner below, so nothing short of deliberately re-picking
  // who you are can change who you answer as.
  function chooseViewer(key) {
    viewerKey = key;
    previewKey = null;
    weatherExpanded = false;
    try { localStorage.setItem(VIEWER_LS_KEY, key); } catch (e) {}
    applyWeatherSky(); // instant, from whatever weather data is already loaded
    renderApp();
    loadWeather(); // refreshes it too — wasn't known yet during initialLoad's call, now it is
    loadNews();
    loadMusic();
    loadMovies();
  }

  // Toggles PREVIEWING your partner's weather/background (see
  // effectiveViewKey below) without touching viewerKey — tapping their
  // status chip again, or your own, clears it. Purely cosmetic: it never
  // changes who you answer, comment, or edit your status as.
  function previewAsPartner(key) {
    previewKey = previewKey === key ? null : key;
    weatherExpanded = false;
    musicExpanded = false;
    moviesExpanded = false;
    photoExpanded = false;
    applyWeatherSky();
    renderApp();
  }

  // Whose weather/background is being shown right now — the previewed
  // partner if you tapped their status chip (see previewAsPartner), your
  // own otherwise. Deliberately separate from viewerKey (your real,
  // device-pinned identity, set only by chooseViewer): this is cosmetic
  // only, so previewing a partner's screen can never make you answer,
  // comment, or edit a status as them.
  function effectiveViewKey() { return previewKey || viewerKey; }
  // True while YOU are registered but your invited partner hasn't joined yet
  // (never in the legacy room). The main screen then shows YOUR own weather
  // and Local Feel, and your partner's slot reads "Pending".
  function isConfirmedKey(key) {
    var p = state.people && state.people[key];
    return !!(p && p.confirmed);
  }
  function soloMode() {
    return !!(ROOM && viewerKey && state.people && state.people[viewerKey] && !isConfirmedKey(otherKeyOf(viewerKey)));
  }
  // Whose world (weather / local story / charts) the main screen shows: your
  // own while solo, otherwise your partner's (or the previewed person's partner).
  function worldKey() { return soloMode() ? viewerKey : otherKeyOf(effectiveViewKey()); }
  function worldLabel(key) {
    if (soloMode()) return t("you");
    return personName(key) + (personIsTraveling(key) ? " (traveling)" : "");
  }
  // The weather that SHOULD be tinting the background right now: whoever's
  // screen is effectively being shown, this is the weather at THEIR
  // partner's location — same rule the real app always applies, just
  // possibly applied to the previewed person instead of you.
  function currentSkyWeather() {
    var key = effectiveViewKey();
    if (!key) return null;
    return weatherByPerson[worldKey()] || null;
  }
  // SANDBOX EXPERIMENT: same "other person's" rule as currentSkyWeather(),
  // for the top local news line instead of the weather badge.
  function currentPartnerNews() {
    var key = effectiveViewKey();
    if (!key) return null;
    return newsByPerson[worldKey()] || null;
  }
  // SANDBOX EXPERIMENT: a single muted line — "Quirky story near <name>:
  // ..." — sitting between the Today/Puzzle content and the "next
  // question" countdown. A real story (see localnews.ts), so it links out
  // to the actual article — that's the point, so you can both open and
  // read/laugh over the same real thing. Returns null when there's no
  // on-theme story for today (see localnews.ts — it skips the line rather
  // than showing something that isn't actually quirky).
  function newsLineBlock() {
    var story = currentPartnerNews();
    if (!story || !story.headline) return null;
    var shownName = worldLabel(worldKey());
    var line = h("p", { class: "news-line" });
    line.appendChild(document.createTextNode("🤪 Quirky story near " + shownName + ": "));
    line.appendChild(
      h("a", { class: "news-link", href: story.url || "#", target: "_blank", rel: "noopener noreferrer", text: story.headline })
    );
    if (story.source) line.appendChild(document.createTextNode(" (" + story.source + ")"));
    // Headlines come from English-language news; show the reader's own
    // language underneath, same as exchanged answers do.
    var ul = otherUiLang();
    if (!ul) return line;
    return h("div", {}, [line, translateBlock(story.headline, ul, "en", null)]);
  }
  // SANDBOX EXPERIMENT: same "other person's" rule as currentPartnerNews(),
  // for the top-songs/top-movies charts.
  function currentPartnerMusic() {
    var key = effectiveViewKey();
    if (!key) return null;
    return musicByPerson[worldKey()] || null;
  }
  function currentPartnerMovies() {
    var key = effectiveViewKey();
    if (!key) return null;
    return moviesByPerson[worldKey()] || null;
  }
  // Renders the ranked top-5 list for either chart — shared by
  // musicLineBlock/moviesLineBlock's "Show top 5" expansion. labelFor
  // formats each entry's line (song: "title — artist", movie: just title).
  function chartExpandList(chart, labelFor, kind) {
    var list = h("ul", { class: "chart-list" });
    for (var i = 0; i < chart.length; i++) {
      var entry = chart[i];
      var li = h("li");
      li.appendChild(h("span", { class: "chart-rank", text: String(entry.rank) + "." }));
      li.appendChild(h("span", { class: "chart-title", text: labelFor(entry) }));
      if (entry.previewUrl) {
        var btn = chartPlayButton(entry.previewUrl, (kind === "video" ? "Watch " : "Play ") + labelFor(entry), kind);
        if (btn) li.appendChild(btn);
      }
      list.appendChild(li);
    }
    return list;
  }
  // SANDBOX EXPERIMENT: collapsed line — "🎵 Popular near <name>: <title> —
  // <artist>" with a play button for the #1 song's 30s preview, plus a
  // "Show top 5"/"Show less" toggle that expands into the full chart (see
  // chartExpandList). Same "peek into their world" idea as the weather
  // badge and news line. Returns null when there's no chart data yet for
  // the partner's location.
  function musicLineBlock() {
    var chart = currentPartnerMusic();
    if (!chart || !chart.length) return null;
    var shownName = worldLabel(worldKey());
    var top = chart[0];
    var wrap = h("div");
    var line = h("p", { class: "music-line" });
    line.appendChild(document.createTextNode("🎵 Popular near " + shownName + ": "));
    line.appendChild(
      h("a", { class: "music-link", href: top.url || "#", target: "_blank", rel: "noopener noreferrer", text: top.title + (top.artist ? " — " + top.artist : "") })
    );
    var playBtn = chartPlayButton(top.previewUrl, "Play " + top.title, "audio");
    if (playBtn) line.appendChild(document.createTextNode(" "));
    if (playBtn) line.appendChild(playBtn);
    wrap.appendChild(line);
    if (chart.length > 1) {
      var toggle = h("button", { class: "chart-expand-btn", type: "button", text: musicExpanded ? t("Show less") : t("Show top 5") });
      toggle.addEventListener("click", function () { musicExpanded = !musicExpanded; renderApp(); });
      var toggleRow = h("p", { style: "text-align:center;margin:2px 0 0;" });
      toggleRow.appendChild(toggle);
      wrap.appendChild(toggleRow);
      if (musicExpanded) {
        wrap.appendChild(chartExpandList(chart, function (e) { return e.title + (e.artist ? " — " + e.artist : ""); }, "audio"));
      }
    }
    return wrap;
  }
  // SANDBOX EXPERIMENT: same idea as musicLineBlock(), for the top-movies
  // chart.
  function moviesLineBlock() {
    var chart = currentPartnerMovies();
    if (!chart || !chart.length) return null;
    var shownName = worldLabel(worldKey());
    var top = chart[0];
    var wrap = h("div");
    var line = h("p", { class: "movie-line" });
    line.appendChild(document.createTextNode("🎬 Popular near " + shownName + ": "));
    line.appendChild(
      h("a", { class: "movie-link", href: top.url || "#", target: "_blank", rel: "noopener noreferrer", text: top.title })
    );
    var playBtn = chartPlayButton(top.previewUrl, "Watch trailer for " + top.title, "video");
    if (playBtn) line.appendChild(document.createTextNode(" "));
    if (playBtn) line.appendChild(playBtn);
    wrap.appendChild(line);
    if (chart.length > 1) {
      var toggle = h("button", { class: "chart-expand-btn", type: "button", text: moviesExpanded ? t("Show less") : t("Show top 5") });
      toggle.addEventListener("click", function () { moviesExpanded = !moviesExpanded; renderApp(); });
      var toggleRow = h("p", { style: "text-align:center;margin:2px 0 0;" });
      toggleRow.appendChild(toggle);
      wrap.appendChild(toggleRow);
      if (moviesExpanded) {
        wrap.appendChild(chartExpandList(chart, function (e) { return e.title; }, "video"));
      }
    }
    return wrap;
  }
  // SANDBOX EXPERIMENT: the weather badge (#weather-widget) — built inline
  // as part of renderApp() now (per feedback: moved out of its old fixed
  // upper-left overlay and into the main flow, where the "next question"
  // countdown used to sit), so it only shows on the main app view, not the
  // picker/registration/invite screens. Returns null when there's nothing
  // to show yet (no weather loaded, or viewerKey not known). The blurb and
  // tile sit side by side in a row; tapping the tile expands a full-width
  // detail card below the row with the place name and full condition;
  // tapping again collapses it.
  function weatherWidgetBlock() {
    var w = currentSkyWeather();
    if (!w || !viewerKey) return null;
    var icon = (w.theme && w.theme.icon) || "";
    var shownKey = worldKey();
    var solo = soloMode();
    var shownName = solo ? t("you") : personName(shownKey);
    var shownTraveling = personIsTraveling(shownKey);
    var sky = (w.theme && w.theme.sky) || ["#888", "#666"];
    var wrap = h("div", { id: "weather-widget" });
    // Which unit leads the big number: based on whoever is actually
    // holding THIS device (viewerKey — their real, device-pinned identity,
    // not previewKey/effectiveViewKey, so peeking at a partner's screen
    // never changes your own units), never on which city's weather is
    // being shown. weatherByPerson[viewerKey] is the weather at the
    // viewer's own effective location (see effectiveLocation in util.ts),
    // so its unit field tells us where the viewer lives, independent of w
    // (whichever city this tile's weather happens to be for). A viewer
    // outside the US sees Celsius only, full stop, no matter which city's
    // weather is on screen. A US-based viewer sees Fahrenheit as the big
    // number with Celsius underneath as the secondary, again no matter
    // which city is shown.
    var viewerWeather = weatherByPerson[viewerKey];
    var viewerIsUS = !!(viewerWeather && viewerWeather.unit === "F");
    var primaryUnit = viewerIsUS ? "F" : "C";
    var primaryTemp = viewerIsUS ? w.tempF : w.tempC;
    var secondaryTemp = w.tempC;
    var secondaryUnit = "C";
    var showSecondary = viewerIsUS && typeof secondaryTemp === "number";
    // Styled like a small native weather widget (colored gradient tile,
    // icon + big temp), not a plain pill button — tap it to expand the
    // detail card below, which sits with its own gap rather than crowding
    // the tile.
    var tile = h(
      "button",
      {
        type: "button",
        class: "weather-widget-tile" + (weatherExpanded ? " weather-widget-open" : ""),
        style: "background: linear-gradient(160deg, " + sky[0] + ", " + sky[1] + ")",
        "aria-expanded": weatherExpanded ? "true" : "false",
        onclick: function (e) {
          e.stopPropagation();
          weatherExpanded = !weatherExpanded;
          renderApp();
        },
      },
      [
        h("span", { class: "weather-widget-tile-icon", html: icon }),
        h(
          "span",
          { class: "weather-widget-tile-temp-wrap" },
          [
            h("span", { class: "weather-widget-tile-temp", text: primaryTemp + "°" + primaryUnit }),
            showSecondary
              ? h("span", { class: "weather-widget-tile-temp-secondary", text: secondaryTemp + "°" + secondaryUnit })
              : null,
            typeof w.humidity === "number"
              ? h("span", { class: "weather-widget-tile-humidity", text: "💧 " + w.humidity + "%" })
              : null,
          ].filter(Boolean)
        ),
        h("span", { class: "weather-widget-tile-label", text: w.theme.label }),
      ]
    );
    // The why-is-the-background-doing-this blurb — next to the tile, always
    // shown once weather's loaded, not just when expanded. The "this is
    // whose sky" part is bolded so it stands out from the whimsical lead-in.
    var blurb = h("p", { class: "sky-line" }, [
      document.createTextNode(
        "Whether the weather be hot, or whether the weather be cold — we'll be together whatever the weather, whether you like it or not. "
      ),
      h("strong", { text: solo ? "The sky over your head right now." : "The sky over " + (shownTraveling ? "✈️ " : "") + shownName + "'s head right now." }),
    ]);
    wrap.appendChild(h("div", { class: "weather-widget-row" }, [blurb, tile]));
    if (weatherExpanded) {
      var detailKids = [
        h("div", { class: "weather-widget-detail-place", text: w.location || "" }),
        h("div", { text: w.theme.label + " · " + (w.isDay ? "daytime" : "nighttime") }),
        h("div", { class: "weather-widget-detail-sub", text: (solo ? "Your sky right now" : shownName + "'s sky right now") + (shownTraveling ? " — traveling" : "") }),
      ];
      if (typeof w.humidity === "number") {
        detailKids.splice(2, 0, h("div", { text: t("Humidity") + " " + w.humidity + "%" }));
      }
      if (w.recentHours && w.recentHours.length > 1) {
        var temps = w.recentHours.map(function (p) { return p.temp; });
        var lo = Math.min.apply(null, temps);
        var hi = Math.max.apply(null, temps);
        var span = Math.max(1, hi - lo);
        var bars = w.recentHours.map(function (p) {
          var pct = Math.round(((p.temp - lo) / span) * 100);
          // The temperature used to only show as a tap-and-hold tooltip
          // (title attribute), which doesn't work on a phone tap — so the
          // chart looked like bare bars with no visible numbers. Now the
          // actual reading sits above each bar, same way a native weather
          // app's hourly strip does.
          return h("div", { class: "trend-bar-col", title: p.hour + ": " + p.temp + "°" + w.unit + (typeof p.humidity === "number" ? ", " + p.humidity + "% humidity" : "") }, [
            h("div", { class: "trend-bar-temp", text: p.temp + "°" }),
            h("div", { class: "trend-bar-fill", style: "height:" + Math.max(pct, 8) + "%" }),
            h("div", { class: "trend-bar-hour", text: p.hour.replace(/\s?[AP]M/i, "") }),
            typeof p.humidity === "number" ? h("div", { class: "trend-bar-hum", text: "💧" + p.humidity + "%" }) : null,
          ].filter(Boolean));
        });
        detailKids.push(h("div", { class: "weather-widget-trend-label", text: "Temperature (bars) and humidity (💧), last 6 hours (" + (solo ? "your" : shownName + "'s") + " local time, °" + w.unit + ")" }));
        detailKids.push(h("div", { class: "trend-bars" }, bars));
      }
      wrap.appendChild(h("div", { class: "weather-widget-detail" }, detailKids));
    }
    return wrap;
  }
  function clockBlock(key) {
    var cityText = effectiveClockLocation(key);
    var cityLabel = personIsTraveling(key) ? ("✈️ " + cityText) : cityText;
    var isMe = key === effectiveViewKey();
    var block = h("div", { class: "clock-block" + (isMe ? " clock-me" : "") }, [
      h("div", { class: "clock-city", text: cityLabel }),
      h("div", { class: "clock-time", "data-key": key, text: clockFor(effectiveClockTz(key)) }),
    ]);
    // Tapping a clock switches the view the same way tapping that person's
    // status chip does (preview only — never changes who you are).
    if (!soloMode() && viewerKey && !inviteParams) {
      block.style.cursor = "pointer";
      block.addEventListener("click", function () {
        if (key === viewerKey) { if (previewKey) previewAsPartner(previewKey); }
        else previewAsPartner(key);
      });
    }
    return block;
  }
  // Stand-in for a partner who hasn't registered yet: "Pending" plus how long
  // ago the invite went out (a placeholder city/time would be misleading).
  function pendingClockBlock(key) {
    var at = state.pendingInviteAt && state.pendingInviteAt[key];
    var days = at ? Math.floor((Date.now() - Date.parse(at)) / 86400000) : 0;
    var sub = !at ? t("Not invited yet") : days < 1 ? t("Invited today") : days === 1 ? t("Invited 1 day ago") : tTemplate("Invited {n} days ago", { n: String(days) });
    return h("div", { class: "clock-block" }, [
      h("div", { class: "clock-city", text: t("Pending") }),
      h("div", { class: "clock-time", text: "—" }),
      h("div", { class: "puzzle-guess-note", style: "margin: 2px 0 0;", text: sub }),
    ]);
  }
  function header() {
    var wordmark = h("div", { class: "wordmark", html: LOGO_MARK_SVG + "<span>Nearune</span>" });
    var solo = soloMode();
    var markClock = solo && !isConfirmedKey("mark") ? pendingClockBlock("mark") : clockBlock("mark");
    var nikitaClock = solo && !isConfirmedKey("nikita") ? pendingClockBlock("nikita") : clockBlock("nikita");
    var divider = h("div", { class: "clock-divider", html: PLANE_SVG });
    var clocks = h("div", { class: "clocks" }, [markClock, divider, nikitaClock]);
    return h("div", {}, [wordmark, clocks]);
  }

  // Mic-recording state for the "record your voice" card below — module-
  // level like puzzleBatchItems/puzzleGuessDraft above, since it needs to
  // survive the re-renders that happen every second while a recording is
  // in progress.
  // howtoOpen persists here (not as a DOM attribute read back from the
  // element) because renderApp() rebuilds the whole voice card from scratch
  // on every call, including the ones triggered by the background poll()
  // every 6s — without this, each rebuild recreated a fresh <details> with
  // no "open" attribute, which is exactly why the instructions kept closing
  // on their own mid-read.
  var voiceRecordState = { recording: false, mediaRecorder: null, chunks: [], seconds: 0, timer: null, uploading: false, error: "", howtoOpen: false };

  function stopVoiceRecording(cb) {
    var mr = voiceRecordState.mediaRecorder;
    if (voiceRecordState.timer) { clearInterval(voiceRecordState.timer); voiceRecordState.timer = null; }
    voiceRecordState.recording = false;
    if (mr && mr.state !== "inactive") {
      mr.addEventListener("stop", function once() {
        mr.removeEventListener("stop", once);
        if (mr.stream) mr.stream.getTracks().forEach(function (t) { t.stop(); });
        cb && cb();
      });
      mr.stop();
    } else {
      cb && cb();
    }
  }

  function uploadVoiceSample(key, blobOverride) {
    var blob = blobOverride;
    if (!blob) {
      var mimeType = (voiceRecordState.mediaRecorder && voiceRecordState.mediaRecorder.mimeType) || "audio/webm";
      blob = new Blob(voiceRecordState.chunks, { type: mimeType });
    }
    voiceRecordState.chunks = [];
    voiceRecordState.mediaRecorder = null;
    if (!blob.size) {
      voiceRecordState.error = t("That recording came out empty — try again.");
      renderApp();
      return;
    }
    voiceRecordState.uploading = true;
    voiceRecordState.error = "";
    renderApp();
    // Cloning the voice is a slow call out to ElevenLabs (a few seconds) —
    // long enough that the 6s background poll() can round-trip in the
    // middle of it and overwrite the result with pre-upload state right
    // after we apply it. Suppress poll() for the duration plus a buffer for
    // any poll that was already in flight when we finish.
    suppressPollUntil = Date.now() + 20000;
    var reader = new FileReader();
    reader.onload = function () {
      fetch(RP + "/api/voice-sample", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ who: key, dataUrl: reader.result }),
      })
        .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
        .then(function (result) {
          voiceRecordState.uploading = false;
          if (!result.ok || result.body.error) {
            voiceRecordState.error = result.body && result.body.error === "too_short"
              ? t("That was too short — try recording at least 15-20 seconds.")
              : t("Couldn't save that voice sample — try recording again somewhere quieter.");
            suppressPollUntil = 0;
            renderApp();
            return;
          }
          state = result.body;
          online = true;
          suppressPollUntil = Date.now() + 3000;
          renderApp();
        })
        .catch(function () {
          voiceRecordState.uploading = false;
          voiceRecordState.error = t("Upload failed — check your connection and try again.");
          suppressPollUntil = 0;
          renderApp();
        });
    };
    reader.readAsDataURL(blob);
  }

  // The vocalizer (translateBlock's 🔊 buttons) will use whichever cloned
  // voice is on file for each person the moment it exists — this card is
  // just how one gets recorded. Lives right under the status row, visible
  // to the signed-in viewer for their own voice only (never lets one person
  // record a sample "as" the other).
  function voiceRecorderBlock() {
    if (!viewerKey) return null;
    var key = viewerKey;
    var person = state.people && state.people[key];
    var hasVoice = !!(person && person.hasVoice);
    var partnerName = personName(otherKeyOf(key));
    var wrap = h("div", { class: "voice-card" });
    wrap.appendChild(h("div", { class: "voice-card-title", text: tTemplate("Let {name} hear your voice", { name: partnerName }) }));
    wrap.appendChild(h("p", {
      class: "voice-card-desc",
      text: hasVoice
        ? tTemplate("{name} already hears your voice in their head — now, whenever they tap 🔊, they can actually hear it.", { name: partnerName })
        : tTemplate("You already hear {name}'s voice in your head when you think of them. Record about 30 seconds so they can actually hear yours too, instead of a generic one.", { name: partnerName }),
    }));
    if (voiceRecordState.error) {
      wrap.appendChild(h("p", { class: "voice-card-error", text: voiceRecordState.error }));
    }
    var btnRow = h("div", { class: "voice-card-actions" });
    // Capacitor's iOS WKWebView (the native app) has no MediaRecorder at
    // all — that's not a permissions issue, just a missing API — so rather
    // than dead-ending there, fall back to a plain file picker. Unlike
    // mobile Safari, WKWebView's file-picker sheet does NOT offer a
    // "Record Audio" option (only Photo Library / Take Video / Choose
    // File — confirmed from an actual device), so there's no in-sheet way
    // to record. The two-step workaround below (record in Apple's own
    // Voice Memos app, save that recording to Files, then pick it up here
    // via "Choose File") uses only stock iOS apps — no native rebuild or
    // Capacitor plugin needed.
    var canRecordLive = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof MediaRecorder !== "undefined");
    if (!canRecordLive) {
      var fileInput = document.createElement("input");
      fileInput.type = "file";
      // No accept filter — WKWebView's file-picker sheet has a known bug
      // where "audio/*" greys out files it fails to classify exactly right
      // (seen on an actual device with a genuine Voice Memos recording),
      // so every file type is left selectable here and the actual
      // validation happens server-side (see /api/voice-sample), which
      // already checks the MIME type on the uploaded data.
      fileInput.style.display = "none";
      fileInput.addEventListener("change", function () {
        var file = fileInput.files && fileInput.files[0];
        fileInput.value = "";
        if (!file) return;
        voiceRecordState.error = "";
        uploadVoiceSample(key, file);
      });
      var pickBtn = h("button", {
        class: "mini-btn primary",
        type: "button",
        text: hasVoice ? t("Choose a new recording") : t("Choose my recording"),
      });
      pickBtn.disabled = voiceRecordState.uploading;
      pickBtn.addEventListener("click", function () { fileInput.click(); });
      // Collapsed by default, right under the first paragraph — the
      // instructions are a few steps long (Voice Memos → Save to Files →
      // come back here), which read as clutter to anyone who's done this
      // before or is just skimming; tapping the summary reveals them for
      // anyone who actually needs the walkthrough. Still appears above the
      // button itself, since it opens a file picker, not a recorder — the
      // steps only make sense read before tapping it.
      var howto = h("details", { class: "voice-card-howto" });
      if (voiceRecordState.howtoOpen) howto.setAttribute("open", "");
      // See voiceRecordState.howtoOpen's comment above — this is what keeps
      // it open across the background poll's re-renders instead of
      // snapping shut every few seconds.
      howto.addEventListener("toggle", function () { voiceRecordState.howtoOpen = howto.open; });
      var howtoSummary = h("summary", {});
      howtoSummary.appendChild(document.createTextNode(t("How do I record this?")));
      howtoSummary.appendChild(h("span", { class: "voice-card-howto-chevron" }));
      howto.appendChild(howtoSummary);
      var howtoApp = h("div", { class: "voice-card-howto-app" });
      howtoApp.appendChild(h("img", { src: VOICE_MEMOS_ICON_DATA_URL, alt: "", class: "voice-card-howto-icon" }));
      howtoApp.appendChild(document.createTextNode(
        t("Voice Memos — this one. It's already on your iPhone (Apple put it there), not something you need to download.")
      ));
      howto.appendChild(howtoApp);
      var howtoSteps = h("ol", { class: "voice-card-howto-steps" });
      [
        t("Find a quiet room and hold the phone 6-12 inches from your mouth — background noise and a far-away mic are the biggest reasons a clone comes out sounding off."),
        t("Open Voice Memos and tap the red record button."),
        tTemplate("Read this out loud, at a natural, unhurried pace: “{script}”", { script: VOICE_SAMPLE_SCRIPT }),
        t("Tap the record button again to stop, then tap Done."),
        t("Tap the ••• menu, then Save to Files."),
        t("Choose “On My iPhone” (not iCloud Drive) so it saves instantly, instead of showing a sync error."),
        t("Come back here and tap the button below to choose that recording."),
      ].forEach(function (step) { howtoSteps.appendChild(h("li", { text: step })); });
      howto.appendChild(howtoSteps);
      wrap.appendChild(howto);
      btnRow.appendChild(pickBtn);
      btnRow.appendChild(fileInput);
      wrap.appendChild(btnRow);
      if (voiceRecordState.uploading) {
        wrap.appendChild(h("p", { class: "voice-card-status-text", text: t("Uploading your voice sample…") }));
      }
      return wrap;
    }
    var recordBtn = h("button", {
      class: "mini-btn primary",
      type: "button",
      text: voiceRecordState.recording
        ? tTemplate("Stop ({seconds}s)", { seconds: voiceRecordState.seconds })
        : (hasVoice ? t("Re-record") : t("Record my voice")),
    });
    recordBtn.disabled = voiceRecordState.uploading;
    recordBtn.addEventListener("click", function () {
      if (voiceRecordState.recording) {
        stopVoiceRecording(function () { uploadVoiceSample(key); });
        renderApp();
        return;
      }
      voiceRecordState.error = "";
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        var mr;
        try {
          mr = new MediaRecorder(stream);
        } catch (e) {
          voiceRecordState.error = t("Couldn't start recording.");
          stream.getTracks().forEach(function (t) { t.stop(); });
          renderApp();
          return;
        }
        voiceRecordState.chunks = [];
        mr.addEventListener("dataavailable", function (e) { if (e.data && e.data.size) voiceRecordState.chunks.push(e.data); });
        voiceRecordState.mediaRecorder = mr;
        voiceRecordState.recording = true;
        voiceRecordState.seconds = 0;
        mr.start();
        voiceRecordState.timer = setInterval(function () {
          voiceRecordState.seconds++;
          // Hard cap so nobody accidentally leaves this running for
          // minutes — a clean clone only needs well under a minute anyway.
          if (voiceRecordState.seconds >= 60) {
            stopVoiceRecording(function () { uploadVoiceSample(key); });
          }
          renderApp();
        }, 1000);
        renderApp();
      }).catch(function () {
        voiceRecordState.error = t("Microphone access was denied.");
        renderApp();
      });
    });
    btnRow.appendChild(recordBtn);
    wrap.appendChild(btnRow);
    if (voiceRecordState.recording) {
      wrap.appendChild(h("p", {
        class: "voice-card-prompt",
        text: tTemplate("Read this out loud: “{script}”", { script: VOICE_SAMPLE_SCRIPT }),
      }));
    }
    if (voiceRecordState.uploading) {
      wrap.appendChild(h("p", { class: "voice-card-status-text", text: t("Uploading your voice sample…") }));
    }
    return wrap;
  }

  // SANDBOX EXPERIMENT: "share a recent photo" — resize-client-side then
  // POST as base64, same approach as uploadVoiceSample above (and
  // puzzleBatch's image handling). suppressPollUntil guards the upload the
  // same way: the background poll() could otherwise round-trip mid-upload
  // and overwrite the freshly-saved photoAt with pre-upload state.
  function uploadPhoto(key, file) {
    photoUploadState.error = "";
    readAndCompressImage(file, 1600, 0.85, function (dataUrl) {
      photoUploadState.uploading = true;
      renderApp();
      suppressPollUntil = Date.now() + 15000;
      fetch(RP + "/api/photo-upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ who: key, dataUrl: dataUrl }),
      })
        .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body }; }); })
        .then(function (result) {
          photoUploadState.uploading = false;
          if (!result.ok || result.body.error) {
            photoUploadState.error = t("Couldn't share that photo — try again.");
            suppressPollUntil = 0;
            renderApp();
            return;
          }
          state = result.body;
          online = true;
          suppressPollUntil = Date.now() + 3000;
          renderApp();
        })
        .catch(function () {
          photoUploadState.uploading = false;
          photoUploadState.error = t("Upload failed — check your connection and try again.");
          suppressPollUntil = 0;
          renderApp();
        });
    });
  }
  function deletePhoto(key) {
    suppressPollUntil = Date.now() + 8000;
    fetch(RP + "/api/photo-delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ who: key }),
    })
      .then(function (res) { return res.json(); })
      .then(function (body) {
        state = body;
        online = true;
        photoExpanded = false;
        suppressPollUntil = Date.now() + 3000;
        renderApp();
      })
      .catch(function () { suppressPollUntil = 0; });
  }
  // Sits under the movies line on the Today tab (per feedback) — same
  // "peek into their world" + "share something of your own" pairing as the
  // weather/music/movies widgets and the voice-recorder card: your
  // partner's most recent shared photo collapses behind a "Show photo"
  // toggle (same inline-expand pattern as the chart lists above — tap to
  // reveal it below, tap again to collapse), and your own share/replace
  // control sits underneath it, always visible.
  function photoCardBlock() {
    if (!viewerKey) return null;
    var key = viewerKey;
    var otherKey = otherKeyOf(key);
    var partnerName = personName(otherKey);
    var myPhotoAt = state.people && state.people[key] && state.people[key].photoAt;
    var partnerPhotoAt = state.people && state.people[otherKey] && state.people[otherKey].photoAt;
    var wrap = h("div", { class: "voice-card" });
    wrap.appendChild(h("div", { class: "voice-card-title", text: "📷 " + tTemplate("Photos with {name}", { name: partnerName }) }));
    if (partnerPhotoAt) {
      var line = h("p", { class: "voice-card-desc" });
      line.appendChild(document.createTextNode(tTemplate("{name} shared a photo. ", { name: partnerName })));
      var toggle = h("button", { class: "chart-expand-btn", type: "button", text: photoExpanded ? t("Hide photo") : t("Show photo") });
      toggle.addEventListener("click", function () { photoExpanded = !photoExpanded; renderApp(); });
      line.appendChild(toggle);
      wrap.appendChild(line);
      if (photoExpanded) {
        wrap.appendChild(h("img", {
          class: "shared-photo",
          src: RP + "/api/photo?who=" + otherKey + "&v=" + encodeURIComponent(partnerPhotoAt),
          alt: partnerName + "'s shared photo",
        }));
      }
    } else {
      wrap.appendChild(h("p", { class: "voice-card-desc", text: tTemplate("{name} hasn't shared a photo yet.", { name: partnerName }) }));
    }
    // If your partner signed up with (or was invited by) an Instagram
    // handle, link to it — a plain https link, opens in the browser/app.
    // The handle is unverified text they entered, so it's only a label.
    var partnerIg = state.people && state.people[otherKey] && state.people[otherKey].instagram;
    if (partnerIg) {
      var igLine = h("p", { class: "voice-card-desc" });
      igLine.appendChild(document.createTextNode("📸 "));
      igLine.appendChild(h("a", { href: "https://instagram.com/" + encodeURIComponent(partnerIg), target: "_blank", rel: "noopener noreferrer", text: "@" + partnerIg + " on Instagram" }));
      wrap.appendChild(igLine);
    }
    if (photoUploadState.error) {
      wrap.appendChild(h("p", { class: "voice-card-error", text: photoUploadState.error }));
    }
    var fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.style.display = "none";
    fileInput.addEventListener("change", function () {
      var file = fileInput.files && fileInput.files[0];
      fileInput.value = "";
      if (!file) return;
      uploadPhoto(key, file);
    });
    var btnRow = h("div", { class: "voice-card-actions" });
    var pickBtn = h("button", {
      class: "mini-btn primary",
      type: "button",
      text: myPhotoAt ? t("Share a new photo") : t("Share a photo"),
    });
    pickBtn.disabled = photoUploadState.uploading;
    pickBtn.addEventListener("click", function () { fileInput.click(); });
    btnRow.appendChild(pickBtn);
    if (myPhotoAt) {
      var removeBtn = h("button", { class: "mini-btn ghost", type: "button", text: t("Remove mine") });
      removeBtn.disabled = photoUploadState.uploading;
      removeBtn.addEventListener("click", function () { deletePhoto(key); });
      btnRow.appendChild(removeBtn);
    }
    btnRow.appendChild(fileInput);
    wrap.appendChild(btnRow);
    if (photoUploadState.uploading) {
      wrap.appendChild(h("p", { class: "voice-card-status-text", text: t("Sharing your photo…") }));
    }
    return wrap;
  }

  function statusRow() {
    var row = h("div", { class: "status-row" });
    ["mark", "nikita"].forEach(function (key) {
      var person = PEOPLE[key];
      var current = (state.status[key] && state.status[key].text) || "";
      var isSelf = viewerKey === key;
      var chipClass = "status-chip" + (!isSelf ? " status-chip-preview" : "");
      var chipKids = [h("span", { class: "status-dot", style: "background:" + person.color })];
      if (personIsTraveling(key)) chipKids.unshift(h("span", { class: "status-travel-flag", text: "✈️", title: t("Traveling") }));
      var chip = h("div", { class: chipClass }, chipKids);
      var input = document.createElement("input");
      input.type = "text"; input.maxLength = 60; input.placeholder = tTemplate("{name}'s world right now…", { name: personName(key) });
      input.value = current;
      input.disabled = !isSelf;
      if (isSelf) {
        input.addEventListener("change", function () {
          api("/api/status", { who: key, text: input.value }).catch(function () { online = false; renderApp(); });
        });
      } else {
        // Tapping your partner's chip previews the background/weather
        // their home screen would show (see previewAsPartner) — NOT a
        // switch of who you are: their status input stays disabled, and
        // nothing you do still posts as anyone but viewerKey. Tapping
        // again (either chip) clears the preview. The input itself is
        // disabled, so clicks on it wouldn't otherwise reach this handler
        // — pointer-events routes them to the chip.
        input.style.pointerEvents = "none";
        chip.style.cursor = "pointer";
        chip.addEventListener("click", function () {
          previewAsPartner(key);
        });
      }
      chip.appendChild(input);
      row.appendChild(chip);
    });
    return row;
  }

  function questionCard() {
    var today = dateKey(new Date());
    var q = questionForKey(today);
    var entry = state.answers[today] || {};
    var mine = entry[viewerKey] && entry[viewerKey].text;
    var complete = isComplete(today);

    var card = h("div", { class: "card" }, [
      h("div", { class: "eyebrow" }, [h("span", { text: t("Today's question") }), h("span", { text: t(formatDateLabel(today)) })]),
      h("p", { class: "question", text: q }),
      // Today's question read aloud in your partner's own cloned voice when
      // they've recorded one — it's their question to ask you, not a
      // generic narrator. Each person's own answer (below) stays in their
      // own voice via translateBlock's authorKey=key. Falls back to the
      // plain browser voice same as everywhere else if they haven't
      // recorded a sample.
      uiTranslateBlock(q, viewerKey ? otherKeyOf(viewerKey) : null)
    ]);

    if (complete) {
      var reveal = h("div", { class: "answers-reveal" });
      ["mark", "nikita"].forEach(function (key) {
        var person = PEOPLE[key];
        var bubble = h("div", { class: "answer-bubble", style: "background:color-mix(in srgb, " + person.color + " 10%, var(--surface))" });
        var headRow = h("div", { class: "answer-head" }, [h("span", { class: "answer-name", style: "color:" + person.color, text: personName(key) })]);
        if (key === viewerKey && editingEntry !== today) {
          var editBtn = h("button", { class: "edit-btn", text: t("Edit") });
          editBtn.addEventListener("click", function () { startEdit(today); });
          headRow.appendChild(editBtn);
        }
        bubble.appendChild(headRow);
        if (key === viewerKey && editingEntry === today) {
          bubble.appendChild(ownAnswerEditor(today));
        } else {
          bubble.appendChild(h("p", { class: "answer-text", text: entry[key].text }));
          bubble.appendChild(translateBlock(entry[key].text, langCodeFor(otherKeyOf(key)), langCodeFor(key), key));
        }
        reveal.appendChild(bubble);
      });
      card.appendChild(reveal);
      card.appendChild(commentsBlock(today));
    } else if (mine) {
      if (editingEntry === today) {
        card.appendChild(ownAnswerEditor(today));
      } else {
        var mineWrap = h("div", { class: "own-answer-visible" });
        mineWrap.appendChild(h("p", { class: "answer-text", text: mine }));
        mineWrap.appendChild(translateBlock(mine, langCodeFor(otherKeyOf(viewerKey)), langCodeFor(viewerKey), viewerKey));
        var editBtn2 = h("button", { class: "edit-btn", text: t("Edit your answer") });
        editBtn2.addEventListener("click", function () { startEdit(today); });
        mineWrap.appendChild(editBtn2);
        card.appendChild(mineWrap);
      }
      card.appendChild(h("div", { class: "waiting", html: PLANE_SVG + '<span>' + tTemplate("Sent — waiting for {name} to answer too.", { name: personName(otherKeyOf(viewerKey)) }) + '</span>' }));
    } else {
      // Before you've answered yourself, say whether your partner already
      // has — so you know your answer will reveal both right away, or that
      // you're not the one holding things up.
      var otherKey = otherKeyOf(viewerKey);
      var partnerAnswered = !!(entry[otherKey] && entry[otherKey].text);
      var partnerName = personName(otherKey);
      if (partnerAnswered) {
        card.appendChild(h("p", { class: "puzzle-guess-note", text: tTemplate("{name} has already answered — send yours to see both.", { name: partnerName }) }));
      } else {
        card.appendChild(h("div", { class: "waiting", html: PLANE_SVG + "<span>" + tTemplate("{name} hasn't answered yet either.", { name: partnerName }) + "</span>" }));
      }
      var form = h("div", { class: "answer-form" });
      var textarea = document.createElement("textarea");
      textarea.placeholder = t("Type your answer…");
      textarea.value = draftText;
      textarea.addEventListener("input", function () { draftText = textarea.value; });
      var btn = h("button", { class: "send-btn", text: t("Send") });
      btn.addEventListener("click", async function () {
        var text = textarea.value.trim();
        if (!text) return;
        btn.disabled = true;
        try { await api("/api/answer", { date: today, who: viewerKey, text: text }); draftText = ""; }
        catch (e) { online = false; }
        renderApp();
      });
      form.appendChild(textarea); form.appendChild(btn);
      card.appendChild(form);
    }
    return card;
  }

  function streakCard() {
    var info = streakInfo();
    var dots = h("div", { class: "streak-dots" });
    info.last7.forEach(function (d) { dots.appendChild(h("span", { class: "streak-dot" + (d.done ? " filled" : "") })); });
    var label = info.count === 0 ? t("Answer today to start a new streak.") : t("You've both shown up");
    var text = h("div", { class: "streak-text" }, [
      document.createTextNode(label + " "),
      info.count > 0 ? h("strong", { text: t(info.count === 1 ? "{n} day" : "{n} days").split("{n}").join(String(info.count)) }) : null,
      info.count > 0 ? document.createTextNode(" " + t("in a row.")) : null
    ]);
    return h("div", { class: "streak-card" }, [text, dots]);
  }

  function journalSection() {
    var wrap = h("div", {});
    var toggle = h("button", { class: "journal-toggle" + (journalOpen ? " open" : ""), html: '<span class="chevron">›</span><span>' + t(journalOpen ? "Hide" : "Look back at past days") + "</span>" });
    toggle.addEventListener("click", function () { journalOpen = !journalOpen; renderApp(); });
    wrap.appendChild(toggle);
    if (journalOpen) {
      var entries = journalEntries();
      var list = h("div", { class: "journal" });
      if (entries.length === 0) {
        list.appendChild(h("p", { class: "journal-empty", text: t("Nothing yet — your first shared day will show up here.") }));
      } else {
        entries.forEach(function (key) {
          var entry = state.answers[key];
          var entryDiv = h("div", { class: "journal-entry" }, [
            h("div", { class: "journal-date", text: t(formatDateLabel(key)) }),
            h("p", { class: "journal-q", text: questionForKey(key) }),
            uiTranslateBlock(questionForKey(key), viewerKey ? otherKeyOf(viewerKey) : null)
          ]);
          ["mark", "nikita"].forEach(function (pKey) {
            if (pKey === viewerKey && editingEntry === key) { entryDiv.appendChild(ownAnswerEditor(key)); return; }
            var line = h("p", { class: "journal-a" }, [h("b", { text: personName(pKey) + ": " }), document.createTextNode(entry[pKey].text)]);
            if (pKey === viewerKey) {
              var ebtn = h("button", { class: "edit-btn", text: t("Edit") });
              ebtn.style.marginLeft = "8px";
              ebtn.addEventListener("click", function () { startEdit(key); });
              line.appendChild(ebtn);
            }
            entryDiv.appendChild(line);
            entryDiv.appendChild(translateBlock(entry[pKey].text, langCodeFor(otherKeyOf(pKey)), langCodeFor(pKey), pKey));
          });
          entryDiv.appendChild(commentsBlock(key));
          list.appendChild(entryDiv);
        });
      }
      wrap.appendChild(list);
    }
    return wrap;
  }

  // --- Push notifications ---------------------------------------------

  // True inside the native iOS app shell (Capacitor injects 'window.Capacitor'
  // into every page it loads, even a remote URL like this one — no bundling
  // or import needed to reach it from here).
  function isNativeApp() {
    try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch (e) { return false; }
  }

  function pushSupported() {
    // The native app doesn't have the Web Push API (WKWebView never does),
    // but it has its own native path via the PushNotifications plugin below.
    return isNativeApp() || ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window);
  }

  function urlBase64ToUint8Array(base64String) {
    var padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    var rawData = atob(base64);
    var outputArray = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  // Pushes the shared "how many of you two still need to answer today"
  // count (0/1/2) to this tab's own icon — the same number both of your
  // devices show, regardless of which of you has or hasn't answered. Works
  // while the app is open; the service worker handles it the rest of the
  // time via incoming pushes.
  function syncAppBadge() {
    if (!("setAppBadge" in navigator)) return;
    var today = todayKeyStr();
    var count = unansweredCountLocal(today);
    try {
      if (count > 0) navigator.setAppBadge(count); else navigator.clearAppBadge();
    } catch (e) {}
  }

  function todayKeyStr() {
    // Mirrors the server's date key (falls back to local date if state
    // hasn't loaded a puzzle date hint yet — the server is the source of
    // truth either way since /api/state is polled continuously).
    var keys = Object.keys(state.answers || {}).sort();
    var latest = keys.length ? keys[keys.length - 1] : null;
    var d = new Date();
    var iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    return latest && latest >= iso ? latest : iso;
  }

  // How many of the two of you (0/1/2) haven't answered the given day's
  // question yet — mirrors the server's unansweredCount in util.ts.
  function unansweredCountLocal(key) {
    var a = state.answers && state.answers[key];
    var n = 0;
    if (!a || !a.mark || !a.mark.text) n++;
    if (!a || !a.nikita || !a.nikita.text) n++;
    return n;
  }

  // Fetches the VAPID key and registers the service worker ahead of time
  // (neither needs a user gesture), so enablePush() below has as little as
  // possible to do between the tap and the permission-gated subscribe call.
  function warmPush() {
    if (!pushSupported() || isNativeApp()) return; // nothing to pre-warm on the native path
    if (!vapidKeyCache) {
      fetch(RP + "/api/push-public-key")
        .then(function (r) { return r.json(); })
        .then(function (d) { if (d.configured && d.key) vapidKeyCache = d.key; })
        .catch(function () {});
    }
    if (!swRegistrationCache) {
      navigator.serviceWorker.register(RP + "/sw.js")
        .then(function (reg) { swRegistrationCache = reg; })
        .catch(function () {});
    }
  }

  async function enablePush() {
    if (!pushSupported() || !viewerKey) return;
    pushState = "busy"; pushError = ""; renderApp();
    if (isNativeApp()) {
      try {
        var PN = window.Capacitor.Plugins.PushNotifications;
        var perm = await PN.requestPermissions();
        if (perm.receive !== "granted") {
          pushState = "off";
          pushError = t("Notifications are blocked for this app — enable them in iPhone Settings → Notifications → Nearune, then try again.");
          renderApp(); return;
        }
        await new Promise(function (resolve, reject) {
          var settled = false;
          var timeoutId = setTimeout(function () {
            if (settled) return; settled = true;
            reject(new Error("Timed out waiting for Apple to register this device for push (no response after 45s)."));
          }, 45000);
          PN.addListener("registration", function (token) {
            if (settled) return; settled = true;
            clearTimeout(timeoutId);
            fetch(RP + "/api/push-subscribe", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ who: viewerKey, subscription: { kind: "apns", token: token.value } })
            }).then(function () { resolve(); }).catch(reject);
          });
          PN.addListener("registrationError", function (err) {
            if (settled) return; settled = true;
            clearTimeout(timeoutId);
            reject(err);
          });
          PN.register();
        });
        pushState = "on";
        try { localStorage.setItem(PUSH_LS_KEY, "on"); } catch (e) {}
        syncAppBadge();
      } catch (e) {
        pushState = "off";
        pushError = t("Couldn't enable reminders") + ": " + ((e && e.message) || String(e));
      }
      renderApp();
      return;
    }
    try {
      var keyStr = vapidKeyCache;
      if (!keyStr) {
        var keyRes = await fetch(RP + "/api/push-public-key");
        var keyData = await keyRes.json();
        if (!keyData.configured || !keyData.key) {
          pushState = "off"; pushError = t("Push isn't set up on the server yet."); renderApp(); return;
        }
        keyStr = keyData.key;
      }
      var reg = swRegistrationCache || await navigator.serviceWorker.register(RP + "/sw.js");
      // This is the one call that needs to still be "attached" to your tap —
      // everything above was pre-warmed on page load specifically so this
      // is the first (and only) real wait after tapping.
      var sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(keyStr) });
      await fetch(RP + "/api/push-subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ who: viewerKey, subscription: sub.toJSON() })
      });
      pushState = "on";
      try { localStorage.setItem(PUSH_LS_KEY, "on"); } catch (e) {}
      syncAppBadge();
    } catch (e) {
      pushState = "off";
      // NotAllowedError: permission denied (either just now, or a past
      // denial iOS won't re-prompt for — Settings > Notifications is the
      // only way back in that case). Anything else is a real bug.
      if (e && e.name === "NotAllowedError") {
        pushError = t("Notifications are blocked for this app — enable them in iPhone Settings → Notifications → Nearune, then try again.");
      } else {
        pushError = t("Couldn't enable reminders") + ": " + ((e && e.message) || String(e));
      }
    }
    renderApp();
  }

  async function disablePush() {
    if (!viewerKey) return;
    pushState = "busy"; renderApp();
    try {
      // Native: there's no OS-level "unregister" call worth making here —
      // telling the server to stop sending (below) is what actually matters.
      if (!isNativeApp() && "serviceWorker" in navigator) {
        var reg = await navigator.serviceWorker.getRegistration(RP + "/sw.js");
        if (reg) {
          var sub = await reg.pushManager.getSubscription();
          if (sub) await sub.unsubscribe();
        }
      }
      await fetch(RP + "/api/push-unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ who: viewerKey })
      });
    } catch (e) {}
    pushState = "off";
    try { localStorage.removeItem(PUSH_LS_KEY); } catch (e) {}
    renderApp();
  }

  function formatShortDate(key) {
    var d = new Date(keyToUtcMs(key) + 12 * 3600000);
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
  }

  function openTravelForm() {
    var my = state.people && state.people[viewerKey];
    travelDraft = {
      location: (my && my.travelLocation) || "",
      from: (my && my.travelFrom) || "",
      until: (my && my.travelUntil) || "",
      showEarly: my && my.travelLocation ? !!my.travelShowEarly : true,
    };
    travelError = "";
    travelFormOpen = true;
    renderApp();
  }
  function cancelTravelForm() {
    travelFormOpen = false;
    renderApp();
  }
  async function saveTravelForm() {
    var location = travelDraft.location.trim();
    if (!location) { travelError = t("Enter a city, or use Back home to clear it."); renderApp(); return; }
    travelBusy = true; travelError = ""; renderApp();
    try {
      await api("/api/travel", {
        who: viewerKey,
        location: location,
        from: travelDraft.from,
        until: travelDraft.until,
        showEarly: !!(travelDraft.from && travelDraft.showEarly),
      });
      travelFormOpen = false;
    } catch (e) { travelError = t("Something went wrong — try again."); }
    travelBusy = false;
    renderApp();
  }
  async function clearTravel() {
    travelBusy = true; travelError = ""; renderApp();
    try {
      await api("/api/travel", { who: viewerKey, location: "", from: "", until: "" });
      travelFormOpen = false;
    } catch (e) { travelError = t("Something went wrong — try again."); }
    travelBusy = false;
    renderApp();
  }
  // The "set a location" link's label, covering four states: no travel set,
  // travel already in effect (optionally with a return date), travel
  // scheduled for a future date (not visible to your partner yet), and that
  // same scheduled case with the early-heads-up opted in. Kept as distinct
  // full strings (rather than splicing a fragment into one template)
  // because tTemplate's translation pass runs on the whole template text.
  function travelStatusLabel(my, today) {
    if (!my.travelLocation) return t("✈️ Traveling? Set a location");
    if (travelActive(my, today)) {
      return my.travelUntil
        ? tTemplate("✈️ Showing as traveling to {place} until {date} — edit", { place: my.travelLocation, date: formatShortDate(my.travelUntil) })
        : tTemplate("✈️ Showing as traveling to {place} — edit", { place: my.travelLocation });
    }
    if (my.travelUntil) {
      return my.travelShowEarly
        ? tTemplate("✈️ Traveling to {place} from {from} to {until} (your partner sees it 2 days early) — edit", { place: my.travelLocation, from: formatShortDate(my.travelFrom), until: formatShortDate(my.travelUntil) })
        : tTemplate("✈️ Traveling to {place} from {from} to {until} — edit", { place: my.travelLocation, from: formatShortDate(my.travelFrom), until: formatShortDate(my.travelUntil) });
    }
    return my.travelShowEarly
      ? tTemplate("✈️ Traveling to {place} from {from} (your partner sees it 2 days early) — edit", { place: my.travelLocation, from: formatShortDate(my.travelFrom) })
      : tTemplate("✈️ Traveling to {place} from {from} — edit", { place: my.travelLocation, from: formatShortDate(my.travelFrom) });
  }
  // Lets you temporarily tell your PARTNER's weather/local-lore widgets and
  // clock to show a travel city instead of your home location — see
  // effectiveLocation/effectiveTz in util.ts. Everything about YOUR OWN
  // screen (your clock, timezone, daily rollover) stays on your real
  // registered location. Travel can start immediately or be scheduled
  // ahead of time via the "Starts" date, and — once scheduled — optionally
  // shown to your partner a couple of days before it actually starts.
  function travelBlock() {
    var my = state.people && state.people[viewerKey];
    if (!my) return null;
    var today = dateKey(new Date());
    var wrap = h("div", {});
    if (travelFormOpen) {
      var card = h("div", { class: "edit-form" });
      card.appendChild(h("p", { class: "puzzle-guess-note", text: t("Set where you're traveling — your partner's weather, local-story line and clock will show this instead of home. Leave \"Starts\" blank to begin right away, or pick a future date to schedule it ahead.") }));
      var fields = h("div", { class: "puzzle-setup" });
      fields.appendChild(textField(travelDraft.location, "City you're traveling to", function (v) { travelDraft.location = v; }));
      var fromInput = document.createElement("input");
      fromInput.type = "date";
      fromInput.value = travelDraft.from;
      fromInput.addEventListener("input", function () { travelDraft.from = fromInput.value; renderApp(); });
      fields.appendChild(h("div", { class: "travel-until-row" }, [
        h("span", { class: "travel-until-label", text: t("Starts (optional)") }),
        fromInput,
      ]));
      var dateInput = document.createElement("input");
      dateInput.type = "date";
      dateInput.value = travelDraft.until;
      dateInput.addEventListener("input", function () { travelDraft.until = dateInput.value; });
      fields.appendChild(h("div", { class: "travel-until-row" }, [
        h("span", { class: "travel-until-label", text: t("Return date (optional)") }),
        dateInput,
      ]));
      // Only meaningful when travel is scheduled for a future date — lets
      // your partner see it a couple of days ahead instead of right on
      // the morning it starts.
      if (travelDraft.from && travelDraft.from > today) {
        var earlyRow = h("label", { class: "travel-until-row" });
        var earlyCheckbox = document.createElement("input");
        earlyCheckbox.type = "checkbox";
        earlyCheckbox.checked = !!travelDraft.showEarly;
        earlyCheckbox.addEventListener("change", function () { travelDraft.showEarly = earlyCheckbox.checked; });
        earlyRow.appendChild(earlyCheckbox);
        earlyRow.appendChild(h("span", { class: "travel-until-label", text: t("Let your partner see this 2 days early") }));
        fields.appendChild(earlyRow);
      }
      card.appendChild(fields);
      if (travelError) card.appendChild(h("p", { class: "puzzle-guess-note", text: travelError }));
      var actions = h("div", { class: "edit-actions" });
      var cancel = h("button", { class: "mini-btn ghost", text: t("Cancel") });
      cancel.addEventListener("click", cancelTravelForm);
      actions.appendChild(cancel);
      if (my.travelLocation) {
        var clearBtn = h("button", { class: "mini-btn ghost", text: travelBusy ? t("Working…") : t("Back home") });
        clearBtn.disabled = travelBusy;
        clearBtn.addEventListener("click", clearTravel);
        actions.appendChild(clearBtn);
      }
      var save = h("button", { class: "mini-btn primary", text: travelBusy ? t("Working…") : t("Save") });
      save.disabled = travelBusy;
      save.addEventListener("click", saveTravelForm);
      actions.appendChild(save);
      card.appendChild(actions);
      wrap.appendChild(card);
    } else {
      var row = h("div", { class: "switch-row top-action-row" });
      var link = h("button", { class: "switch-link", text: travelStatusLabel(my, today) });
      link.addEventListener("click", openTravelForm);
      row.appendChild(link);
      wrap.appendChild(row);
    }
    return wrap;
  }

  // Always rendered (whenever push itself is supported) — the label and
  // action flip with the actual current state, rather than the row just
  // disappearing once reminders are on: "Enable reminders" turns them on
  // when they're off, "Disable reminders" turns them off when they're on.
  function pushToggleRow() {
    if (!pushSupported() || !viewerKey) return null;
    var wrap = h("div", {});
    // Plain switch-row styling (no top-action-row pill card) now that this
    // sits at the bottom of the page among the other plain links, rather
    // than up top against the weather gradient where top-action-row's
    // solid-background card was needed for contrast.
    var row = h("div", { class: "switch-row" });
    var label = pushState === "busy" ? t("Working…") : pushState === "on" ? t("Disable reminders") : t("Enable reminders");
    var btn = h("button", { class: "switch-link", text: label });
    btn.disabled = pushState === "busy";
    btn.addEventListener("click", function () { if (pushState === "on") disablePush(); else enablePush(); });
    row.appendChild(btn);
    wrap.appendChild(row);
    if (pushError) wrap.appendChild(h("p", { class: "offline-note", text: pushError }));
    return wrap;
  }

  function switchRow() {
    var row = h("div", { class: "switch-row" });
    var link = h("button", { class: "switch-link", text: tTemplate("Not {name}? Switch", { name: personName(viewerKey) }) });
    link.addEventListener("click", function () {
      viewerKey = null;
      previewKey = null;
      weatherExpanded = false;
      try { localStorage.removeItem(VIEWER_LS_KEY); } catch (e) {}
      renderApp();
    });
    row.appendChild(link);
    var newRoomLink = h("a", { class: "switch-link", href: "/new", text: t("Start Nearune with someone else") });
    row.appendChild(newRoomLink);
    var privacyLink = h("a", { class: "switch-link", href: "/privacy", text: t("Privacy") });
    row.appendChild(privacyLink);
    var termsLink = h("a", { class: "switch-link", href: "/terms", text: t("Terms") });
    row.appendChild(termsLink);
    var deleteLink = h("button", { class: "switch-link", text: t("Delete my data") });
    deleteLink.addEventListener("click", function () { showDeleteConfirm = true; deleteConfirmText = ""; deleteError = ""; renderApp(); });
    row.appendChild(deleteLink);
    return row;
  }

  function deleteConfirmScreen() {
    var card = h("div", { class: "card" }, [
      h("div", { class: "eyebrow" }, [h("span", { text: t("Delete this room") })]),
      h("p", { class: "question", text: t("This permanently deletes everything in this room — both people's answers, photos, and puzzle progress. It can't be undone, and it deletes it for both of you, not just you.") }),
      h("p", { class: "puzzle-guess-note", text: t("Type DELETE below to confirm.") })
    ]);
    var input = document.createElement("input");
    input.type = "text"; input.value = deleteConfirmText; input.placeholder = "DELETE";
    input.addEventListener("input", function () { deleteConfirmText = input.value; });
    card.appendChild(input);
    if (deleteError) card.appendChild(h("p", { class: "puzzle-guess-note", text: t(deleteError) }));
    var btnRow = h("div", { class: "switch-row" });
    var cancel = h("button", { class: "switch-link", text: t("Cancel") });
    cancel.addEventListener("click", function () { showDeleteConfirm = false; renderApp(); });
    btnRow.appendChild(cancel);
    var confirmBtn = h("button", { class: "puzzle-upload-btn", text: deleteBusy ? t("Deleting…") : t("Permanently delete") });
    confirmBtn.disabled = deleteBusy || deleteConfirmText.trim().toUpperCase() !== "DELETE";
    confirmBtn.addEventListener("click", function () {
      deleteBusy = true; deleteError = ""; renderApp();
      fetch(RP + "/api/delete-room", { method: "POST" })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
          if (!res.ok) { deleteBusy = false; deleteError = t("Something went wrong — try again."); renderApp(); return; }
          try { localStorage.removeItem(VIEWER_LS_KEY); } catch (e) {}
          location.href = "/new";
        })
        .catch(function () { deleteBusy = false; deleteError = t("Something went wrong — try again."); renderApp(); });
    });
    btnRow.appendChild(confirmBtn);
    card.appendChild(btnRow);
    return card;
  }

  function tickClocks() {
    document.querySelectorAll(".clock-time[data-key]").forEach(function (el) {
      el.textContent = clockFor(effectiveClockTz(el.getAttribute("data-key")));
    });
    var cd = document.getElementById("cd-note");
    if (cd) cd.textContent = countdownText();
  }

  // Only matters on "/" (ROOM === ""), the legacy room's URL. Returns true
  // if it redirected away — callers should stop and not render/fetch.
  function redirectToMyRoom() {
    if (ROOM) return false;
    var myRoom = null;
    try { myRoom = localStorage.getItem(MY_ROOM_LS_KEY); } catch (e) {}
    if (myRoom) { location.href = "/r/" + myRoom; return true; }
    if (myRoom === "") return false; // this device's room IS the legacy one
    // Never decided yet. A device that already has a legacy viewer identity
    // saved (from before this check existed) belongs to the legacy room —
    // remember that and carry on so Mark/Nikita's existing devices aren't
    // disrupted. Anyone else is a brand-new visitor: send them to register
    // their own room instead of dropping them into Mark & Nikita's room.
    var legacyViewer = null;
    try { legacyViewer = localStorage.getItem(VIEWER_LS_KEY) || localStorage.getItem("sameSkyViewer"); } catch (e) {}
    if (legacyViewer === "mark" || legacyViewer === "nikita") {
      try { localStorage.setItem(MY_ROOM_LS_KEY, ""); } catch (e) {}
      return false;
    }
    // Manual escape hatch (linked from the "Create my room" screen) for a
    // legacy-room device that lost ALL of its localStorage at once (e.g.
    // the app was deleted and reinstalled) — there's nothing left on the
    // device to recognize automatically, so this has to be a deliberate,
    // explicit click rather than something auto-detected.
    var params = null;
    try { params = new URLSearchParams(location.search); } catch (e) {}
    if (params && params.get("legacy") === "1") {
      try { localStorage.setItem(MY_ROOM_LS_KEY, ""); } catch (e) {}
      try { history.replaceState(null, "", location.pathname); } catch (e) {}
      return false;
    }
    location.href = "/new";
    return true;
  }

  async function initialLoad() {
    if (redirectToMyRoom()) return;
    try {
      var res = await fetch(RP + "/api/state");
      state = await res.json();
      online = true;
    } catch (e) { online = false; }
    renderApp();
    syncAppBadge();
    loadWeather();
    loadNews();
    loadMusic();
    loadMovies();
    // Pre-fetch the VAPID key and pre-register the service worker now,
    // neither of which needs a user gesture, so a later tap on "Enable
    // reminders" has the shortest possible path to the permission-gated
    // subscribe call (see warmPush()'s comment). Also what keeps a
    // returning already-enabled device's service worker registered after a
    // browser restart or PWA reinstall-free update.
    warmPush();
  }

  // SANDBOX EXPERIMENT: fetches BOTH people's current weather in one call
  // (cheap — the server caches per location) so switching views is instant,
  // no extra round trip. Polled fairly often (WEATHER_POLL_MS) and also
  // refreshed whenever the tab/app comes back into view (see the
  // visibilitychange listener below), so the background stays close to
  // real-time without hammering the weather API while it's in the
  // background. Silently does nothing if viewerKey isn't known yet (the
  // "who's here?" picker screen) or the fetch fails; the app looks and
  // works identically either way.
  var WEATHER_POLL_MS = 5 * 60 * 1000;
  async function loadWeather() {
    if (!viewerKey) return;
    try {
      var res = await fetch(RP + "/api/weather");
      var data = await res.json();
      weatherByPerson = (data && data.weather) || { mark: null, nikita: null };
    } catch (e) {
      return; // leave whatever theme was already showing rather than clear it on a blip
    }
    applyWeatherSky();
    renderApp();
  }
  // SANDBOX EXPERIMENT: same shape as loadWeather() above, for the fun
  // local-news line — server caches it for a couple hours (see
  // localnews.ts) so polling this often costs nothing extra.
  async function loadNews() {
    if (!viewerKey) return;
    try {
      var res = await fetch(RP + "/api/news");
      var data = await res.json();
      newsByPerson = (data && data.news) || { mark: null, nikita: null };
    } catch (e) {
      return;
    }
    renderApp();
  }
  // SANDBOX EXPERIMENT: same shape again, for the top-songs/top-movies
  // charts — server caches each for 6 hours (see music.ts/movies.ts), so
  // polling this often costs nothing extra either.
  async function loadMusic() {
    if (!viewerKey) return;
    try {
      var res = await fetch(RP + "/api/music");
      var data = await res.json();
      musicByPerson = (data && data.music) || { mark: null, nikita: null };
    } catch (e) {
      return;
    }
    renderApp();
  }
  async function loadMovies() {
    if (!viewerKey) return;
    try {
      var res = await fetch(RP + "/api/movies");
      var data = await res.json();
      moviesByPerson = (data && data.movies) || { mark: null, nikita: null };
    } catch (e) {
      return;
    }
    renderApp();
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") { loadWeather(); loadNews(); loadMusic(); loadMovies(); }
  });
  function applyWeatherSky() {
    var el = document.getElementById("weather-sky");
    if (!el) return;
    var w = currentSkyWeather();
    if (!w || !w.theme) {
      el.style.background = "";
      document.body.classList.remove("weather-active");
      document.body.style.removeProperty("--weather-tint");
      return;
    }
    var sky = w.theme.sky;
    var glow = w.theme.glow;
    // Full page height (not just a fading sliver near the top) and a
    // stronger glow, so it reads clearly as "the sky changed" — see the
    // comment on #weather-sky for why this used to be too subtle.
    el.style.background =
      "radial-gradient(ellipse 140% 70% at 50% -10%, " + glow + "59, transparent 65%), " +
      "linear-gradient(180deg, " + sky[0] + " 0%, " + sky[1] + " 100%)";
    document.body.classList.add("weather-active");
    document.body.style.setProperty("--weather-tint", glow);
    // Night themes' sky gradient is near-black (see weather.ts's THEMES),
    // so text pinned to dark ink (the daytime default) goes nearly
    // invisible against it — switch to a pale ink instead whenever it's
    // nighttime at the OTHER person's location (the sky shown here).
    document.body.style.setProperty("--weather-ink", w.isDay ? "#2B211B" : "#F2EFE9");
  }

  async function poll() {
    try {
      var res = await fetch(RP + "/api/state");
      var next = await res.json();
      online = true;
      if (Date.now() < suppressPollUntil) return;
      state = next;
      var active = document.activeElement;
      var busy = active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT");
      if (!busy) renderApp();
      syncAppBadge();
    } catch (e) {
      online = false;
    }
  }

  initialLoad();
  setInterval(tickClocks, 30000);
  setInterval(poll, POLL_MS);
  setInterval(loadWeather, WEATHER_POLL_MS);
  setInterval(loadNews, WEATHER_POLL_MS);
})();
</script>
</body>
</html>`;

export function buildPageHtml(roomId: string, iconV: string): string {
  return RAW.replace(/__ICON_V__/g, iconV).replace(/__ROOM__/g, roomId);
}

// Web App Manifest — lets the app be added to the home screen and, on
// iOS 16.4+, is what makes it eligible for Web Push at all (only installed
// home-screen apps get it there, not a regular Safari tab).
export function buildManifestJson(roomId: string): string {
  var scope = roomId ? "/r/" + roomId + "/" : "/";
  return JSON.stringify({
    name: "Nearune",
    short_name: "Nearune",
    description: "A private daily-question ritual for two people who live apart.",
    start_url: scope,
    scope: scope,
    display: "standalone",
    background_color: "#FAF6EE",
    theme_color: "#FAF6EE",
    icons: [
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { src: "/favicon.png", sizes: "192x192", type: "image/png", purpose: "any" },
    ],
  });
}

// Service worker: only job is receiving push events and turning each one
// into a notification (required alongside any badge update — iOS revokes
// the subscription if a push is ever silent) plus the app-icon badge count
// that came in the payload, and focusing/opening the app on tap.
export function buildServiceWorkerJs(): string {
  return `self.addEventListener("install", function (event) {
  self.skipWaiting();
});
self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("push", function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  var title = data.title || "Nearune";
  var body = data.body || "";
  var badge = typeof data.badge === "number" ? data.badge : null;
  var tag = data.tag || "nearune";
  var work = [];
  if (badge !== null && "setAppBadge" in self.registration) {
    work.push(badge > 0 ? self.registration.setAppBadge(badge) : self.registration.clearAppBadge());
  }
  work.push(self.registration.showNotification(title, {
    body: body,
    tag: tag,
    icon: "/apple-touch-icon.png",
    badge: "/favicon.png"
  }));
  event.waitUntil(Promise.all(work));
});
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        if ("focus" in clientList[i]) return clientList[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })
  );
});
`;
}

export function buildNewRoomPage(): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Start Nearune</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap">
<style>
  :root { color-scheme: light; --bg:#FBF3EC; --surface:#FFFFFF; --ink:#2B211B; --ink-soft:#8B7A6C; --line:#E8D9C8; --accent:#C1673B; }
  @media (prefers-color-scheme: dark) {
    :root { color-scheme: dark; --bg:#14171F; --surface:#1D2130; --ink:#F2EFE9; --ink-soft:#A9AAB8; --line:#2B3040; --accent:#E8B75A; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font-family:'Manrope',sans-serif; display:flex; justify-content:center; padding:60px 16px; }
  .card { background:var(--surface); border:1px solid var(--line); border-radius:18px; padding:32px 26px; max-width:420px; width:100%; text-align:center; }
  h1 { font-family:'Manrope',sans-serif; font-weight:800; font-size:1.6rem; margin:0 0 10px; }
  p { color:var(--ink-soft); font-size:0.95rem; line-height:1.5; margin:0 0 24px; }
  button { background:var(--accent); color:#FFF8F1; border:none; border-radius:999px; padding:12px 26px; font:inherit; font-weight:700; font-size:0.95rem; cursor:pointer; }
  button:disabled { opacity:0.6; }
  .note { margin-top:16px; font-size:0.8rem; }
</style>
</head>
<body>
<div class="card">
  <h1>Start your own Nearune</h1>
  <p>Nearune is a small daily ritual for two people. Every day you both answer one shared question, and once you've each answered, a small piece of a hidden photo unlocks — answer enough days in a row and the whole picture comes together as a puzzle. It's built for couples, friends, or family who live apart and want one small thing to check in on together each day. If you each speak a different language, every screen shows both automatically, side by side.</p>
  <p>Tapping the button below creates a brand-new, completely private room just for the two of you — separate from anyone else using the app. You'll get a link to share with your Nearune partner; when you each open it, you'll register your own name, language, and location, then you're set.</p>
  <button id="go">Create my room</button>
  <p class="note" id="msg"></p>
  <p class="note"><a href="/recover" style="color:var(--ink-soft)">Already registered? Recover your link</a></p>
  <p class="note"><a href="/privacy" style="color:var(--ink-soft)">Privacy</a> &nbsp;·&nbsp; <a href="/terms" style="color:var(--ink-soft)">Terms</a></p>
</div>
<script>
document.getElementById("go").addEventListener("click", function () {
  var btn = document.getElementById("go");
  btn.disabled = true;
  btn.textContent = "Creating…";
  fetch("/api/create-room", { method: "POST" })
    .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
    .then(function (res) {
      if (res.ok && res.data && res.data.roomId) { location.href = "/r/" + res.data.roomId; return; }
      var msg = res.data && res.data.error === "rate_limited"
        ? "Too many rooms created from here recently — wait a bit and try again."
        : "Something went wrong — try again.";
      btn.disabled = false;
      btn.textContent = "Create my room";
      document.getElementById("msg").textContent = msg;
    })
    .catch(function () {
      btn.disabled = false;
      btn.textContent = "Create my room";
      document.getElementById("msg").textContent = "Something went wrong — try again.";
    });
});
</script>
</body>
</html>`;
}

export function buildRecoverPage(): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Recover your Nearune link</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap">
<style>
  :root { color-scheme: light; --bg:#FBF3EC; --surface:#FFFFFF; --ink:#2B211B; --ink-soft:#8B7A6C; --line:#E8D9C8; --accent:#C1673B; }
  @media (prefers-color-scheme: dark) {
    :root { color-scheme: dark; --bg:#14171F; --surface:#1D2130; --ink:#F2EFE9; --ink-soft:#A9AAB8; --line:#2B3040; --accent:#E8B75A; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font-family:'Manrope',sans-serif; display:flex; justify-content:center; padding:60px 16px; }
  .card { background:var(--surface); border:1px solid var(--line); border-radius:18px; padding:32px 26px; max-width:420px; width:100%; text-align:center; }
  h1 { font-family:'Manrope',sans-serif; font-weight:800; font-size:1.6rem; margin:0 0 10px; }
  p { color:var(--ink-soft); font-size:0.95rem; line-height:1.5; margin:0 0 20px; }
  input { width:100%; padding:12px 14px; border:1px solid var(--line); border-radius:10px; background:var(--bg); color:var(--ink); font:inherit; font-size:0.95rem; margin-bottom:14px; }
  button { background:var(--accent); color:#FFF8F1; border:none; border-radius:999px; padding:12px 26px; font:inherit; font-weight:700; font-size:0.95rem; cursor:pointer; }
  button:disabled { opacity:0.6; }
  .note { margin-top:16px; font-size:0.8rem; }
</style>
</head>
<body>
<div class="card">
  <h1>Lost your link?</h1>
  <p>Enter the email you used when you registered, and if it matches, we'll send you your Nearune room link. (Signed up with an Instagram handle instead? We have no email on file for you, so ask your partner to send you the room link again.)</p>
  <input id="email" type="email" placeholder="you@example.com" autocomplete="email">
  <button id="go">Send my link</button>
  <p class="note" id="msg"></p>
</div>
<script>
document.getElementById("go").addEventListener("click", function () {
  var btn = document.getElementById("go");
  var email = document.getElementById("email").value.trim();
  if (!email) { document.getElementById("msg").textContent = "Enter an email first."; return; }
  btn.disabled = true;
  btn.textContent = "Sending…";
  fetch("/api/recover-access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: email }) })
    .then(function () {
      btn.textContent = "Sent";
      document.getElementById("msg").textContent = "If that email matches an account, a link is on its way — check your inbox (and spam folder).";
    })
    .catch(function () {
      btn.disabled = false;
      btn.textContent = "Send my link";
      document.getElementById("msg").textContent = "Something went wrong — try again.";
    });
});
</script>
</body>
</html>`;
}

function legalPageShell(title, bodyHtml) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Nearune</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap">
<style>
  :root { color-scheme: light; --bg:#FBF3EC; --surface:#FFFFFF; --ink:#2B211B; --ink-soft:#8B7A6C; --line:#E8D9C8; --accent:#C1673B; }
  @media (prefers-color-scheme: dark) {
    :root { color-scheme: dark; --bg:#14171F; --surface:#1D2130; --ink:#F2EFE9; --ink-soft:#A9AAB8; --line:#2B3040; --accent:#E8B75A; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font-family:'Manrope',sans-serif; display:flex; justify-content:center; padding:50px 16px 80px; }
  .wrap { max-width:640px; width:100%; }
  .card { background:var(--surface); border:1px solid var(--line); border-radius:18px; padding:36px 30px; }
  h1 { font-family:'Manrope',sans-serif; font-weight:800; font-size:1.7rem; margin:0 0 4px; }
  h2 { font-family:'Manrope',sans-serif; font-weight:700; font-size:1.1rem; margin:28px 0 8px; }
  p, li { color:var(--ink-soft); font-size:0.95rem; line-height:1.6; }
  .updated { color:var(--ink-soft); font-size:0.8rem; margin:0 0 28px; }
  a { color:var(--accent); }
  ul { padding-left:20px; margin:8px 0; }
  .back { display:inline-block; margin-top:28px; color:var(--ink-soft); font-size:0.85rem; text-decoration:none; }
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    ${bodyHtml}
    <a class="back" href="/new">&larr; Back to Nearune</a>
  </div>
</div>
</body>
</html>`;
}

export function buildPrivacyPage() {
  return legalPageShell(
    "Privacy Policy",
    `<h1>Privacy Policy</h1>
    <p class="updated">Last updated September 2026</p>
    <p>Nearune is a small, private ritual for two people to share a daily question — built by one person for close-to-home use, now open for anyone to use. This page explains, plainly, what data we collect and what we do with it.</p>

    <h2>How access works</h2>
    <p>Nearune doesn't use passwords or accounts in the traditional sense. Each room is reachable only by its private link — a random, hard-to-guess address. Anyone with that link can act as either person in the room. Treat your room link the way you'd treat a shared password, and don't post it anywhere public.</p>

    <h2>What we store</h2>
    <ul>
      <li>The name, self-reported location text, and language you enter when you register.</li>
      <li>A timezone, resolved from that location text (or your browser's reported timezone if that fails) — used only to schedule the daily question rollover.</li>
      <li>Your daily answers, comments, and short status line.</li>
      <li>Photos you upload for the puzzle feature, and the questions/answers attached to them.</li>
    </ul>

    <h2>What we do with your email</h2>
    <p>We ask for an email address once, during registration, solely to send a one-time confirmation link and (if you ever lose your room link) a recovery link. We do not store your email address in plain text anywhere. Instead we store a one-way cryptographic fingerprint of it (an HMAC hash) that lets us recognize the same email again later without being able to reverse it back into the original address. Your email is never shared, sold, or used for marketing.</p>

    <h2>Where data lives</h2>
    <p>Room data and uploaded photos are stored in a cloud object-storage bucket. Outgoing emails (confirmations, invites, recovery links) are sent through a transactional email provider (Resend or SendGrid) — the email content passes through that provider but isn't retained by us beyond what's needed to send it. Location text you enter is sent to a free geocoding service (Open-Meteo) solely to resolve a timezone and language default; it isn't stored by us beyond the fields above.</p>

    <h2>What we don't do</h2>
    <p>We don't run ads, use ad trackers or analytics pixels, or sell or share your data with third parties for marketing. We don't read your answers except as needed to operate or debug the service.</p>

    <h2>Deleting your data</h2>
    <p>Either person in a room can permanently delete that room's data at any time from within the app ("Delete my data"). This removes the room's answers, photos, and puzzle state, and removes both people's entries from the recovery index. Deletion is immediate and can't be undone.</p>

    <h2>Children</h2>
    <p>Nearune isn't directed at children and isn't intended for use by anyone under 16.</p>

    <h2>Changes</h2>
    <p>If this policy changes in a meaningful way, we'll update the date at the top of this page.</p>

    <h2>Contact</h2>
    <p>Questions about this policy or your data: <a href="mailto:mark.berenstein@gmail.com">mark.berenstein@gmail.com</a>.</p>`
  );
}

export function buildTermsPage() {
  return legalPageShell(
    "Terms of Service",
    `<h1>Terms of Service</h1>
    <p class="updated">Last updated September 2026</p>
    <p>These terms cover your use of Nearune. By creating or using a room, you agree to them.</p>

    <h2>The service</h2>
    <p>Nearune lets two people share a private daily question, journal-style answers, and a slowly-revealed photo puzzle. It's provided as-is, free of charge, with no guarantee of uptime, data durability, or fitness for any particular purpose.</p>

    <h2>Your room and its link</h2>
    <p>A room's link is its only access control. You're responsible for keeping it private and for anything done through it, by you or anyone you've shared it with.</p>

    <h2>Acceptable use</h2>
    <p>Don't use Nearune to upload or share unlawful content, content that infringes someone else's rights, or content intended to harass, threaten, or harm another person. Don't attempt to disrupt the service, probe it for vulnerabilities, or use it to spam or abuse others (including via the room-creation or invite/recovery email features).</p>

    <h2>Your content</h2>
    <p>You keep whatever rights you have in the answers, comments, and photos you submit. You're solely responsible for what you upload, and you confirm you have the right to share it.</p>

    <h2>No warranty; limitation of liability</h2>
    <p>Nearune is provided "as is" without warranties of any kind. To the fullest extent permitted by law, we aren't liable for any indirect, incidental, or consequential damages arising from your use of the service, including loss of data.</p>

    <h2>Termination and deletion</h2>
    <p>You can delete your room's data at any time from within the app. We may also remove content or disable a room that violates these terms.</p>

    <h2>Changes</h2>
    <p>We may update these terms from time to time; the date above reflects the latest revision.</p>

    <h2>Governing law</h2>
    <p>These terms are governed by the laws of the State of California, without regard to conflict-of-law principles.</p>

    <h2>Contact</h2>
    <p>Questions about these terms: <a href="mailto:mark.berenstein@gmail.com">mark.berenstein@gmail.com</a>.</p>`
  );
}
