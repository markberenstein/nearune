// Same Sky — client page template, parameterized per room.

const RAW = String.raw`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Same Sky</title>
<meta name="description" content="A private daily-question ritual for Mark and Nikita, synced between San Mateo and Delhi.">
<link rel="icon" type="image/png" href="/favicon.png?v=__ICON_V__">
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=__ICON_V__">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,500;0,600;1,500;1,600&family=Karla:wght@400;500;700&display=swap">
<style>
  :root {
    color-scheme: light;
    --bg: #FAF6EE;
    --surface: #FFFFFF;
    --surface-2: #F1E9D8;
    --ink: #2A2333;
    --ink-soft: #786C82;
    --line: #E8DFCB;
    --accent: #C6912E;
    --accent-ink: #4A4368;
    --accent-2: #8C6FA8;
    --good: #7C8F63;
    --shadow: rgba(43,35,51,.10);
    --radius: 18px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      color-scheme: dark;
      --bg: #161320;
      --surface: #201B2E;
      --surface-2: #2A2440;
      --ink: #F4EFE7;
      --ink-soft: #B6AAC4;
      --line: #352F49;
      --accent: #E7BA5E;
      --accent-ink: #B3A6DD;
      --accent-2: #C79FE0;
      --good: #9FB77E;
      --shadow: rgba(0,0,0,.45);
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--ink);
    font-family: 'Karla', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    padding: 28px 16px 48px;
    display: flex;
    justify-content: center;
  }
  #app { width: 100%; max-width: 560px; display: flex; flex-direction: column; gap: 20px; }

  .wordmark {
    display: flex; align-items: center; justify-content: center; gap: 10px;
    font-family: 'Fraunces', Georgia, serif; font-style: italic; font-weight: 600;
    font-size: 1.4rem; letter-spacing: 0.01em; color: var(--accent-ink);
  }
  .wordmark svg { width: 34px; height: 34px; flex: none; }

  .clocks {
    display: flex; align-items: center; justify-content: center; gap: 14px;
    background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
    padding: 14px 18px; box-shadow: 0 1px 2px var(--shadow); flex-wrap: wrap;
  }
  .clock-block { text-align: center; min-width: 108px; }
  .clock-city { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-soft); }
  .clock-time { font-variant-numeric: tabular-nums; font-size: 1.15rem; font-weight: 700; }
  .clock-divider { flex: none; color: var(--accent); opacity: 0.7; }
  .clock-divider svg { width: 18px; height: 18px; display: block; transform: rotate(20deg); }

  .status-row { display: flex; gap: 10px; flex-wrap: wrap; }
  .status-chip {
    flex: 1 1 220px; display: flex; align-items: center; gap: 8px;
    background: var(--surface); border: 1px solid var(--line); border-radius: 999px;
    padding: 8px 14px; font-size: 0.82rem;
  }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
  .status-chip input { border: none; background: transparent; color: var(--ink); font: inherit; flex: 1; min-width: 0; outline: none; }
  .status-chip input::placeholder { color: var(--ink-soft); }

  .card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 26px 24px; box-shadow: 0 2px 10px var(--shadow); }
  .eyebrow { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-soft); display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
  .question { font-family: 'Fraunces', Georgia, serif; font-style: italic; font-weight: 500; font-size: 1.5rem; line-height: 1.35; text-wrap: balance; margin: 0 0 22px; }

  .answer-form { display: flex; flex-direction: column; gap: 10px; }
  textarea {
    width: 100%; resize: vertical; min-height: 84px; background: var(--surface-2);
    border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; color: var(--ink);
    font: inherit; font-size: 0.95rem; line-height: 1.5;
  }
  textarea:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  .send-btn {
    align-self: flex-end; background: var(--accent); color: #241C0A; border: none;
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

  .edit-btn { background: none; border: none; color: inherit; opacity: 0.65; cursor: pointer; font-size: 0.74rem; text-decoration: underline; padding: 0; font-family: inherit; }
  .edit-btn:hover { opacity: 1; }
  .edit-form { display: flex; flex-direction: column; gap: 8px; }
  .edit-form textarea { min-height: 64px; }
  .edit-actions { display: flex; gap: 8px; justify-content: flex-end; }
  .mini-btn { border: none; border-radius: 999px; padding: 6px 14px; font: inherit; font-size: 0.78rem; font-weight: 700; cursor: pointer; }
  .mini-btn.primary { background: var(--accent); color: #241C0A; }
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
  .puzzle-title { font-family: 'Fraunces', Georgia, serif; font-style: italic; font-weight: 600; font-size: 1.1rem; margin: 0; }
  .puzzle-progress { font-size: 0.8rem; color: var(--ink-soft); }
  .puzzle-explain { font-size: 0.83rem; color: var(--ink-soft); margin: 2px 0 4px; line-height: 1.4; }
  .puzzle-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 3px; aspect-ratio: 1; border-radius: 14px; overflow: hidden; background: var(--surface-2); }
  .puzzle-cell { background-repeat: no-repeat; background-size: 500% 500%; }
  .puzzle-cell.locked { background-image: none !important; background: var(--surface-2); display: flex; align-items: center; justify-content: center; }
  .puzzle-cell.locked svg { width: 16px; height: 16px; opacity: 0.28; }
  .puzzle-empty { display: flex; flex-direction: column; gap: 10px; align-items: center; text-align: center; padding: 20px 10px; color: var(--ink-soft); font-size: 0.88rem; }
  .puzzle-upload-btn { background: var(--accent); color: #241C0A; border: none; border-radius: 999px; padding: 9px 20px; font: inherit; font-weight: 700; font-size: 0.85rem; cursor: pointer; }
  .puzzle-upload-btn:disabled { opacity: 0.6; cursor: default; }
  .puzzle-replace { text-align: center; }
  .puzzle-replace-btn { background: none; border: none; color: var(--ink-soft); font: inherit; font-size: 0.76rem; text-decoration: underline; cursor: pointer; padding: 4px; }
  .puzzle-done-note { text-align: center; font-size: 0.85rem; color: var(--good); font-weight: 700; margin: 0; }
  .puzzle-setup { display: flex; flex-direction: column; gap: 8px; width: 100%; }
  .puzzle-setup input[type="text"] { width: 100%; background: var(--surface-2); border: 1px solid var(--line); border-radius: 999px; padding: 9px 14px; color: var(--ink); font: inherit; font-size: 0.85rem; outline: none; box-sizing: border-box; }
  .puzzle-setup input[type="text"]:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  .puzzle-setup-row { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
  .puzzle-choose-btn { background: var(--surface-2); border: 1px solid var(--line); color: var(--ink); border-radius: 999px; padding: 9px 16px; font: inherit; font-size: 0.83rem; cursor: pointer; }
  .puzzle-guess { display: flex; flex-direction: column; gap: 8px; }
  .puzzle-guess-row { display: flex; gap: 8px; }
  .puzzle-guess-row input { flex: 1; min-width: 0; background: var(--surface-2); border: 1px solid var(--line); border-radius: 999px; padding: 9px 14px; color: var(--ink); font: inherit; font-size: 0.85rem; outline: none; }
  .puzzle-guess-row input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  .puzzle-guess-btn { background: var(--accent-ink); color: #fff; border: none; border-radius: 999px; padding: 9px 18px; font: inherit; font-weight: 700; font-size: 0.83rem; cursor: pointer; flex: none; }
  .puzzle-guess-btn:disabled { opacity: 0.55; }
  .puzzle-guess-note { font-size: 0.83rem; color: var(--ink-soft); margin: 0; text-align: center; }
  .puzzle-batch-list { display: flex; flex-direction: column; gap: 6px; }
  .puzzle-batch-row { display: flex; align-items: center; gap: 6px; }
  .puzzle-batch-name { font-size: 0.78rem; color: var(--ink-soft); flex: 0 0 88px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .puzzle-batch-row input { flex: 1; min-width: 0; background: var(--surface-2); border: 1px solid var(--line); border-radius: 999px; padding: 7px 12px; color: var(--ink); font: inherit; font-size: 0.82rem; outline: none; }
  .puzzle-batch-remove { background: none; border: none; color: var(--ink-soft); font-size: 0.9rem; cursor: pointer; padding: 2px 6px; flex: none; }
  .puzzle-locked { display: flex; flex-direction: column; align-items: center; gap: 8px; padding-top: 4px; border-top: 1px dashed var(--line); margin-top: 4px; }

  .tab-bar { display: flex; gap: 4px; background: var(--surface); border: 1px solid var(--line); border-radius: 999px; padding: 4px; }
  .tab-btn { flex: 1; border: none; background: none; color: var(--ink-soft); font: inherit; font-weight: 700; font-size: 0.85rem; padding: 9px 12px; border-radius: 999px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; }
  .tab-btn.active { background: var(--accent); color: #241C0A; }
  .tab-badge { background: var(--accent-2); color: #fff; font-size: 0.68rem; font-weight: 700; border-radius: 999px; padding: 1px 7px; }
  .tab-btn.active .tab-badge { background: #241C0A; color: var(--accent); }
  .puzzle-flash { background: color-mix(in srgb, var(--good) 20%, var(--surface)); border: 1px solid var(--good); border-radius: 12px; padding: 11px 14px; font-size: 0.88rem; font-weight: 700; color: var(--ink); text-align: center; margin: 0; }

  .journal-toggle { background: none; border: none; color: var(--accent-ink); font: inherit; font-weight: 700; font-size: 0.85rem; cursor: pointer; padding: 6px 2px; text-align: left; display: flex; align-items: center; gap: 6px; }
  .journal-toggle .chevron { transition: transform 0.15s ease; }
  .journal-toggle.open .chevron { transform: rotate(90deg); }
  .journal { display: flex; flex-direction: column; gap: 14px; padding-top: 4px; }
  .journal-entry { border-left: 2px solid var(--line); padding-left: 14px; }
  .journal-date { font-size: 0.72rem; color: var(--ink-soft); letter-spacing: 0.04em; margin-bottom: 4px; }
  .journal-q { font-family: 'Fraunces', Georgia, serif; font-style: italic; font-size: 0.95rem; margin: 0 0 8px; }
  .journal-a { font-size: 0.85rem; margin-bottom: 4px; }
  .journal-a b { font-weight: 700; }
  .journal-empty { color: var(--ink-soft); font-size: 0.88rem; }

  .picker-overlay { position: fixed; inset: 0; background: rgba(20,16,28,0.55); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 20; }
  .picker-card { background: var(--surface); border-radius: var(--radius); padding: 30px 26px; max-width: 360px; width: 100%; text-align: center; box-shadow: 0 8px 30px var(--shadow); }
  .picker-card h2 { font-family: 'Fraunces', Georgia, serif; font-style: italic; font-weight: 600; font-size: 1.3rem; margin: 0 0 6px; }
  .picker-card p { color: var(--ink-soft); font-size: 0.88rem; margin: 0 0 20px; }
  .picker-choices { display: flex; flex-direction: column; gap: 10px; }
  .picker-btn { border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); border-radius: 12px; padding: 12px 16px; font: inherit; font-weight: 700; font-size: 0.95rem; cursor: pointer; }
  .picker-btn:hover { border-color: var(--accent); }

  .switch-row { text-align: center; }
  .switch-link { background: none; border: none; color: var(--ink-soft); font: inherit; font-size: 0.78rem; text-decoration: underline; cursor: pointer; padding: 4px; }
  .offline-note { text-align: center; font-size: 0.8rem; color: var(--ink-soft); padding: 4px 8px; }
  .cdt { text-align: center; font-size: 0.78rem; color: var(--ink-soft); padding: 2px 8px; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<div id="app"></div>
<script>
(function () {
  "use strict";

  var ROOM = "__ROOM__";
  var RP = ROOM ? "/r/" + ROOM : "";

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
    return (p && p.name) || t("your significant other");
  }
  function personLocation(key) {
    var p = state.people && state.people[key];
    return (p && p.location) || PEOPLE[key].city;
  }
  var LANG_NAME_TO_CODE = {
    english: "en", hindi: "hi", spanish: "es", french: "fr", german: "de",
    portuguese: "pt", italian: "it", mandarin: "zh", chinese: "zh", japanese: "ja",
    korean: "ko", arabic: "ar", russian: "ru", bengali: "bn", punjabi: "pa",
    gujarati: "gu", marathi: "mr", tamil: "ta", telugu: "te", urdu: "ur",
    dutch: "nl", polish: "pl", turkish: "tr", vietnamese: "vi", thai: "th",
    indonesian: "id", greek: "el", hebrew: "he", swedish: "sv", norwegian: "no"
  };
  function normalizeLangCode(raw) {
    var s = (raw || "").trim().toLowerCase();
    if (!s) return null;
    if (LANG_NAME_TO_CODE[s]) return LANG_NAME_TO_CODE[s];
    if (/^[a-z]{2}$/.test(s)) return s;
    var first = s.split(/[\s(,]/)[0];
    if (LANG_NAME_TO_CODE[first]) return LANG_NAME_TO_CODE[first];
    return s.slice(0, 2);
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

  var QUESTIONS = [
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
    var days = Math.floor((keyToUtcMs(key) - EPOCH_MS) / DAY_MS);
    var idx = ((days % QUESTIONS.length) + QUESTIONS.length) % QUESTIONS.length;
    return QUESTIONS[idx];
  }
  function formatDateLabel(key) {
    var d = new Date(keyToUtcMs(key) + 12 * 3600000);
    return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(d);
  }
  function clockFor(tz) { return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date()); }
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

  var state = { version: 1, answers: {}, status: {}, comments: {} };
  var viewerKey = null;
  var soloRegistration = false;
  try {
    viewerKey = localStorage.getItem(VIEWER_LS_KEY);
    if (viewerKey === null && !ROOM) viewerKey = localStorage.getItem("sameSkyViewer");
  } catch (e) {}
  if (viewerKey !== "mark" && viewerKey !== "nikita") viewerKey = null;

  var activeTab = "today";
  try {
    var storedTab = localStorage.getItem(TAB_LS_KEY);
    if (storedTab === null && !ROOM) storedTab = localStorage.getItem("sameSkyTab");
    if (storedTab === "puzzle" || storedTab === "today") activeTab = storedTab;
  } catch (e) {}
  var puzzleFlashMsg = null;

  // Favicon (daily-rotating heart, sky-gradient background) is served
  // server-side as real PNGs via <link rel="icon">/<link rel="apple-touch-icon">
  // set in PAGE_HTML's <head> — no client-side favicon logic needed here.

  var online = true;
  var journalOpen = false;
  var draftText = "";
  var editingEntry = null;
  var editDraftText = "";
  var commentDrafts = {};

  function isComplete(key) {
    var a = state.answers[key];
    return !!(a && a.mark && a.mark.text && a.nikita && a.nikita.text);
  }
  function totalCompleteDays() {
    return Object.keys(state.answers).filter(isComplete).length;
  }
  function daysCompleteSince(startKey) {
    return Object.keys(state.answers).filter(function (k) { return k >= startKey && isComplete(k); }).length;
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

  function translateBlock(text, target, alt) {
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
      wrap.appendChild(document.createTextNode(val));
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
  function uiTranslateBlock(text) {
    return translateBlock(text, otherUiLang(), "en");
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
    if (state.puzzleSolved) return PUZZLE_TOTAL;
    if (!state.puzzleRoundStartDate) return 0;
    var unlocked = daysCompleteSince(state.puzzleRoundStartDate) + (state.puzzleBonusCredits || 0);
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
    wrap.appendChild(h("p", { text: t("Load up to 10 photos at once — each needs a short answer for your partner to guess. They'll appear one at a time as you both keep answering.") }));

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
        row.appendChild(h("span", { class: "puzzle-batch-name", text: item.file.name }));
        var ans = document.createElement("input");
        ans.type = "text"; ans.maxLength = 120; ans.placeholder = t("Answer for this one…");
        ans.value = item.answer;
        ans.addEventListener("input", function () { item.answer = ans.value; refreshSubmit(); });
        row.appendChild(ans);
        var rm = h("button", { class: "puzzle-batch-remove", text: "✕" });
        rm.addEventListener("click", function () { puzzleBatchItems.splice(i, 1); renderList(); refreshSubmit(); });
        row.appendChild(rm);
        list.appendChild(row);
      });
    }

    fileInput.addEventListener("change", function () {
      var room = 10 - puzzleBatchItems.length;
      var files = Array.prototype.slice.call(fileInput.files || [], 0, room);
      files.forEach(function (f) {
        var item = { file: f, answer: "" };
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
          readAndCompressImage(it.file, 900, 0.82, function (dataUrl) { resolve({ dataUrl: dataUrl, answer: it.answer.trim() }); });
        });
      })).then(function (items) {
        return fetch(RP + "/api/puzzle-batch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ who: viewerKey, items: items })
        });
      }).then(function (res) { return res.json(); })
        .then(function (next) {
          state = next; online = true;
          var count = (next.puzzleQueue ? next.puzzleQueue.length : 0) + (next.puzzleCurrentId ? 1 : 0);
          puzzleBatchItems = [];
          var loadedTemplate = count === 1 ? "Loaded {count} photo — first one's up now." : "Loaded {count} photos — first one's up now.";
          setActiveTab("puzzle", tTemplate(loadedTemplate, { count: count }));
        })
        .catch(function () { online = false; renderApp(); });
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
      wrap.appendChild(h("p", { class: "puzzle-guess-note", text: tTemplate("You set this one — waiting for {name} to guess.", { name: otherName }) }));
      return wrap;
    }
    if (guessedToday) {
      var msg = state.puzzleLastGuessCorrect
        ? t("🎉 You got it!")
        : tTemplate("Today's guess: “{guess}” — not quite. Try again tomorrow.", { guess: state.puzzleLastGuessText });
      wrap.appendChild(h("p", { class: "puzzle-guess-note", text: msg }));
      if (!state.puzzleLastGuessCorrect && state.puzzleLastGuessText && state.puzzleLastGuessBy) {
        wrap.appendChild(translateBlock(state.puzzleLastGuessText, langCodeFor(otherKeyOf(state.puzzleLastGuessBy)), langCodeFor(state.puzzleLastGuessBy)));
      }
      return wrap;
    }
    var input = document.createElement("input");
    input.type = "text"; input.maxLength = 120; input.placeholder = t("Guess where (or what) this is…");
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
      h("p", { class: "puzzle-explain", text: t("Once you both answer today's question, a puzzle piece unlocks. Whoever didn't load the picture gets one guess a day at where it was taken.") })
    ]);
    if (!inBatch) {
      card.appendChild(puzzleBatchForm());
      if (state.puzzleQueueBy) {
        card.appendChild(h("p", { class: "puzzle-guess-note", text: tTemplate("Last loaded by {name} ({total} pictures).", { name: personName(state.puzzleQueueBy), total: state.puzzleQueueTotal || 0 }) }));
      }
    } else {
      card.appendChild(puzzleGrid(puzzleImgSrc()));
      if (state.puzzleSolved) {
        card.appendChild(h("p", { class: "puzzle-done-note", text: tTemplate("Solved — it was “{answer}.” ✧", { answer: state.puzzleAnswer }) }));
        if (state.puzzleAnswer && state.puzzleSetBy) {
          card.appendChild(translateBlock(state.puzzleAnswer, langCodeFor(otherKeyOf(state.puzzleSetBy)), langCodeFor(state.puzzleSetBy)));
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
      cDiv.appendChild(translateBlock(c.text, langCodeFor(otherKeyOf(c.who)), langCodeFor(c.who)));
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
    var puzzleBtn = h("button", { class: "tab-btn" + (activeTab === "puzzle" ? " active" : "") }, [
      document.createTextNode(t("Puzzle") + " "),
      h("span", { class: "tab-badge", text: unlocked + "/" + PUZZLE_TOTAL })
    ]);
    puzzleBtn.addEventListener("click", function () { setActiveTab("puzzle"); });
    return h("div", { class: "tab-bar" }, [todayBtn, puzzleBtn]);
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
  var registerDraft = { name: "", email: "", location: "", language: "" };
  var acceptDraft = { name: "", location: "", language: "" };
  var inviteEmailDraft = "";
  var regBusy = false, regError = "", showRegisterForm = false, showInviteForm = false;

  function textField(value, placeholder, onInput) {
    var i = document.createElement("input");
    i.type = "text"; i.placeholder = t(placeholder); i.value = value;
    i.addEventListener("input", function () { onInput(i.value); });
    return i;
  }

  function acceptInviteForm() {
    var card = h("div", { class: "card" }, [
      h("div", { class: "eyebrow" }, [h("span", { text: t("You're invited") })]),
      h("p", { class: "question", text: t("Finish setting up your Same Sky.") })
    ]);
    var form = h("div", { class: "puzzle-setup" });
    form.appendChild(textField(acceptDraft.name, "Preferred name", function (v) { acceptDraft.name = v; }));
    form.appendChild(textField(acceptDraft.location, "Where you're based", function (v) { acceptDraft.location = v; }));
    form.appendChild(textField(acceptDraft.language, "Preferred language", function (v) { acceptDraft.language = v; }));
    if (regError) form.appendChild(h("p", { class: "puzzle-guess-note", text: t(regError) }));
    var btn = h("button", { class: "puzzle-upload-btn", text: regBusy ? t("Joining…") : t("Join Same Sky") });
    btn.disabled = regBusy;
    btn.addEventListener("click", function () {
      if (!acceptDraft.name.trim()) { regError = "Enter your name."; renderApp(); return; }
      regBusy = true; regError = ""; renderApp();
      fetch(RP + "/api/accept-invite", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: inviteParams.token, name: acceptDraft.name.trim(), location: acceptDraft.location.trim(), language: acceptDraft.language.trim() })
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
          regBusy = false;
          if (!res.ok) { regError = t("That invite link isn't valid."); renderApp(); return; }
          state = res.data;
          viewerKey = res.data.who;
          try { localStorage.setItem(VIEWER_LS_KEY, viewerKey); } catch (e) {}
          try {
            var u = new URL(location.href);
            u.searchParams.delete("invite"); u.searchParams.delete("token");
            history.replaceState({}, "", u.toString());
          } catch (e) {}
          inviteParams = null;
          online = true;
          renderApp();
        })
        .catch(function () { regBusy = false; regError = t("Something went wrong — try again."); renderApp(); });
    });
    form.appendChild(btn);
    card.appendChild(form);
    return card;
  }

  function submitRegister() {
    var name = registerDraft.name.trim(), email = registerDraft.email.trim();
    if (!name || !email) { regError = t("Name and email required."); renderApp(); return; }
    regBusy = true; regError = ""; renderApp();
    fetch(RP + "/api/register", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ who: viewerKey, name: name, email: email, location: registerDraft.location.trim(), language: registerDraft.language.trim() })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        regBusy = false;
        if (!res.ok) { regError = t("Couldn't register — try again."); renderApp(); return; }
        state = res.data;
        showRegisterForm = false;
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
      var again = h("button", { class: "switch-link", text: t("Resend confirmation") });
      again.addEventListener("click", function () { showRegisterForm = true; renderApp(); });
      wait.appendChild(h("div", { class: "switch-row" }, [again]));
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
    form.appendChild(textField(registerDraft.name, "Preferred name", function (v) { registerDraft.name = v; }));
    form.appendChild(textField(registerDraft.email, "Your email", function (v) { registerDraft.email = v; }));
    form.appendChild(textField(registerDraft.location, "Where you're based", function (v) { registerDraft.location = v; }));
    form.appendChild(textField(registerDraft.language, "Preferred language", function (v) { registerDraft.language = v; }));
    if (regError) form.appendChild(h("p", { class: "puzzle-guess-note", text: t(regError) }));
    var btn = h("button", { class: "puzzle-upload-btn", text: regBusy ? t("Sending…") : t("Register") });
    btn.disabled = regBusy;
    btn.addEventListener("click", submitRegister);
    form.appendChild(btn);
    card.appendChild(form);
    if (!soloRegistration) {
      var sw = h("button", { class: "switch-link", text: tTemplate("Not {name}? Switch", { name: personName(viewerKey) }) });
      sw.addEventListener("click", function () { viewerKey = null; try { localStorage.removeItem(VIEWER_LS_KEY); } catch (e) {} renderApp(); });
      card.appendChild(h("div", { class: "switch-row" }, [sw]));
    }
    return card;
  }

  var lastInviteUrl = "";
  function submitInvite() {
    var email = inviteEmailDraft.trim();
    if (!email) { regError = t("Enter an email first."); renderApp(); return; }
    regBusy = true; regError = ""; renderApp();
    fetch(RP + "/api/invite", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ who: viewerKey, email: email })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        regBusy = false;
        if (!res.ok) { regError = t("Couldn't send invite — try again."); renderApp(); return; }
        lastInviteUrl = res.data._inviteUrl || "";
        state = res.data;
        showInviteForm = false;
        regError = res.data._emailSent === false ? t("Saved, but the email failed to send — try again.") : "";
        renderApp();
      })
      .catch(function () { regBusy = false; regError = t("Something went wrong — try again."); renderApp(); });
  }

  function copyLinkButton(url) {
    var btn = h("button", { class: "switch-link", text: t("Copy invite link") });
    btn.addEventListener("click", function () {
      var done = function () { btn.textContent = t("Copied!"); setTimeout(function () { btn.textContent = t("Copy invite link"); }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, done);
      else { window.prompt(t("Copy this link:"), url); done(); }
    });
    return btn;
  }

  function inviteFlow(otherKey) {
    var pending = state.pendingInvite && state.pendingInvite[otherKey];
    var otherLabel = inviteeLabel(otherKey);
    var registeredAlready = !!(state.people && state.people[otherKey] && state.people[otherKey].name);
    var card = h("div", { class: "card" }, [h("div", { class: "eyebrow" }, [h("span", { text: tTemplate("Invite {name}", { name: otherLabel }) })])]);
    if (!registeredAlready) {
      card.appendChild(h("p", { class: "puzzle-guess-note", text: t("(complete their registration to send invite)") }));
    }
    if (pending && !showInviteForm) {
      card.appendChild(h("p", { class: "question", text: tTemplate("Invite sent — waiting for {name} to accept.", { name: otherLabel }) }));
      card.appendChild(h("p", { class: "puzzle-guess-note", text: tTemplate("Ask {name} to check their spam folder if it doesn't show up soon.", { name: otherLabel }) }));
      if (lastInviteUrl) card.appendChild(h("p", { class: "puzzle-guess-note", text: t("Email may not land — safer to send this link yourself.") }));
      if (regError) card.appendChild(h("p", { class: "puzzle-guess-note", text: t(regError) }));
      var again = h("button", { class: "switch-link", text: t("Resend invite") });
      again.addEventListener("click", function () { showInviteForm = true; renderApp(); });
      var row = [again];
      if (lastInviteUrl) row.push(copyLinkButton(lastInviteUrl));
      card.appendChild(h("div", { class: "switch-row" }, row));
    } else {
      card.appendChild(h("p", { class: "question", text: tTemplate("{name} hasn't joined yet — send an invite.", { name: otherLabel }) }));
      var form = h("div", { class: "puzzle-setup" });
      form.appendChild(textField(inviteEmailDraft, otherLabel + "'s email", function (v) { inviteEmailDraft = v; }));
      if (regError) form.appendChild(h("p", { class: "puzzle-guess-note", text: t(regError) }));
      var btn = h("button", { class: "puzzle-upload-btn", text: regBusy ? t("Sending…") : t("Send invite") });
      btn.disabled = regBusy;
      btn.addEventListener("click", submitInvite);
      form.appendChild(btn);
      card.appendChild(form);
    }
    return card;
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

    var mine = state.people && state.people[viewerKey];
    if (!mine || !mine.confirmed) { app.appendChild(registrationFlow()); return; }

    var otherKey = viewerKey === "mark" ? "nikita" : "mark";
    var other = state.people && state.people[otherKey];
    if (!other || !other.confirmed) { app.appendChild(inviteFlow(otherKey)); return; }

    app.appendChild(header());
    app.appendChild(statusRow());
    app.appendChild(h("p", { class: "cdt", id: "cd-note", text: countdownText() }));
    app.appendChild(tabBar());
    if (activeTab === "puzzle") {
      var flash = puzzleFlashBanner();
      if (flash) app.appendChild(flash);
      app.appendChild(puzzleSection());
    } else {
      app.appendChild(questionCard());
      app.appendChild(streakCard());
      app.appendChild(journalSection());
    }
    app.appendChild(switchRow());
    if (!online) app.appendChild(h("p", { class: "offline-note", text: t("Having trouble syncing — check your connection.") }));
  }

  function pickerOverlay() {
    return h("div", { class: "picker-overlay" }, [
      h("div", { class: "picker-card" }, [
        h("h2", { text: "Who's here?" }),
        h("p", { text: "So Same Sky knows whose answer is whose." }),
        h("div", { class: "picker-choices" }, [
          h("button", { class: "picker-btn", onclick: function () { chooseViewer("mark"); } }, [document.createTextNode("I'm " + personName("mark"))]),
          h("button", { class: "picker-btn", onclick: function () { chooseViewer("nikita"); } }, [document.createTextNode("I'm " + personName("nikita"))])
        ])
      ])
    ]);
  }
  function chooseViewer(key) {
    viewerKey = key;
    try { localStorage.setItem(VIEWER_LS_KEY, key); } catch (e) {}
    renderApp();
  }

  function header() {
    var wordmark = h("div", { class: "wordmark", html: LOGO_MARK_SVG + "<span>Same Sky</span>" });
    var markClock = h("div", { class: "clock-block" }, [h("div", { class: "clock-city", text: personLocation("mark") }), h("div", { class: "clock-time", text: clockFor(PEOPLE.mark.tz) })]);
    var nikitaClock = h("div", { class: "clock-block" }, [h("div", { class: "clock-city", text: personLocation("nikita") }), h("div", { class: "clock-time", text: clockFor(PEOPLE.nikita.tz) })]);
    var divider = h("div", { class: "clock-divider", html: PLANE_SVG });
    var clocks = h("div", { class: "clocks" }, [markClock, divider, nikitaClock]);
    return h("div", {}, [wordmark, clocks]);
  }

  function statusRow() {
    var row = h("div", { class: "status-row" });
    ["mark", "nikita"].forEach(function (key) {
      var person = PEOPLE[key];
      var current = (state.status[key] && state.status[key].text) || "";
      var chip = h("div", { class: "status-chip" }, [h("span", { class: "status-dot", style: "background:" + person.color })]);
      var input = document.createElement("input");
      input.type = "text"; input.maxLength = 60; input.placeholder = tTemplate("{name}'s world right now…", { name: personName(key) });
      input.value = current;
      input.disabled = viewerKey !== key;
      input.addEventListener("change", function () {
        api("/api/status", { who: key, text: input.value }).catch(function () { online = false; renderApp(); });
      });
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
      uiTranslateBlock(q)
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
          bubble.appendChild(translateBlock(entry[key].text, langCodeFor(otherKeyOf(key)), langCodeFor(key)));
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
        mineWrap.appendChild(translateBlock(mine, langCodeFor(otherKeyOf(viewerKey)), langCodeFor(viewerKey)));
        var editBtn2 = h("button", { class: "edit-btn", text: t("Edit your answer") });
        editBtn2.addEventListener("click", function () { startEdit(today); });
        mineWrap.appendChild(editBtn2);
        card.appendChild(mineWrap);
      }
      card.appendChild(h("div", { class: "waiting", html: PLANE_SVG + '<span>' + tTemplate("Sent — waiting for {name} to answer too.", { name: personName(otherKeyOf(viewerKey)) }) + '</span>' }));
    } else {
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
            uiTranslateBlock(questionForKey(key))
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
            entryDiv.appendChild(translateBlock(entry[pKey].text, langCodeFor(otherKeyOf(pKey)), langCodeFor(pKey)));
          });
          entryDiv.appendChild(commentsBlock(key));
          list.appendChild(entryDiv);
        });
      }
      wrap.appendChild(list);
    }
    return wrap;
  }

  function switchRow() {
    var row = h("div", { class: "switch-row" });
    var link = h("button", { class: "switch-link", text: tTemplate("Not {name}? Switch", { name: personName(viewerKey) }) });
    link.addEventListener("click", function () {
      viewerKey = null;
      try { localStorage.removeItem(VIEWER_LS_KEY); } catch (e) {}
      renderApp();
    });
    row.appendChild(link);
    var newRoomLink = h("a", { class: "switch-link", href: "/new", text: t("Start Same Sky for another couple") });
    row.appendChild(newRoomLink);
    return row;
  }

  function tickClocks() {
    document.querySelectorAll(".clock-time").forEach(function (el, i) {
      el.textContent = i === 0 ? clockFor(PEOPLE.mark.tz) : clockFor(PEOPLE.nikita.tz);
    });
    var cd = document.getElementById("cd-note");
    if (cd) cd.textContent = countdownText();
  }

  async function initialLoad() {
    try {
      var res = await fetch(RP + "/api/state");
      state = await res.json();
      online = true;
    } catch (e) { online = false; }
    renderApp();
  }

  async function poll() {
    try {
      var res = await fetch(RP + "/api/state");
      var next = await res.json();
      state = next;
      online = true;
      var active = document.activeElement;
      var busy = active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT");
      if (!busy) renderApp();
    } catch (e) {
      online = false;
    }
  }

  initialLoad();
  setInterval(tickClocks, 30000);
  setInterval(poll, POLL_MS);
})();
</script>
</body>
</html>`;

