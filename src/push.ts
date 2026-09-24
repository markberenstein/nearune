// Nearune — Web Push wrapper (VAPID). Thin layer over the `web-push`
// library so the rest of the app never touches its API directly.

import webpush from "web-push";
import type { PushSubscriptionRecord } from "./types";

const VAPID_PUBLIC_KEY = Bun.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = Bun.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = Bun.env.VAPID_SUBJECT || "mailto:support@nearune.app";

export const pushConfigured = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
export const vapidPublicKey = VAPID_PUBLIC_KEY;

if (pushConfigured) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export type PushPayload = {
  title: string;
  body: string;
  badge: number; // 0 clears the badge
  tag?: string; // collapses repeats of the same notification type
};

// Sends one push. Returns { ok, gone } — gone=true means the subscription is
// dead (404/410, e.g. the user uninstalled the app or revoked permission)
// and the caller should drop it from state so we stop retrying it forever.
export async function sendPush(
  sub: PushSubscriptionRecord,
  payload: PushPayload
): Promise<{ ok: boolean; gone: boolean }> {
  if (!pushConfigured) return { ok: false, gone: false };
  try {
    await webpush.sendNotification(sub as any, JSON.stringify(payload));
    return { ok: true, gone: false };
  } catch (err: any) {
    const status = err && typeof err.statusCode === "number" ? err.statusCode : 0;
    if (status === 404 || status === 410) return { ok: false, gone: true };
    return { ok: false, gone: false };
  }
}
