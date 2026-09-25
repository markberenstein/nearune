// Nearune — push notifications. Two delivery paths behind one sendPush():
// Web Push (VAPID) for browsers/home-screen installs, via the `web-push`
// library, and native Apple Push Notification service for the iOS app
// (Capacitor wrapper), via a hand-rolled APNs HTTP/2 provider request. The
// rest of the app never touches either API directly — it just calls
// sendPush() with whichever kind of subscription record a person has.

import webpush from "web-push";
import jwt from "jsonwebtoken";
import type { PushSubscriptionRecord } from "./types";

const VAPID_PUBLIC_KEY = Bun.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = Bun.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = Bun.env.VAPID_SUBJECT || "mailto:support@nearune.app";

export const pushConfigured = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
export const vapidPublicKey = VAPID_PUBLIC_KEY;

if (pushConfigured) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// APNs auth-key (.p8) credentials for the native app. A Codemagic
// `distribution_type: app_store` build is always signed for the production
// APNs environment, never sandbox, so the host below is fixed.
const APNS_KEY_ID = Bun.env.APNS_KEY_ID || "";
const APNS_TEAM_ID = Bun.env.APNS_TEAM_ID || "";
// Stored as one line in Railway, so real newlines come back as literal
// "\n" — turn those back into actual line breaks before handing it to the
// JWT signer, which needs real PEM formatting.
const APNS_PRIVATE_KEY = (Bun.env.APNS_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const APNS_BUNDLE_ID = Bun.env.APNS_BUNDLE_ID || "com.nearune.app";
const APNS_HOST = "https://api.push.apple.com";

export const apnsConfigured = !!(APNS_KEY_ID && APNS_TEAM_ID && APNS_PRIVATE_KEY);
// True if either delivery path is set up — the two call sites in
// server.ts use this to decide whether it's worth doing any push work at
// all, since a given room may have people on either or both paths.
export const anyPushConfigured = pushConfigured || apnsConfigured;

// APNs provider tokens are valid up to an hour; cache and refresh a bit
// early rather than signing a fresh one on every single push.
let apnsTokenCache: { token: string; at: number } | null = null;
function apnsProviderToken(): string {
  const now = Date.now();
  if (apnsTokenCache && now - apnsTokenCache.at < 50 * 60 * 1000) return apnsTokenCache.token;
  const token = jwt.sign({ iss: APNS_TEAM_ID, iat: Math.floor(now / 1000) }, APNS_PRIVATE_KEY, {
    algorithm: "ES256",
    header: { alg: "ES256", kid: APNS_KEY_ID },
  });
  apnsTokenCache = { token, at: now };
  return token;
}

export type PushPayload = {
  title: string;
  body: string;
  badge: number; // 0 clears the badge
  tag?: string; // collapses repeats of the same notification type
};

async function sendWebPush(sub: any, payload: PushPayload): Promise<{ ok: boolean; gone: boolean }> {
  if (!pushConfigured) return { ok: false, gone: false };
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload));
    return { ok: true, gone: false };
  } catch (err: any) {
    const status = err && typeof err.statusCode === "number" ? err.statusCode : 0;
    if (status === 404 || status === 410) return { ok: false, gone: true };
    return { ok: false, gone: false };
  }
}

async function sendApnsPush(deviceToken: string, payload: PushPayload): Promise<{ ok: boolean; gone: boolean }> {
  if (!apnsConfigured) return { ok: false, gone: false };
  try {
    const res = await fetch(APNS_HOST + "/3/device/" + deviceToken, {
      method: "POST",
      headers: {
        authorization: "bearer " + apnsProviderToken(),
        "apns-topic": APNS_BUNDLE_ID,
        "apns-push-type": "alert",
        "apns-priority": "10",
        ...(payload.tag ? { "apns-collapse-id": payload.tag.slice(0, 64) } : {}),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        aps: {
          alert: { title: payload.title, body: payload.body },
          badge: payload.badge,
          sound: "default",
        },
      }),
    });
    if (res.ok) return { ok: true, gone: false };
    // A stale/uninstalled-app token comes back as 400 BadDeviceToken or 410
    // Unregistered — either way, stop retrying it.
    let reason = "";
    try { reason = (await res.json()).reason || ""; } catch (e) {}
    const gone = res.status === 410 || reason === "BadDeviceToken" || reason === "Unregistered";
    return { ok: false, gone };
  } catch (err) {
    return { ok: false, gone: false };
  }
}

// Sends one push. Returns { ok, gone } — gone=true means the subscription is
// dead (e.g. the user uninstalled the app or revoked permission) and the
// caller should drop it from state so we stop retrying it forever.
export async function sendPush(
  sub: PushSubscriptionRecord,
  payload: PushPayload
): Promise<{ ok: boolean; gone: boolean }> {
  if (sub.kind === "apns") return sendApnsPush(sub.token, payload);
  return sendWebPush(sub, payload);
}