export function buildPageHtml(roomId: string, iconV: string): string {
  return RAW.replace(/__ICON_V__/g, iconV).replace(/__ROOM__/g, roomId);
}

export function buildNewRoomPage(): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Start Same Sky</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,500;0,600;1,500;1,600&family=Karla:wght@400;500;700&display=swap">
<style>
  :root { color-scheme: light; --bg:#FAF6EE; --surface:#FFFFFF; --ink:#2A2333; --ink-soft:#786C82; --line:#E8DFCB; --accent:#C6912E; }
  @media (prefers-color-scheme: dark) {
    :root { color-scheme: dark; --bg:#161320; --surface:#201B2E; --ink:#F4EFE7; --ink-soft:#B6AAC4; --line:#352F49; --accent:#E7BA5E; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font-family:'Karla',sans-serif; display:flex; justify-content:center; padding:60px 16px; }
  .card { background:var(--surface); border:1px solid var(--line); border-radius:18px; padding:32px 26px; max-width:420px; width:100%; text-align:center; }
  h1 { font-family:'Fraunces',Georgia,serif; font-style:italic; font-weight:600; font-size:1.6rem; margin:0 0 10px; }
  p { color:var(--ink-soft); font-size:0.95rem; line-height:1.5; margin:0 0 24px; }
  button { background:var(--accent); color:#241C0A; border:none; border-radius:999px; padding:12px 26px; font:inherit; font-weight:700; font-size:0.95rem; cursor:pointer; }
  button:disabled { opacity:0.6; }
  .note { margin-top:16px; font-size:0.8rem; }
</style>
</head>
<body>
<div class="card">
  <h1>Start your own Same Sky</h1>
  <p>Same Sky is a small daily ritual for two people. Every day you both answer one shared question, and once you've each answered, a small piece of a hidden photo unlocks — answer enough days in a row and the whole picture comes together as a puzzle. It's built for couples, friends, or family who live apart and want one small thing to check in on together each day. If you each speak a different language, every screen shows both automatically, side by side.</p>
  <p>Tapping the button below creates a brand-new, completely private room just for the two of you — separate from anyone else using the app. You'll get a link to share with your person; when you each open it, you'll register your own name, language, and location, then you're set.</p>
  <button id="go">Create my room</button>
  <p class="note" id="msg"></p>
</div>
<script>
document.getElementById("go").addEventListener("click", function () {
  var btn = document.getElementById("go");
  btn.disabled = true;
  btn.textContent = "Creating…";
  fetch("/api/create-room", { method: "POST" })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && data.roomId) { location.href = "/r/" + data.roomId; return; }
      throw new Error("no room id");
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
