// nearune-admin — standalone read/delete admin view over the same room
// storage the main Nearune app writes to. Deployed as its own Railway
// service so admin access has its own URL, its own secret, and doesn't add
// any surface area to the app your partner actually uses.
//
// Reuses the main app's storage and page-building code directly rather than
// duplicating it — this service and the main app deploy from the same repo,
// just with a different Railway "root directory", so these relative imports
// resolve at build time the same way a workspace package would.
import { listRoomIds, loadState, dropCachedState, deleteRoom, removeFromEmailIndex, readSideFile } from "../../src/storage";
import { buildAdminPage, type AdminRoomSummary } from "../../src/admin-page";
import { funnelReport } from "../../src/funnel";
import { buildAnalyticsPage } from "../../src/analytics-page";
import { buildAdminHome } from "../../src/admin-home";
import type { PersonKey } from "../../src/types";
import { geocodeAny } from "../../src/geo";
import { US_ABBR } from "../../src/usstates";

// US people: show "City, ST" even when they typed just the city. Geocode
// lookups are cached for the life of the process so the Rooms page stays fast.
const US_STATE_ABBR: Record<string, string> = Object.fromEntries(Object.entries(US_ABBR).map(([ab, name]) => [name, ab]));
const placeCache = new Map<string, Promise<string>>();
function adminPlaceLabel(location: string): Promise<string> {
  const loc = (location || "").trim();
  if (!loc) return Promise.resolve("");
  let p = placeCache.get(loc);
  if (!p) {
    p = (async () => {
      try {
        const r = await geocodeAny(loc);
        if (!r || String(r.country_code || "").toUpperCase() !== "US") return loc;
        const ab = US_STATE_ABBR[String(r.admin1 || "").toLowerCase()];
        if (!ab) return loc;
        const city = loc.split(",")[0].trim() || String(r.name || "");
        return city + ", " + ab;
      } catch { return loc; }
    })();
    placeCache.set(loc, p);
  }
  return p;
}
import { ICON_180_B64, ICON_512_B64 } from "./icon";

const PORT = Number(Bun.env.PORT) || 3000;
const ADMIN_SECRET = Bun.env.ADMIN_SECRET || "";

function checkSecret(url: URL): boolean {
  return !!ADMIN_SECRET && url.searchParams.get("secret") === ADMIN_SECRET;
}

