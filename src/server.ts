// Same Sky — Bun HTTP server. Room-scoped: "/" is the original room (same
// as the single-file version always was), "/r/<roomId>" is any other room,
// and "/new" lets anyone spin up a fresh private room for themselves.

import { isPerson, type PersonKey } from "./types";
import {
  loadState,
  saveState,
  createRoom,
  puzzleImageKey,
  localPuzzlePath,
  useS3,
  s3,
  ensurePuzzleMigrated,
} from "./storage";
import { resolveTranslation } from "./translate";
import { resolveTimezoneFromLocation, resolveLocationInfo } from "./geo";
import { json, isValidEmail, readJson, sendEmail, todayKeyPT, guessMatches, advanceQueue, forClient } from "./util";
import { buildPageHtml, buildNewRoomPage } from "./page";
import { rateLimit, clientIp } from "./rate-limit";

const PORT = Number(Bun.env.PORT) || 3000;

function parseRoom(pathname: string): { roomId: string; restPath: string } {
  const m = pathname.match(/^\/r\/([a-zA-Z0-9]{1,40})(\/.*)?$/);
  if (m) return { roomId: m[1], restPath: m[2] && m[2].length > 0 ? m[2] : "/" };
  return { roomId: "", restPath: pathname };
}

Bun.serve({
  port: PORT,
  idleTimeout: 60,
  async fetch(req, server) {
    const url = new URL(req.url);
    const { roomId, restPath } = parseRoom(url.pathname);
    const roomPrefix = roomId ? "/r/" + roomId : "";
    const HOUR = 60 * 60 * 1000;

    if (req.method === "POST" && url.pathname === "/api/create-room") {
      // Caps how many fresh rooms one visitor can spin up — a real couple
      // needs one, ever.
      if (!rateLimit("create-room:" + clientIp(req, server), 5, HOUR)) {
        return json({ error: "rate_limited" }, { status: 429 });
      }
      const id = await createRoom();
      return json({ roomId: id });
    }

    if (req.method === "GET" && url.pathname === "/new") {
      return new Response(buildNewRoomPage(), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }

    if (req.method === "GET" && restPath === "/") {
      // Date-tag icon URLs so iOS treats each day's icon as a fresh resource.
      const html = buildPageHtml(roomId, todayKeyPT());
      return new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, must-revalidate" },
      });
    }

    if (req.method === "GET" && restPath === "/api/state") {
      const state = await loadState(roomId);
      return json(forClient(state));
    }

    if (req.method === "POST" && restPath === "/api/answer") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const { date, who, text } = body || {};
      if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !isPerson(who) || typeof text !== "string" || !text.trim()) {
        return json({ error: "invalid" }, { status: 400 });
      }
      const trimmed = text.trim().slice(0, 4000);
      const state = await saveState(roomId, (s) => {
        if (!s.answers[date]) s.answers[date] = {};
        const prev = s.answers[date][who];
        s.answers[date][who] = {
          text: trimmed,
          at: prev?.at || new Date().toISOString(),
          ...(prev ? { editedAt: new Date().toISOString() } : {}),
        };
      });
      return json(forClient(state));
    }

    if (req.method === "POST" && restPath === "/api/comment") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const { date, who, text } = body || {};
      if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !isPerson(who) || typeof text !== "string" || !text.trim()) {
        return json({ error: "invalid" }, { status: 400 });
      }
      const trimmed = text.trim().slice(0, 300);
      const state = await saveState(roomId, (s) => {
        if (!s.comments[date]) s.comments[date] = [];
        s.comments[date].push({ who, text: trimmed, at: new Date().toISOString() });
      });
      return json(forClient(state));
    }

    if (req.method === "GET" && restPath === "/api/geo") {
      const location = url.searchParams.get("location") || "";
      const info = await resolveLocationInfo(location);
      return json(info);
    }

    if (req.method === "POST" && restPath === "/api/status") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const { who, text } = body || {};
      if (!isPerson(who) || typeof text !== "string") {
        return json({ error: "invalid" }, { status: 400 });
      }
      const trimmed = text.trim().slice(0, 60);
      const state = await saveState(roomId, (s) => {
        s.status[who] = { text: trimmed, at: new Date().toISOString() };
      });
      return json(forClient(state));
    }

    if (req.method === "POST" && restPath === "/api/register") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const who = body && body.who;
      const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
      const email = typeof body?.email === "string" ? body.email.trim().slice(0, 200) : "";
      const location = typeof body?.location === "string" ? body.location.trim().slice(0, 80) : "";
      const language = typeof body?.language === "string" ? body.language.trim().slice(0, 40) : "";
      const browserTz = typeof body?.tz === "string" ? body.tz.trim().slice(0, 60) : "";
      if (!isPerson(who) || !name || !isValidEmail(email)) {
        return json({ error: "invalid" }, { status: 400 });
      }
      // Two limits: how many confirm emails this visitor can trigger, and
      // how many any single inbox can be sent regardless of who's asking —
      // the second one is what actually stops someone using this as a way
      // to spam a stranger's email address.
      if (!rateLimit("register-ip:" + clientIp(req, server), 10, HOUR) || !rateLimit("register-email:" + email.toLowerCase(), 3, HOUR)) {
        return json({ error: "rate_limited" }, { status: 429 });
      }
      const cur = await loadState(roomId);
      if (cur.people && cur.people[who] && cur.people[who]!.confirmed) {
        return json({ error: "already_registered" }, { status: 409 });
      }
      // The typed location is the source of truth for timezone when it
      // resolves to a real place; the registering device's own timezone is
      // only a fallback (covers an empty/unrecognized location, or the
      // geocoding lookup being unreachable).
      const resolvedTz = await resolveTimezoneFromLocation(location);
      const tz = resolvedTz || browserTz;
      const token = crypto.randomUUID();
      const state = await saveState(roomId, (s) => {
        if (!s.people) s.people = {};
        s.people[who] = { name, location, language, tz: tz || undefined, confirmed: false };
        if (!s.pendingConfirm) s.pendingConfirm = {};
        s.pendingConfirm[who] = { token, at: new Date().toISOString() };
      });
      const confirmUrl = url.origin + roomPrefix + "/api/confirm?who=" + who + "&token=" + token;
      const r = await sendEmail(
        email,
        "Confirm your Same Sky account",
        "<p>Hi " + name + ",</p>" +
          "<p>You're almost set up:</p>" +
          "<ol><li><a href=\"" + confirmUrl + "\">Confirm your email</a></li>" +
          "<li>Go to the Same Sky link to complete your significant other's information</li></ol>" +
          "<p style=\"color:#888;font-size:0.9em\">Don't see this arriving right away next time? Check your spam folder.</p>"
      );
      return json({ ...forClient(state), _emailSent: r.ok, _emailError: r.error });
    }

    if (req.method === "GET" && restPath === "/api/confirm") {
      const who = url.searchParams.get("who") || "";
      const token = url.searchParams.get("token") || "";
      let ok = false;
      if (isPerson(who)) {
        const cur = await loadState(roomId);
        if (cur.pendingConfirm && cur.pendingConfirm[who] && cur.pendingConfirm[who]!.token === token) {
          await saveState(roomId, (s) => {
            if (s.people && s.people[who]) s.people[who]!.confirmed = true;
            if (s.pendingConfirm) delete s.pendingConfirm[who];
          });
          ok = true;
        }
      }
      // ?viewer=<who> lets the client auto-select this person as "you" on
      // load — without it, clicking the confirm link in a browser context
      // that doesn't share localStorage with wherever they registered (e.g.
      // an email app's in-app browser) drops them on the "who's here?"
      // picker instead of straight into their next step.
      const backUrl = url.origin + roomPrefix + "/" + (ok ? "?viewer=" + who : "");
      const html = ok
        ? "<!doctype html><html><head><meta http-equiv=\"refresh\" content=\"1;url=" + backUrl + "\"></head><body style=\"font-family:sans-serif;text-align:center;padding:60px 20px\"><h1>Confirmed 🎉</h1><p><a href=\"" + backUrl + "\">Continue to Same Sky</a></p></body></html>"
        : "<!doctype html><body style=\"font-family:sans-serif;text-align:center;padding:60px 20px\"><h1>Link expired</h1><p>Request a new one from the app.</p></body>";
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    if (req.method === "POST" && restPath === "/api/invite") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const who = body && body.who;
      const email = typeof body?.email === "string" ? body.email.trim().slice(0, 200) : "";
      if (!isPerson(who) || !isValidEmail(email)) {
        return json({ error: "invalid" }, { status: 400 });
      }
      if (!rateLimit("invite-ip:" + clientIp(req, server), 10, HOUR) || !rateLimit("invite-email:" + email.toLowerCase(), 3, HOUR)) {
        return json({ error: "rate_limited" }, { status: 429 });
      }
      const cur = await loadState(roomId);
      if (!cur.people || !cur.people[who] || !cur.people[who]!.confirmed) {
        return json({ error: "not_confirmed" }, { status: 403 });
      }
      const other: PersonKey = who === "mark" ? "nikita" : "mark";
      if (cur.people[other] && cur.people[other]!.confirmed) {
        return json({ error: "already_registered" }, { status: 409 });
      }
      const token = crypto.randomUUID();
      const state = await saveState(roomId, (s) => {
        if (!s.pendingInvite) s.pendingInvite = {};
        s.pendingInvite[other] = { token, at: new Date().toISOString() };
      });
      const inviteUrl = url.origin + roomPrefix + "/?invite=" + other + "&token=" + token;
      const inviterName = cur.people[who]!.name;
      const r = await sendEmail(
        email,
        inviterName + " invited you to Same Sky",
        "<p>" + inviterName + " invited you to Same Sky.</p>" +
          "<ol><li><a href=\"" + inviteUrl + "\">Confirm your email</a></li>" +
          "<li>Access Same Sky to begin your togetherness bonding</li></ol>" +
          "<p style=\"color:#888;font-size:0.9em\">Don't see this arriving right away next time? Check your spam folder.</p>"
      );
      return json({ ...forClient(state), _emailSent: r.ok, _emailError: r.error, _inviteUrl: inviteUrl });
    }

    if (req.method === "POST" && restPath === "/api/accept-invite") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const token = typeof body?.token === "string" ? body.token : "";
      const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
      const location = typeof body?.location === "string" ? body.location.trim().slice(0, 80) : "";
      const language = typeof body?.language === "string" ? body.language.trim().slice(0, 40) : "";
      const browserTz = typeof body?.tz === "string" ? body.tz.trim().slice(0, 60) : "";
      if (!token || !name) return json({ error: "invalid" }, { status: 400 });
      const cur = await loadState(roomId);
      let who: PersonKey | null = null;
      (["mark", "nikita"] as PersonKey[]).forEach((k) => {
        if (cur.pendingInvite && cur.pendingInvite[k] && cur.pendingInvite[k]!.token === token) who = k;
      });
      if (!who) return json({ error: "invalid_token" }, { status: 400 });
      const resolvedTz = await resolveTimezoneFromLocation(location);
      const tz = resolvedTz || browserTz;
      const state = await saveState(roomId, (s) => {
        if (!s.people) s.people = {};
        s.people[who!] = { name, location, language, tz: tz || undefined, confirmed: true };
        if (s.pendingInvite) delete s.pendingInvite[who!];
      });
      return json({ who, ...forClient(state) });
    }

    if (req.method === "POST" && restPath === "/api/puzzle-batch") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const who = body && body.who;
      const items = body && body.items;
      if (!isPerson(who) || !Array.isArray(items) || items.length < 1 || items.length > 10) {
        return json({ error: "invalid" }, { status: 400 });
      }
      const parsed: { id: string; answer: string; question: string; bytes: Uint8Array }[] = [];
      for (const item of items) {
        const dataUrl = item && item.dataUrl;
        const answer = item && item.answer;
        const question = item && item.question;
        const match = typeof dataUrl === "string" ? dataUrl.match(/^data:image\/jpeg;base64,(.+)$/) : null;
        const trimmedAnswer = typeof answer === "string" ? answer.trim().slice(0, 200) : "";
        const trimmedQuestion = typeof question === "string" ? question.trim().slice(0, 200) : "";
        if (!match || !trimmedAnswer) return json({ error: "invalid" }, { status: 400 });
        let bytes: Uint8Array;
        try {
          bytes = Buffer.from(match[1], "base64");
        } catch {
          return json({ error: "invalid" }, { status: 400 });
        }
        if (bytes.length > 6 * 1024 * 1024) return json({ error: "too_large" }, { status: 400 });
        parsed.push({ id: crypto.randomUUID(), answer: trimmedAnswer, question: trimmedQuestion, bytes });
      }
      const current = await loadState(roomId);
      if (current.puzzleCurrentId || (current.puzzleQueue && current.puzzleQueue.length > 0)) {
        return json({ error: "in_progress" }, { status: 409 });
      }
      for (const p of parsed) {
        if (useS3 && s3) {
          await s3.file(puzzleImageKey(roomId, p.id)).write(p.bytes, { type: "image/jpeg" });
        } else {
          await Bun.write(localPuzzlePath(roomId, p.id), p.bytes);
        }
      }
      const state = await saveState(roomId, (s) => {
        const first = parsed[0];
        const rest = parsed.slice(1).map((p) => ({ id: p.id, answer: p.answer, question: p.question }));
        s.puzzleCurrentId = first.id;
        s.puzzleAnswer = first.answer;
        if (first.question) s.puzzleQuestion = first.question; else delete s.puzzleQuestion;
        s.puzzleSetBy = who;
        s.puzzleRoundStartDate = todayKeyPT();
        s.puzzleBonusCredits = 0;
        delete s.puzzleRoundBase;
        s.puzzleSolved = false;
        s.puzzlePendingBonus = false;
        s.puzzleQueue = rest;
        s.puzzleQueueBy = who;
        s.puzzleQueueAt = new Date().toISOString();
        s.puzzleQueueTotal = parsed.length;
        delete s.puzzleLastGuessDate;
        delete s.puzzleLastGuessBy;
        delete s.puzzleLastGuessText;
        delete s.puzzleLastGuessCorrect;
      });
      return json(forClient(state));
    }

    if (req.method === "POST" && restPath === "/api/puzzle-advance") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const who = body && body.who;
      if (!isPerson(who)) return json({ error: "invalid" }, { status: 400 });
      const state = await saveState(roomId, (s) => {
        advanceQueue(s);
      });
      return json(forClient(state));
    }

    if (req.method === "POST" && restPath === "/api/puzzle-guess") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const { who, text } = body || {};
      if (!isPerson(who) || typeof text !== "string" || !text.trim()) {
        return json({ error: "invalid" }, { status: 400 });
      }
      const trimmed = text.trim().slice(0, 120);
      const today = todayKeyPT();
      let rejected = false;
      const state = await saveState(roomId, (s) => {
        if (!s.puzzleAnswer || s.puzzleSolved) return;
        if (s.puzzleSetBy && who === s.puzzleSetBy) { rejected = true; return; }
        if (s.puzzleLastGuessDate === today) return;
        const correct = guessMatches(trimmed, s.puzzleAnswer);
        s.puzzleLastGuessDate = today;
        s.puzzleLastGuessBy = who;
        s.puzzleLastGuessText = trimmed;
        s.puzzleLastGuessCorrect = correct;
        if (correct) {
          s.puzzleSolved = true;
          s.puzzleSolvedCount = (s.puzzleSolvedCount || 0) + 1;
          s.puzzlePendingBonus = true;
        }
      });
      if (rejected) return json({ error: "setter_cannot_guess" }, { status: 403 });
      return json(forClient(state));
    }

    if (req.method === "GET" && restPath === "/api/puzzle-image") {
      const id = url.searchParams.get("id") || "";
      if (!/^[a-zA-Z0-9-]+$/.test(id)) return new Response("Not found", { status: 404 });
      try {
        if (useS3 && s3) {
          const file = s3.file(puzzleImageKey(roomId, id));
          if (!(await file.exists())) return new Response("Not found", { status: 404 });
          const bytes = await file.arrayBuffer();
          return new Response(bytes, {
            headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" },
          });
        } else {
          const f = Bun.file(localPuzzlePath(roomId, id));
          if (!(await f.exists())) return new Response("Not found", { status: 404 });
          const bytes = await f.arrayBuffer();
          return new Response(bytes, {
            headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" },
          });
        }
      } catch {
        return new Response("Not found", { status: 404 });
      }
    }

    if (req.method === "GET" && restPath === "/api/translate") {
      const text = (url.searchParams.get("text") || "").slice(0, 4000);
      const langCodeRe = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;
      const targetRaw = url.searchParams.get("target") || "en";
      const target = langCodeRe.test(targetRaw) ? targetRaw : "en";
      const altRaw = url.searchParams.get("alt") || "";
      const alt = langCodeRe.test(altRaw) ? altRaw : "";
      if (!text.trim()) return json({ translated: "" });
      const { translated, via, eff } = await resolveTranslation(text, target, alt);
      console.log("[translate] via=" + via + " eff=" + eff + " ok=" + !!translated);
      return json({ translated });
    }

    if (req.method === "GET" && restPath === "/api/geocode") {
      const lat = url.searchParams.get("lat");
      const lon = url.searchParams.get("lon");
      if (!lat || !lon) return json({ place: "" });
      try {
        const gUrl =
          "https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=" +
          encodeURIComponent(lat) +
          "&lon=" +
          encodeURIComponent(lon) +
          "&zoom=14&addressdetails=1";
        const res = await fetch(gUrl, { headers: { "User-Agent": "SameSkyApp/1.0 (personal use)" } });
        if (!res.ok) return json({ place: "" });
        const data: any = await res.json();
        const addr = data.address || {};
        const place = addr.city || addr.town || addr.village || addr.suburb || addr.county || "";
        const region = addr.state || addr.country || "";
        const label = place && region ? place + ", " + region : place || "";
        return json({ place: label });
      } catch {
        return json({ place: "" });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/icon-upload") {
      const body = await readJson(req);
      const key = body && body.key;
      const dataUrl = body && body.dataUrl;
      if ((key !== "favicon" && key !== "touch") || typeof dataUrl !== "string") return json({ error: "invalid" }, { status: 400 });
      const match = dataUrl.match(/^data:image\/png;base64,(.+)$/);
      if (!match) return json({ error: "invalid" }, { status: 400 });
      let bytes: Uint8Array;
      try {
        bytes = Buffer.from(match[1], "base64");
      } catch {
        return json({ error: "invalid" }, { status: 400 });
      }
      if (bytes.length > 2 * 1024 * 1024) return json({ error: "too_large" }, { status: 400 });
      if (useS3 && s3) {
        await s3.file("brand/" + key + ".png").write(bytes, { type: "image/png" });
      } else {
        await Bun.write("./local-icon-" + key + ".png", bytes);
      }
      return json({ ok: true });
    }

    if (req.method === "GET" && (url.pathname === "/favicon.png" || url.pathname === "/favicon.ico" || url.pathname === "/apple-touch-icon.png")) {
      const key = url.pathname === "/apple-touch-icon.png" ? "touch" : "favicon";
      try {
        if (useS3 && s3) {
          const file = s3.file("brand/" + key + ".png");
          if (!(await file.exists())) return new Response("Not found", { status: 404 });
          return new Response(await file.arrayBuffer(), { headers: { "content-type": "image/png", "cache-control": "public, max-age=3600" } });
        }
        const f = Bun.file("./local-icon-" + key + ".png");
        if (!(await f.exists())) return new Response("Not found", { status: 404 });
        return new Response(await f.arrayBuffer(), { headers: { "content-type": "image/png", "cache-control": "public, max-age=3600" } });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    }

    if (req.method === "GET" && restPath === "/healthz") {
      return new Response("ok");
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log("Same Sky listening on " + PORT + " (storage: " + (useS3 ? "s3" : "local file") + ")");
ensurePuzzleMigrated("").catch((err) => console.error("[puzzle-migrate] failed", err));
