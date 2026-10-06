// Nearune — Bun HTTP server. Room-scoped: "/" is the original room (same
// as the single-file version always was), "/r/<roomId>" is any other room,
// and "/new" lets anyone spin up a fresh private room for themselves.

import { isPerson, type PersonKey } from "./types";
import {
  loadState,
  saveState,
  createRoom,
  deleteRoom,
  puzzleImageKey,
  localPuzzlePath,
  photoKey,
  localPhotoPath,
  useS3,
  s3,
  ensurePuzzleMigrated,
  addToEmailIndex,
  lookupEmailIndex,
  removeFromEmailIndex,
  listRoomIds,
} from "./storage";
import { resolveTranslation, translateEmailStrings } from "./translate";
import { cloneVoice, deleteVoice, synthesizeSpeech } from "./voice";
import { aiGuessMatches } from "./ai";
import { resolveTimezoneFromLocation, resolveLocationInfo } from "./geo";
import { currentWeather } from "./weather";
import { topLocalStory } from "./localnews";
import { topSongs } from "./music";
import { topMovies } from "./movies";
import { json, isValidEmail, readJson, sendEmail, todayKeyPT, guessMatches, advanceQueue, forClient, hashEmail, unansweredCount, effectiveLocation, normalizeInstagramHandle } from "./util";
import { buildPageHtml, buildNewRoomPage, buildRecoverPage, buildPrivacyPage, buildTermsPage, buildManifestJson, buildServiceWorkerJs } from "./page";
import { rateLimit, clientIp } from "./rate-limit";
import { sendPush, pushConfigured, vapidPublicKey, anyPushConfigured } from "./push";

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
    // Behind Railway's proxy req.url is plain http; links we hand out (invite,
    // confirm, etc.) must use the public https origin instead.
    const fwdProto = (req.headers.get("x-forwarded-proto") || "").split(",")[0].trim();
    const publicOrigin = fwdProto ? fwdProto + "://" + url.host : url.origin;
    const { roomId, restPath } = parseRoom(url.pathname);

    // Short invite links: /j/<room>/<token> redirects to the full
    // /r/<room>/?invite=<who>&token=<token> form the app already understands.
    const shortInvite = url.pathname.match(/^\/j\/([a-zA-Z0-9]{1,40})\/([a-zA-Z0-9-]{6,64})\/?$/);
    if (req.method === "GET" && shortInvite) {
      const [, sRoom, sToken] = shortInvite;
      const sState = await loadState(sRoom);
      let sWho = "";
      for (const k of ["mark", "nikita"] as const) {
        if (sState.pendingInvite && sState.pendingInvite[k] && sState.pendingInvite[k]!.token === sToken) sWho = k;
      }
      const dest = "/r/" + sRoom + "/" + (sWho ? "?invite=" + sWho + "&token=" + sToken : "");
      return new Response(null, { status: 302, headers: { location: dest } });
    }
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

    if (req.method === "GET" && url.pathname === "/recover") {
      return new Response(buildRecoverPage(), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }

    if (req.method === "POST" && url.pathname === "/api/recover-access") {
      const body = await readJson(req);
      const email = typeof body?.email === "string" ? body.email.trim().slice(0, 200) : "";
      // Always answer the same way whether or not the email matches, so this
      // can't be used to probe which addresses are registered.
      const generic = { ok: true };
      if (!isValidEmail(email)) return json(generic);
      if (!rateLimit("recover-ip:" + clientIp(req, server), 10, HOUR) || !rateLimit("recover-email:" + email.toLowerCase(), 3, HOUR)) {
        return json(generic);
      }
      const entries = await lookupEmailIndex(await hashEmail(email));
      if (entries.length > 0) {
        const links = entries
          .map((e) => publicOrigin + (e.roomId ? "/r/" + e.roomId : ""))
          .filter((v, i, arr) => arr.indexOf(v) === i);
        const list = links.map((l) => "<li><a href=\"" + l + "\">" + l + "</a></li>").join("");
        await sendEmail(
          email,
          "Your Nearune link",
          "<p>Here's your Nearune room:</p><ul>" + list + "</ul>" +
            "<p style=\"color:#888;font-size:0.9em\">Didn't request this? You can ignore this email.</p>"
        );
      }
      return json(generic);
    }

    if (req.method === "GET" && url.pathname === "/privacy") {
      return new Response(buildPrivacyPage(), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }

    if (req.method === "GET" && url.pathname === "/terms") {
      return new Response(buildTermsPage(), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }

    if (req.method === "GET" && restPath === "/manifest.json") {
      return new Response(buildManifestJson(roomId), {
        headers: { "content-type": "application/manifest+json", "cache-control": "no-store" },
      });
    }

    if (req.method === "GET" && restPath === "/sw.js") {
      return new Response(buildServiceWorkerJs(), {
        headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store", "service-worker-allowed": "/" },
      });
    }

    if (req.method === "GET" && url.pathname === "/api/push-public-key") {
      return json({ key: vapidPublicKey, configured: pushConfigured });
    }

    if (req.method === "POST" && restPath === "/api/push-subscribe") {
      const body = await readJson(req);
      const who = body && body.who;
      const subscription = body && body.subscription;
      if (!isPerson(who) || !subscription) {
        return json({ error: "invalid" }, { status: 400 });
      }
      if (subscription.kind === "apns") {
        if (typeof subscription.token !== "string" || !subscription.token) {
          return json({ error: "invalid" }, { status: 400 });
        }
        await saveState(roomId, (s) => {
          if (!s.pushSubs) s.pushSubs = {};
          s.pushSubs[who] = { kind: "apns", token: subscription.token };
        });
        return json({ ok: true });
      }
      if (
        typeof subscription.endpoint !== "string" ||
        !subscription.keys ||
        typeof subscription.keys.p256dh !== "string" ||
        typeof subscription.keys.auth !== "string"
      ) {
        return json({ error: "invalid" }, { status: 400 });
      }
      await saveState(roomId, (s) => {
        if (!s.pushSubs) s.pushSubs = {};
        s.pushSubs[who] = { endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } };
      });
      return json({ ok: true });
    }

    if (req.method === "POST" && restPath === "/api/push-unsubscribe") {
      const body = await readJson(req);
      const who = body && body.who;
      if (!isPerson(who)) return json({ error: "invalid" }, { status: 400 });
      await saveState(roomId, (s) => {
        if (s.pushSubs) delete s.pushSubs[who];
      });
      return json({ ok: true });
    }

    if (req.method === "POST" && url.pathname === "/api/cron/daily-push") {
      const secret = Bun.env.CRON_SECRET;
      const given = req.headers.get("x-cron-secret") || "";
      if (!secret || given !== secret) return json({ error: "forbidden" }, { status: 403 });
      if (!anyPushConfigured) return json({ ok: true, sent: 0, note: "push not configured" });
      const today = todayKeyPT();
      const ids = await listRoomIds();
      let sent = 0;
      for (const id of ids) {
        try {
          const state = await loadState(id);
          if (!state.pushSubs) continue;
          // "Still waiting" nudge: an invite unanswered for 2+ days, at most
          // once every 3 days, pushed to whoever sent it.
          const DAY_MS = 24 * 60 * 60 * 1000;
          for (const other of ["mark", "nikita"] as PersonKey[]) {
            const inv = state.pendingInvite && state.pendingInvite[other];
            const inviterKey: PersonKey = other === "mark" ? "nikita" : "mark";
            const inviterSub = state.pushSubs[inviterKey];
            if (!inv || !inviterSub) continue;
            if (state.people && state.people[other] && state.people[other]!.confirmed) continue;
            const lastNudge = state.inviteNudgeAt ? Date.parse(state.inviteNudgeAt) : 0;
            if (Date.now() - Date.parse(inv.at) < 2 * DAY_MS || Date.now() - lastNudge < 3 * DAY_MS) continue;
            const nres = await sendPush(inviterSub, {
              title: "Still waiting for your Nearune partner",
              body: "Open Nearune to get a fresh invite link and send it to them yourself — text, Instagram or email.",
              tag: "invite-nudge",
            });
            if (nres.ok) {
              sent++;
              await saveState(id, (s) => { s.inviteNudgeAt = new Date().toISOString(); });
            }
            if (nres.gone) {
              await saveState(id, (s) => { if (s.pushSubs) delete s.pushSubs[inviterKey]; });
            }
          }
          if (state.pushLastMorningKey === today) continue;
          const count = unansweredCount(state, today);
          if (count > 0) {
            for (const who of ["mark", "nikita"] as PersonKey[]) {
              const a = state.answers[today];
              const answered = !!(a && a[who] && a[who]!.text);
              const sub = state.pushSubs[who];
              if (answered || !sub) continue;
              const res = await sendPush(sub, {
                title: "Today's question is up",
                body: "Your Nearune question for today is ready.",
                badge: count,
                tag: "morning",
              });
              if (res.ok) sent++;
              if (res.gone) {
                await saveState(id, (s) => {
                  if (s.pushSubs) delete s.pushSubs[who];
                });
              }
            }
          }
          await saveState(id, (s) => {
            s.pushLastMorningKey = today;
          });
        } catch (err) {
          console.error("[cron-push] room " + id + " failed", err);
        }
      }
      return json({ ok: true, sent });
    }

    // Room visibility and the delete-room action now live in the separate
    // nearune-admin service (admin-app/), which reads this same storage —
    // see that service for the /admin equivalent.

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

    if (req.method === "POST" && restPath === "/api/delete-room") {
      // No password auth exists in this app — possessing the room link is
      // already the same trust level everything else here relies on, so
      // that's the bar for this too. Removes both people from the recovery
      // index (if they registered one), then wipes the room's data entirely.
      const cur = await loadState(roomId);
      if (cur.people) {
        for (const key of Object.keys(cur.people) as PersonKey[]) {
          const hash = cur.people[key]?.emailHash;
          if (hash) removeFromEmailIndex(hash, roomId, key).catch(() => {});
        }
      }
      await deleteRoom(roomId);
      return json({ ok: true });
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
      // Nudge whoever hasn't answered yet, and sync badges to the shared
      // "how many of you two still need to answer today" count (0/1/2) —
      // both people's badges always show the same number. Fire-and-forget —
      // a slow or failed push shouldn't delay the answer response, and a
      // dead subscription is cleaned up in the background rather than
      // blocking this request.
      if (anyPushConfigured && state.pushSubs) {
        const count = unansweredCount(state, date);
        if (count > 0) {
          const answererName = state.people?.[who]?.name || "Your partner";
          for (const other of (["mark", "nikita"] as PersonKey[]).filter((k) => k !== who)) {
            const a = state.answers[date];
            const answered = !!(a && a[other] && a[other]!.text);
            const sub = state.pushSubs[other];
            if (answered || !sub) continue;
            sendPush(sub, {
              title: answererName + " answered today's question",
              body: "Your turn on Nearune.",
              badge: count,
              tag: "partner-answered",
            })
              .then((res) => {
                if (res.gone) {
                  saveState(roomId, (s) => {
                    if (s.pushSubs) delete s.pushSubs[other];
                  }).catch(() => {});
                }
              })
              .catch(() => {});
          }
          // The answerer's own native badge still shows the pre-answer
          // count — a real alert push only went to whoever hasn't answered
          // yet, and native has no client-side badge API to update it
          // locally otherwise. Won't show as a visible banner in practice:
          // this fires immediately after the person's own answer request
          // completes, so their app is in the foreground, and the app has
          // no `presentationOptions` configured, which means iOS presents
          // nothing for a foregrounded notification — only the badge
          // updates. Only needed for APNs; web subs sync locally via the
          // poll loop.
          const ownSub = state.pushSubs[who];
          if (ownSub && ownSub.kind === "apns") {
            sendPush(ownSub, {
              title: "Answer saved",
              body: "Waiting on your partner to answer today's question.",
              badge: count,
              tag: "own-answered",
            })
              .then((res) => {
                if (res.gone) {
                  saveState(roomId, (s) => {
                    if (s.pushSubs) delete s.pushSubs[who];
                  }).catch(() => {});
                }
              })
              .catch(() => {});
          }
        } else {
          // Both answers are in — clear both native badges to 0. Native has
          // no client-side badge API (no navigator.setAppBadge in
          // Capacitor's WebView), so a push is the only way to update it —
          // but a silent (content-available) push is low-priority and iOS
          // can throttle its delivery for an unpredictable amount of time,
          // which isn't good enough for "the badge should clear now". A
          // real alert push is delivered immediately, so this sends one to
          // both people, collapsed under one tag so re-editing an answer
          // afterward doesn't pile up repeat notifications. Web
          // subscriptions already sync their own badge client-side, so this
          // only targets APNs.
          for (const person of ["mark", "nikita"] as PersonKey[]) {
            const sub = state.pushSubs[person];
            if (!sub || sub.kind !== "apns") continue;
            sendPush(sub, {
              title: "You're all caught up",
              body: "Both answers are in for today on Nearune.",
              badge: 0,
              tag: "day-complete",
            })
              .then((res) => {
                if (res.gone) {
                  saveState(roomId, (s) => {
                    if (s.pushSubs) delete s.pushSubs[person];
                  }).catch(() => {});
                }
              })
              .catch(() => {});
          }
        }
      }
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

    // SANDBOX EXPERIMENT: current weather at the OTHER person's registered
    // location — used to tint the app's background. `who` is the person
    // asking, so this looks up their partner.
    // Both people's weather in one call — the client picks which one to
    // display (its own partner's, by default, or the previewed person's
    // partner's, in the click-to-preview experiment), which needs no extra
    // round trip this way since currentWeather() is cached per location
    // server-side regardless.
    if (req.method === "GET" && restPath === "/api/weather") {
      const state = await loadState(roomId);
      const today = todayKeyPT();
      const [markWeather, nikitaWeather] = await Promise.all([
        currentWeather(effectiveLocation(state.people?.mark, today)),
        currentWeather(effectiveLocation(state.people?.nikita, today)),
      ]);
      return json({ weather: { mark: markWeather, nikita: nikitaWeather } });
    }

    // SANDBOX EXPERIMENT: top local news story (biased toward genuinely
    // odd/funny real stories — see localnews.ts) at each person's
    // effective location (their travel city if they've set one and it
    // hasn't expired, their registered home city otherwise — see
    // util.ts's effectiveLocation) — same shape and caching approach as
    // /api/weather above, no API key required.
    if (req.method === "GET" && restPath === "/api/news") {
      const state = await loadState(roomId);
      const today = todayKeyPT();
      const [markNews, nikitaNews] = await Promise.all([
        topLocalStory(effectiveLocation(state.people?.mark, today)),
        topLocalStory(effectiveLocation(state.people?.nikita, today)),
      ]);
      return json({ news: { mark: markNews, nikita: nikitaNews } });
    }

    // Top songs chart (see music.ts) at each person's effective location —
    // same shape/caching approach as /api/weather and /api/news above, no
    // API key required. Country-level, not city-level (see music.ts for
    // why) — `limit` lets the client ask for the full top-5 at once rather
    // than needing a second round trip when someone expands the list.
    if (req.method === "GET" && restPath === "/api/music") {
      const state = await loadState(roomId);
      const today = todayKeyPT();
      const [markMusic, nikitaMusic] = await Promise.all([
        topSongs(effectiveLocation(state.people?.mark, today), 5),
        topSongs(effectiveLocation(state.people?.nikita, today), 5),
      ]);
      return json({ music: { mark: markMusic, nikita: nikitaMusic } });
    }

    // Top movies chart (see movies.ts) — same shape as /api/music above.
    if (req.method === "GET" && restPath === "/api/movies") {
      const state = await loadState(roomId);
      const today = todayKeyPT();
      const [markMovies, nikitaMovies] = await Promise.all([
        topMovies(effectiveLocation(state.people?.mark, today), 5),
        topMovies(effectiveLocation(state.people?.nikita, today), 5),
      ]);
      return json({ movies: { mark: markMovies, nikita: nikitaMovies } });
    }

    // Sets or clears a traveling override of where THIS person is shown as
    // being, for their partner's weather/local-lore widgets AND clock (see
    // types.ts's travel* fields and util.ts's effectiveLocation/
    // effectiveTz/isTraveling) — their real registered location/timezone,
    // the daily question rollover, and everything else are untouched. An
    // empty location clears it outright, back to home. `from`/`until` are
    // optional date keys (YYYY-MM-DD): `from` schedules travel ahead of
    // time instead of starting it immediately, and `showEarly` (only
    // meaningful with a future `from`) opts into the override appearing
    // TRAVEL_EARLY_DAYS days before `from` rather than exactly on it, so
    // the partner gets a few days' heads-up. Leaving out `until` means it
    // stays set until explicitly cleared.
    if (req.method === "POST" && restPath === "/api/travel") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const { who } = body || {};
      if (!isPerson(who)) return json({ error: "invalid" }, { status: 400 });
      const location = typeof body?.location === "string" ? body.location.trim().slice(0, 80) : "";
      const asDateKey = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : "");
      const from = asDateKey(body?.from);
      const until = asDateKey(body?.until);
      const showEarly = !!body?.showEarly;
      // Resolved up front (needs a network call) rather than inside
      // saveState's mutator, which must stay synchronous — same geocoding
      // lookup registration uses (see geo.ts), so a travel city gets a
      // real timezone for the clock without anyone typing one by hand.
      const travelTz = location ? await resolveTimezoneFromLocation(location) : null;
      const state = await saveState(roomId, (s) => {
        if (!s.people || !s.people[who]) return;
        if (!location) {
          delete s.people[who]!.travelLocation;
          delete s.people[who]!.travelTz;
          delete s.people[who]!.travelFrom;
          delete s.people[who]!.travelUntil;
          delete s.people[who]!.travelShowEarly;
          return;
        }
        s.people[who]!.travelLocation = location;
        if (travelTz) s.people[who]!.travelTz = travelTz;
        else delete s.people[who]!.travelTz;
        if (from) s.people[who]!.travelFrom = from;
        else delete s.people[who]!.travelFrom;
        if (until) s.people[who]!.travelUntil = until;
        else delete s.people[who]!.travelUntil;
        if (from && showEarly) s.people[who]!.travelShowEarly = true;
        else delete s.people[who]!.travelShowEarly;
      });
      return json(forClient(state));
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
      // "contact" is either an email or an Instagram handle (older cached
      // clients still send "email", which keeps working).
      const contact =
        typeof body?.contact === "string" ? body.contact.trim().slice(0, 200)
        : typeof body?.email === "string" ? body.email.trim().slice(0, 200) : "";
      const email = isValidEmail(contact) ? contact : "";
      const handle = email ? null : normalizeInstagramHandle(contact);
      const location = typeof body?.location === "string" ? body.location.trim().slice(0, 80) : "";
      const language = typeof body?.language === "string" ? body.language.trim().slice(0, 40) : "";
      const browserTz = typeof body?.tz === "string" ? body.tz.trim().slice(0, 60) : "";
      const relationship =
        body?.relationship === "significant_other" ||
        body?.relationship === "family" ||
        body?.relationship === "friend" ||
        body?.relationship === "its_complicated"
          ? body.relationship
          : undefined;
      if (!isPerson(who) || !name || (!email && !handle)) {
        return json({ error: "invalid" }, { status: 400 });
      }
      if (handle) {
        // Instagram-handle sign-up: nothing is emailed (there's no address),
        // so there's nothing to confirm and nothing that could be used to
        // spam anyone — an IP limit is enough. The handle is just a label
        // shown to the partner; it can't be verified, which is why this
        // path has no email recovery (see types.ts's PersonProfile.instagram).
        if (!rateLimit("register-ip:" + clientIp(req, server), 10, HOUR)) {
          return json({ error: "rate_limited" }, { status: 429 });
        }
        const curH = await loadState(roomId);
        if (curH.people && curH.people[who] && curH.people[who]!.confirmed) {
          return json({ error: "already_registered" }, { status: 409 });
        }
        const tzH = (await resolveTimezoneFromLocation(location)) || browserTz;
        const stateH = await saveState(roomId, (s) => {
          if (!s.people) s.people = {};
          s.people[who] = { name, location, language, tz: tzH || undefined, confirmed: true, instagram: handle };
          if (s.pendingConfirm) delete s.pendingConfirm[who];
          if (relationship && !s.relationship) s.relationship = relationship;
        });
        return json({ ...forClient(stateH), _viaHandle: true });
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
      // Keyed hash only — the address itself is never stored on the person's
      // profile, just this one-way fingerprint (see hashEmail).
      const emailHash = await hashEmail(email);
      const state = await saveState(roomId, (s) => {
        if (!s.people) s.people = {};
        s.people[who] = { name, location, language, tz: tz || undefined, confirmed: false, emailHash };
        if (!s.pendingConfirm) s.pendingConfirm = {};
        s.pendingConfirm[who] = { token, at: new Date().toISOString() };
        // Only whoever registers first sets this for the room — the second
        // person's own registration (or re-registering after a bounced
        // confirm) never overwrites an already-chosen relationship.
        if (relationship && !s.relationship) s.relationship = relationship;
      });
      const confirmUrl = publicOrigin + roomPrefix + "/api/confirm?who=" + who + "&token=" + token;
      // Sent in whichever language this person just picked on the
      // registration form (translateEmailStrings falls back to English,
      // string-by-string, if that language is unset/unrecognized or a
      // translation call fails) — "Hi" and the name are kept separate so
      // the name itself is never run through a translator.
      const [subjT, hiT, setupT, confirmLinkT, step2T, footerT] = await translateEmailStrings(
        [
          "Confirm your Nearune account",
          "Hi",
          "You're almost set up:",
          "Confirm your email",
          "Go to the Nearune link to complete your partner's information",
          "Don't see this arriving right away next time? Check your spam folder.",
        ],
        language
      );
      const r = await sendEmail(
        email,
        subjT,
        "<p>" + hiT + " " + name + ",</p>" +
          "<p>" + setupT + "</p>" +
          "<ol><li><a href=\"" + confirmUrl + "\">" + confirmLinkT + "</a></li>" +
          "<li>" + step2T + "</li></ol>" +
          "<p style=\"color:#888;font-size:0.9em\">" + footerT + "</p>"
      );
      // Lets this person recover their room link later if they lose it.
      addToEmailIndex(emailHash, { roomId, who }).catch(() => {});
      // Same pattern /api/invite already uses below: the link goes back only
      // to the browser that just submitted this request, so exposing it
      // here is no bigger a surface than the invite link already is — and
      // it's what lets registration finish immediately if the email is
      // slow, misdelivered, or (in a sandbox with no email provider
      // configured) never sent at all.
      return json({ ...forClient(state), _emailSent: r.ok, _emailError: r.error, _confirmUrl: confirmUrl });
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
      const backUrl = publicOrigin + roomPrefix + "/" + (ok ? "?viewer=" + who : "");
      const html = ok
        ? "<!doctype html><html><head><meta http-equiv=\"refresh\" content=\"1;url=" + backUrl + "\"></head><body style=\"font-family:sans-serif;text-align:center;padding:60px 20px\"><h1>Confirmed 🎉</h1><p><a href=\"" + backUrl + "\">Continue to Nearune</a></p></body></html>"
        : "<!doctype html><body style=\"font-family:sans-serif;text-align:center;padding:60px 20px\"><h1>Link expired</h1><p>Request a new one from the app.</p></body>";
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    if (req.method === "POST" && restPath === "/api/invite") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const who = body && body.who;
      const contact =
        typeof body?.contact === "string" ? body.contact.trim().slice(0, 200)
        : typeof body?.email === "string" ? body.email.trim().slice(0, 200) : "";
      const email = isValidEmail(contact) ? contact : "";
      const handle = email ? null : normalizeInstagramHandle(contact);
      if (!isPerson(who) || (!email && !handle)) {
        return json({ error: "invalid" }, { status: 400 });
      }
      if (!rateLimit("invite-ip:" + clientIp(req, server), 10, HOUR) || (email && !rateLimit("invite-email:" + email.toLowerCase(), 3, HOUR))) {
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
      // 12 hex chars keeps the shareable link short; invites are rate-limited.
      const token = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
      const state = await saveState(roomId, (s) => {
        if (!s.pendingInvite) s.pendingInvite = {};
        s.pendingInvite[other] = handle
          ? { token, at: new Date().toISOString(), instagram: handle }
          : { token, at: new Date().toISOString() };
      });
      const inviteUrl = roomId
        ? publicOrigin + "/j/" + roomId + "/" + token
        : publicOrigin + roomPrefix + "/?invite=" + other + "&token=" + token;
      if (handle) {
        // Nothing to email — the link goes back to this browser and the
        // inviter sends it themselves (e.g. as an Instagram DM).
        return json({ ...forClient(state), _viaHandle: true, _inviteUrl: inviteUrl });
      }
      const inviterName = cur.people[who]!.name;
      const r = await sendEmail(
        email,
        inviterName + " invited you to Nearune",
        "<p>" + inviterName + " invited you to Nearune.</p>" +
          "<ol><li><a href=\"" + inviteUrl + "\">Confirm your email</a></li>" +
          "<li>Access Nearune to begin your togetherness bonding</li></ol>" +
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
        const invitedHandle = s.pendingInvite && s.pendingInvite[who!] && s.pendingInvite[who!]!.instagram;
        s.people[who!] = { name, location, language, tz: tz || undefined, confirmed: true, ...(invitedHandle ? { instagram: invitedHandle } : {}) };
        if (s.pendingInvite) delete s.pendingInvite[who!];
      });
      // Let the person who sent the invite know their partner is in —
      // otherwise the only way they'd find out is having the app open when
      // the 6s poll happens to catch it. Push only (not email): we never
      // keep a raw email on file past sending the original invite, so
      // there's nothing to email this back to.
      const inviter: PersonKey = who === "mark" ? "nikita" : "mark";
      const inviterSub = state.pushSubs && state.pushSubs[inviter];
      if (inviterSub) {
        const today = todayKeyPT();
        sendPush(inviterSub, {
          title: "Your Nearune partner joined!",
          body: name + " just joined Nearune — today's question is ready for you both.",
          badge: unansweredCount(state, today),
          tag: "partner-joined",
        }).then((res) => {
          if (res.gone) {
            saveState(roomId, (s) => {
              if (s.pushSubs) delete s.pushSubs[inviter];
            }).catch(() => {});
          }
        }).catch(() => {});
      }
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

    if (req.method === "POST" && restPath === "/api/voice-sample") {
      // Cloning costs real money per call and a bad actor could otherwise
      // hammer this — capped well above any legitimate re-recording need.
      if (!rateLimit("voice-sample:" + roomId, 10, 24 * HOUR)) {
        return json({ error: "rate_limited" }, { status: 429 });
      }
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const who = body && body.who;
      const dataUrl = body && body.dataUrl;
      if (!isPerson(who) || typeof dataUrl !== "string") return json({ error: "invalid" }, { status: 400 });
      const match = dataUrl.match(/^data:([a-zA-Z0-9/.+-]+);base64,(.+)$/);
      if (!match) return json({ error: "invalid" }, { status: 400 });
      const mimeType = match[1];
      let bytes: Uint8Array;
      try {
        bytes = Buffer.from(match[2], "base64");
      } catch {
        return json({ error: "invalid" }, { status: 400 });
      }
      // A clean ~20-60s sample is plenty for Instant Voice Cloning — capping
      // well above that (10MB) just guards against an oversized upload, not
      // against a long recording that's actually fine.
      if (bytes.length < 2000) return json({ error: "too_short" }, { status: 400 });
      if (bytes.length > 10 * 1024 * 1024) return json({ error: "too_large" }, { status: 400 });
      const existing = await loadState(roomId);
      const oldVoiceId = existing.people && existing.people[who] && existing.people[who]!.voiceId;
      const label = "nearune-" + (roomId || "legacy") + "-" + who;
      const result = await cloneVoice(bytes, mimeType, label);
      if (!result.ok) return json({ error: result.error }, { status: 502 });
      const state = await saveState(roomId, (s) => {
        if (!s.people) s.people = {};
        if (!s.people[who]) s.people[who] = { name: "", location: "", language: "", confirmed: true };
        s.people[who]!.voiceId = result.voiceId;
      });
      // Old clone is no longer referenced by anything — clean it up at the
      // provider rather than letting clones accumulate there forever.
      if (oldVoiceId && oldVoiceId !== result.voiceId) deleteVoice(oldVoiceId).catch(() => {});
      return json(forClient(state));
    }

    // Clears a saved voice sample without recording a new one — e.g. the
    // sample on file was recorded by the wrong person (device identity was
    // on someone else's slot at the time) and needs to come off entirely
    // rather than being replaced with another recording right away. Once
    // cleared, speak/speakAs fall back to the plain default voice until
    // that person records a real sample of their own.
    if (req.method === "POST" && restPath === "/api/voice-sample-delete") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const who = body && body.who;
      if (!isPerson(who)) return json({ error: "invalid" }, { status: 400 });
      const existing = await loadState(roomId);
      const oldVoiceId = existing.people && existing.people[who] && existing.people[who]!.voiceId;
      const state = await saveState(roomId, (s) => {
        if (s.people && s.people[who]) delete s.people[who]!.voiceId;
      });
      if (oldVoiceId) deleteVoice(oldVoiceId).catch(() => {});
      return json(forClient(state));
    }

    // SANDBOX EXPERIMENT: "share a recent photo" — one photo per person,
    // overwritten each time (see storage.ts's photoKey/PersonProfile.photoAt),
    // same resize-client-side-then-base64-POST approach as /api/voice-sample
    // and /api/puzzle-batch above.
    if (req.method === "POST" && restPath === "/api/photo-upload") {
      if (!rateLimit("photo-upload:" + roomId, 30, HOUR)) {
        return json({ error: "rate_limited" }, { status: 429 });
      }
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const who = body && body.who;
      const dataUrl = body && body.dataUrl;
      if (!isPerson(who) || typeof dataUrl !== "string") return json({ error: "invalid" }, { status: 400 });
      const match = dataUrl.match(/^data:image\/jpeg;base64,(.+)$/);
      if (!match) return json({ error: "invalid" }, { status: 400 });
      let bytes: Uint8Array;
      try {
        bytes = Buffer.from(match[1], "base64");
      } catch {
        return json({ error: "invalid" }, { status: 400 });
      }
      if (bytes.length < 200) return json({ error: "invalid" }, { status: 400 });
      if (bytes.length > 6 * 1024 * 1024) return json({ error: "too_large" }, { status: 400 });
      if (useS3 && s3) {
        await s3.file(photoKey(roomId, who)).write(bytes, { type: "image/jpeg" });
      } else {
        await Bun.write(localPhotoPath(roomId, who), bytes);
      }
      const state = await saveState(roomId, (s) => {
        if (!s.people) s.people = {};
        if (!s.people[who]) s.people[who] = { name: "", location: "", language: "", confirmed: true };
        s.people[who]!.photoAt = new Date().toISOString();
      });
      return json(forClient(state));
    }

    // Removes a shared photo without replacing it — same idea as
    // /api/voice-sample-delete above.
    if (req.method === "POST" && restPath === "/api/photo-delete") {
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const who = body && body.who;
      if (!isPerson(who)) return json({ error: "invalid" }, { status: 400 });
      const state = await saveState(roomId, (s) => {
        if (s.people && s.people[who]) delete s.people[who]!.photoAt;
      });
      try {
        if (useS3 && s3) await s3.file(photoKey(roomId, who)).delete();
        else await Bun.file(localPhotoPath(roomId, who)).delete();
      } catch {}
      return json(forClient(state));
    }

    if (req.method === "GET" && restPath === "/api/photo") {
      const who = url.searchParams.get("who") || "";
      if (!isPerson(who)) return new Response("Not found", { status: 404 });
      try {
        if (useS3 && s3) {
          const file = s3.file(photoKey(roomId, who));
          if (!(await file.exists())) return new Response("Not found", { status: 404 });
          const bytes = await file.arrayBuffer();
          return new Response(bytes, {
            headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" },
          });
        } else {
          const f = Bun.file(localPhotoPath(roomId, who));
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

    if (req.method === "POST" && restPath === "/api/speak") {
      // Each call is a real text-to-speech request against a paid API — cap
      // it well above normal use (someone tapping 🔊 on every line of a long
      // conversation) without making it a hard wall for ordinary use.
      if (!rateLimit("speak:" + roomId, 120, HOUR)) {
        return json({ error: "rate_limited" }, { status: 429 });
      }
      const body = await readJson(req);
      if (!body) return json({ error: "bad_json" }, { status: 400 });
      const who = body && body.who;
      const text = typeof (body && body.text) === "string" ? body.text.slice(0, 2000).trim() : "";
      if (!isPerson(who) || !text) return json({ error: "invalid" }, { status: 400 });
      const current = await loadState(roomId);
      const voiceId = current.people && current.people[who] && current.people[who]!.voiceId;
      if (!voiceId) return json({ error: "no_voice" }, { status: 404 });
      const audio = await synthesizeSpeech(text, voiceId);
      if (!audio) return json({ error: "synth_failed" }, { status: 502 });
      return new Response(audio, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
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

      // guessMatches() (exact/substring) is the fast, free first check.
      // aiGuessMatches() is the generous fallback — catches a paraphrase,
      // synonym, or typo-past-what-substring-forgives that's still clearly
      // the right answer. It's a network call, so it has to happen here,
      // before the atomic save below, rather than inside saveState()'s
      // synchronous mutator. If the puzzle changes out from under us
      // between this peek and the save (new photo loaded, guess already
      // answered elsewhere), the guard checks inside the mutator still
      // protect against a guess landing on the wrong puzzle — that one
      // unlucky request just falls back to the plain guessMatches() check,
      // same as before this existed.
      const peeked = await loadState(roomId);
      const peekedAnswer = peeked.puzzleAnswer;
      let correct = peekedAnswer ? guessMatches(trimmed, peekedAnswer) : false;
      if (!correct && peekedAnswer) {
        const aiVerdict = await aiGuessMatches(trimmed, peekedAnswer);
        if (aiVerdict === true) correct = true;
      }

      let rejected = false;
      const state = await saveState(roomId, (s) => {
        if (!s.puzzleAnswer || s.puzzleSolved) return;
        if (s.puzzleSetBy && who === s.puzzleSetBy) { rejected = true; return; }
        if (s.puzzleLastGuessDate === today) return;
        const finalCorrect = s.puzzleAnswer === peekedAnswer ? correct : guessMatches(trimmed, s.puzzleAnswer);
        s.puzzleLastGuessDate = today;
        s.puzzleLastGuessBy = who;
        s.puzzleLastGuessText = trimmed;
        s.puzzleLastGuessCorrect = finalCorrect;
        if (finalCorrect) {
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
        const res = await fetch(gUrl, { headers: { "User-Agent": "NearuneApp/1.0 (personal use)" } });
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

console.log("Nearune listening on " + PORT + " (storage: " + (useS3 ? "s3" : "local file") + ")");
ensurePuzzleMigrated("").catch((err) => console.error("[puzzle-migrate] failed", err));
