// nearune-admin — standalone read/delete admin view over the same room
// storage the main Nearune app writes to. Deployed as its own Railway
// service so admin access has its own URL, its own secret, and doesn't add
// any surface area to the app your partner actually uses.
//
// Reuses the main app's storage and page-building code directly rather than
// duplicating it — this service and the main app deploy from the same repo,
// just with a different Railway "root directory", so these relative imports
// resolve at build time the same way a workspace package would.
import { listRoomIds, loadState, deleteRoom, removeFromEmailIndex } from "../../src/storage";
import { buildAdminPage, type AdminRoomSummary } from "../../src/admin-page";
import type { PersonKey } from "../../src/types";

const PORT = Number(Bun.env.PORT) || 3000;
const ADMIN_SECRET = Bun.env.ADMIN_SECRET || "";

function checkSecret(url: URL): boolean {
  return !!ADMIN_SECRET && url.searchParams.get("secret") === ADMIN_SECRET;
}

Bun.serve({
  port: PORT,
  idleTimeout: 60,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/healthz") {
      return new Response("ok");
    }

    if (req.method === "GET" && url.pathname === "/") {
      if (!checkSecret(url)) return new Response("Not found", { status: 404 });
      const ids = await listRoomIds();
      const summaries: AdminRoomSummary[] = [];
      for (const id of ids) {
        try {
          const state = await loadState(id);
          const people = (["mark", "nikita"] as PersonKey[])
            .map((k) => state.people?.[k])
            .filter((p): p is NonNullable<typeof p> => !!p)
            .map((p) => ({ name: p.name, confirmed: p.confirmed }));
          const answerKeys = Object.keys(state.answers).sort();
          const lastActive = answerKeys.length > 0 ? answerKeys[answerKeys.length - 1] : null;
          const pushCount = (["mark", "nikita"] as PersonKey[]).filter((k) => !!state.pushSubs?.[k]).length;
          summaries.push({
            roomId: id,
            createdAt: state.createdAt || null,
            people,
            lastActive,
            daysAnswered: answerKeys.length,
            pushCount,
          });
        } catch (err) {
          console.error("[admin] failed to load room " + id, err);
        }
      }
      summaries.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      return new Response(buildAdminPage(summaries, url.searchParams.get("secret") || ""), {
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
      return Response.redirect(url.origin + "/?secret=" + encodeURIComponent(url.searchParams.get("secret") || ""), 303);
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log("[nearune-admin] listening on :" + PORT);