Bun.serve({
  port: PORT,
  idleTimeout: 200,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/healthz") {
      return new Response("ok");
    }

    // Home-screen install support. The icon is public (it has to load without
    // the secret); the manifest carries the secret in its start_url, so it is
    // gated like the page itself.
    if (req.method === "GET" && (url.pathname === "/apple-touch-icon.png" || url.pathname === "/icon-512.png")) {
      const b64 = url.pathname === "/icon-512.png" ? ICON_512_B64 : ICON_180_B64;
      return new Response(Buffer.from(b64, "base64"), { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
    }
    if (req.method === "GET" && url.pathname === "/manifest.webmanifest") {
      if (!checkSecret(url)) return new Response("Not found", { status: 404 });
      const start = "/?secret=" + encodeURIComponent(url.searchParams.get("secret") || "");
      return new Response(JSON.stringify({
        name: "Nearune Admin",
        short_name: "Nearune Admin",
        start_url: start,
        scope: "/",
        display: "standalone",
        background_color: "#FBF3EC",
        theme_color: "#FBF3EC",
        icons: [
          { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      }), { headers: { "content-type": "application/manifest+json", "cache-control": "no-store" } });
    }

    if (req.method === "GET" && url.pathname === "/") {
      if (!checkSecret(url)) return new Response("Not found", { status: 404 });
      let raw: string | null = null;
      try { raw = await readSideFile("admin-stats.json"); } catch (err) { console.error("[admin] stats read failed", err); }
      return new Response(buildAdminHome(raw, url.searchParams.get("secret") || "", url.searchParams.get("msg") || ""), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }

    if (req.method === "POST" && url.pathname === "/refresh-stats") {
      if (!checkSecret(url)) return new Response("Not found", { status: 404 });
      const appUrl = (Bun.env.APP_URL || "").replace(/\/$/, "");
      const cron = Bun.env.CRON_SECRET || "";
      let msg = "refresh_failed";
      if (!appUrl || !cron) msg = "not_configured";
      else {
        try {
          const r = await fetch(appUrl + "/api/admin/stats-refresh", { method: "POST", headers: { "x-cron-secret": cron }, signal: AbortSignal.timeout(58_000) });
          const d: any = await r.json().catch(() => ({}));
          if (d && d.ok) msg = d.pending ? "refresh_pending" : "refreshed";
        } catch (err) { console.error("[admin] stats refresh failed", err); }
      }
      return Response.redirect(url.origin + "/?secret=" + encodeURIComponent(url.searchParams.get("secret") || "") + "&msg=" + msg, 303);
    }

    if (req.method === "GET" && (url.pathname === "/rooms" || url.pathname === "/analytics")) {
      if (!checkSecret(url)) return new Response("Not found", { status: 404 });
      const ids = await listRoomIds();
      const summaries: AdminRoomSummary[] = [];
      for (const id of ids) {
        try {
          dropCachedState(id);
          const state = await loadState(id);
          const people = await Promise.all((["mark", "nikita"] as PersonKey[])
            .filter((k) => !!state.people?.[k])
            .map(async (k) => ({ who: k as string, name: state.people![k]!.name, confirmed: state.people![k]!.confirmed, location: await adminPlaceLabel(state.people![k]!.location || ""), tz: state.people![k]!.tz || "" })));
          const answerKeys = Object.keys(state.answers).sort();
          const lastActive = answerKeys.length > 0 ? answerKeys[answerKeys.length - 1] : null;
          const pushCount = (["mark", "nikita"] as PersonKey[]).filter((k) => !!state.pushSubs?.[k]).length;
          const sAny: any = state;
          const nhieHist = (sAny.nhie && Array.isArray(sAny.nhie.history)) ? sAny.nhie.history : [];
          const nhieRounds = nhieHist.filter((r: any) => r && r.votes && r.votes.mark && r.votes.nikita).length
            + (sAny.nhie && sAny.nhie.votes && sAny.nhie.votes.mark && sAny.nhie.votes.nikita ? 1 : 0);
          const features = {
            voice: (["mark", "nikita"] as PersonKey[]).filter((k) => !!(state.people?.[k] as any)?.voiceId).length,
            puzzlePhotos: Math.max(Number(sAny.puzzleQueueTotal) || 0, (sAny.puzzleCurrentId ? 1 : 0) + (Number(sAny.puzzleSolvedCount) || 0)),
            puzzleSolved: Number(sAny.puzzleSolvedCount) || 0,
            nhieRounds,
            photos: (["mark", "nikita"] as PersonKey[]).filter((k) => !!(state.people?.[k] as any)?.photoAt).length,
          };
          summaries.push({
            roomId: id,
            roomName: state.roomName || undefined,
            createdAt: state.createdAt || null,
            people,
            via: state.createdVia || null,
            lastActive,
            daysAnswered: answerKeys.length,
            bothDays: answerKeys.filter((d) => { const a: any = state.answers[d]; return !!(a && a.mark && a.mark.text && a.nikita && a.nikita.text); }).length,
            pushCount,
            features,
            friend: state.origin === "friend",
            reported: !!state.reported,
            closed: !!state.closed,
            flagged: (state.flags || []).length,
            adminJoin: state.origin === "friend" && state.friendDevices?.mark === "admin" && !state.closed && !state.people?.mark && state.pendingInvite?.mark?.token
              ? "/j/" + id + "/" + state.pendingInvite.mark.token : undefined,
            remindable: (["mark", "nikita"] as PersonKey[])
              .filter((k) => state.people?.[k] && state.people[k]!.emailVerified === false && !!state.pendingConfirm?.[k]?.email)
              .map((k) => ({ who: k, name: state.people![k]!.name, reminders: state.pendingConfirm![k]!.reminders || 0, remindedAt: state.pendingConfirm![k]!.remindedAt || null })),
          });
        } catch (err) {
          console.error("[admin] failed to load room " + id, err);
        }
      }
      summaries.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      if (url.pathname === "/analytics") {
        const fdays = [7, 30, 90].includes(Number(url.searchParams.get("fdays"))) ? Number(url.searchParams.get("fdays")) : 7;
        let funnel = null;
        try { funnel = await funnelReport(fdays, true); } catch (err) { console.error("[admin] funnel report failed", err); }
        return new Response(buildAnalyticsPage(summaries, funnel, url.searchParams.get("secret") || ""), {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
        });
      }
      return new Response(buildAdminPage(summaries, url.searchParams.get("secret") || "", url.searchParams.get("msg") || ""), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }

    if (req.method === "POST" && url.pathname === "/delete-room") {
      if (!checkSecret(url)) return new Response("Not found", { status: 404 });
      let targetRoomId = "";
      try {
        const body = await req.formData();
        targetRoomId = String(body.get("roomId") || "");
      } catch {}
      // The legacy main room (empty id) is never deletable from here — see
      // the note on buildAdminPage's rows for why.
      if (targetRoomId) {
        const cur = await loadState(targetRoomId);
        if (cur.people) {
          for (const key of Object.keys(cur.people) as PersonKey[]) {
            const hash = cur.people[key]?.emailHash;
            if (hash) removeFromEmailIndex(hash, targetRoomId, key).catch(() => {});
          }
        }
        await deleteRoom(targetRoomId);
      }
      return Response.redirect(url.origin + "/rooms?secret=" + encodeURIComponent(url.searchParams.get("secret") || ""), 303);
    }

    // Ends a room without erasing it: both people see "this room has ended".
    if (req.method === "POST" && url.pathname === "/close-room") {
      if (!checkSecret(url)) return new Response("Not found", { status: 404 });
      let rid = "";
      try { rid = String((await req.formData()).get("roomId") || ""); } catch {}
      let cmsg = "error";
      const cApp = (Bun.env.APP_URL || "").replace(/\/$/, "");
      const cCron = Bun.env.CRON_SECRET || "";
      if (!cApp || !cCron) cmsg = "not_configured";
      else if (rid) {
        try {
          const r = await fetch(cApp + "/api/admin/close", {
            method: "POST",
            headers: { "content-type": "application/json", "x-cron-secret": cCron },
            body: JSON.stringify({ roomId: rid }),
          });
          cmsg = r.ok ? "closed" : "error";
        } catch (err) {
          console.error("[admin] close failed", err);
        }
      }
      return Response.redirect(url.origin + "/rooms?secret=" + encodeURIComponent(url.searchParams.get("secret") || "") + "&msg=" + cmsg, 303);
    }

    // Skips a room's current Never Have I Ever prompt. Goes through the main
    // app so its in-memory copy of the room is updated, not overwritten.
    if (req.method === "POST" && url.pathname === "/nhie-refresh") {
      if (!checkSecret(url)) return new Response("Not found", { status: 404 });
      let rid = "";
      try { rid = String((await req.formData()).get("roomId") || ""); } catch {}
      let nmsg = "nhie_failed";
      const nApp = (Bun.env.APP_URL || "").replace(/\/$/, "");
      const nCron = Bun.env.CRON_SECRET || "";
      if (!nApp || !nCron) nmsg = "not_configured";
      else if (rid) {
        try {
          const r = await fetch(nApp + "/api/admin/nhie-refresh", {
            method: "POST",
            headers: { "content-type": "application/json", "x-cron-secret": nCron },
            body: JSON.stringify({ roomId: rid }),
          });
          nmsg = r.ok ? "nhie_refreshed" : "nhie_failed";
        } catch (err) {
          console.error("[admin] nhie refresh failed", err);
        }
      }
      return Response.redirect(url.origin + "/rooms?secret=" + encodeURIComponent(url.searchParams.get("secret") || "") + "&msg=" + nmsg, 303);
    }

    // Changes a room's display name (the title at the top of the room). The
    // room code and invite links never change. Goes through the main app so
    // its in-memory copy of the room is updated rather than overwritten.
    if (req.method === "POST" && url.pathname === "/rename-room") {
      if (!checkSecret(url)) return new Response("Not found", { status: 404 });
      let rid = "", newName = "", newCode = "";
      try {
        const body = await req.formData();
        rid = String(body.get("roomId") || "");
        newName = String(body.get("name") || "");
        newCode = String(body.get("code") || "");
      } catch {}
      let rmsg = "rename_failed";
      const rApp = (Bun.env.APP_URL || "").replace(/\/$/, "");
      const rCron = Bun.env.CRON_SECRET || "";
      if (!rApp || !rCron) rmsg = "not_configured";
      else if (rid) {
        try {
          const r = await fetch(rApp + "/api/admin/rename", {
            method: "POST",
            headers: { "content-type": "application/json", "x-cron-secret": rCron },
            body: JSON.stringify({ roomId: rid, name: newName, code: newCode }),
          });
          const rd: any = await r.json().catch(() => ({}));
          rmsg = r.ok ? "renamed" : rd && rd.error === "code_taken" ? "code_taken" : rd && rd.error === "bad_code" ? "bad_code" : "rename_failed";
        } catch (err) {
          console.error("[admin] rename failed", err);
        }
      }
      return Response.redirect(url.origin + "/rooms?secret=" + encodeURIComponent(url.searchParams.get("secret") || "") + "&msg=" + rmsg, 303);
    }

    // Corrects where a person is registered (city and timezone).
    if (req.method === "POST" && url.pathname === "/set-location") {
      if (!checkSecret(url)) return new Response("Not found", { status: 404 });
      let lrid = "", lwho = "", lloc = "";
      try {
        const body = await req.formData();
        lrid = String(body.get("roomId") || "");
        lwho = String(body.get("who") || "");
        lloc = String(body.get("location") || "");
      } catch {}
      let lmsg = "location_failed";
      const lApp = (Bun.env.APP_URL || "").replace(/\/$/, "");
      const lCron = Bun.env.CRON_SECRET || "";
      if (!lApp || !lCron) lmsg = "not_configured";
      else if (lrid && lloc) {
        try {
          const r = await fetch(lApp + "/api/admin/location", {
            method: "POST",
            headers: { "content-type": "application/json", "x-cron-secret": lCron },
            body: JSON.stringify({ roomId: lrid, who: lwho, location: lloc }),
          });
          const rd: any = await r.json().catch(() => ({}));
          lmsg = r.ok ? "location_set" : rd && rd.error === "city_required" ? "city_required" : "location_failed";
        } catch (err) {
          console.error("[admin] set-location failed", err);
        }
      }
      return Response.redirect(url.origin + "/rooms?secret=" + encodeURIComponent(url.searchParams.get("secret") || "") + "&msg=" + lmsg, 303);
    }

    if (req.method === "POST" && url.pathname === "/remind-room") {
      if (!checkSecret(url)) return new Response("Not found", { status: 404 });
      let rid = "", who = "";
      try {
        const body = await req.formData();
        rid = String(body.get("roomId") || "");
        who = String(body.get("who") || "");
      } catch {}
      let msg = "error";
      const appUrl = (Bun.env.APP_URL || "").replace(/\/$/, "");
      const cron = Bun.env.CRON_SECRET || "";
      if (!appUrl || !cron) {
        msg = "not_configured";
      } else if (rid && (who === "mark" || who === "nikita")) {
        try {
          const r = await fetch(appUrl + "/api/admin/remind", {
            method: "POST",
            headers: { "content-type": "application/json", "x-cron-secret": cron },
            body: JSON.stringify({ roomId: rid, who }),
          });
          const d: any = await r.json().catch(() => ({}));
          const known = ["too_soon", "max_reminders", "nothing_pending", "no_email_kept"];
          msg = d && d.ok ? "sent" : d && known.includes(d.error) ? d.error : "send_failed";
        } catch (err) {
          console.error("[admin] remind failed", err);
        }
      }
      return Response.redirect(url.origin + "/rooms?secret=" + encodeURIComponent(url.searchParams.get("secret") || "") + "&msg=" + msg, 303);
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log("[nearune-admin] listening on :" + PORT);
