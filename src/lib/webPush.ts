// Thin wrapper around `web-push`. Lazily configures VAPID from env on first send so a
// missing key surfaces as a clear runtime signal (isPushConfigured) rather than a crash
// at import time. Server-only.
import webpush from "web-push";
import type { NotificationPayload } from "@/lib/features/adhdMode";
import { validatePushEndpoint } from "@/lib/pushEndpoint";

let configured: boolean | null = null;

/** True once VAPID is set up; false if the env keys are missing (push is then a no-op). */
export function isPushConfigured(): boolean {
  if (configured !== null) return configured;
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

/** Raised when a push endpoint is gone (HTTP 404/410) so the caller can prune the row. */
export class PushGoneError extends Error {
  constructor(public endpoint: string) {
    super(`Push subscription gone: ${endpoint}`);
    this.name = "PushGoneError";
  }
}

type SubKeys = { endpoint: string; p256dh: string; auth: string };

/** Encrypt + deliver one notification to one device. Throws PushGoneError on 404/410. */
export async function sendWebPush(sub: SubKeys, payload: NotificationPayload): Promise<void> {
  if (!isPushConfigured()) throw new Error("Web push not configured (missing VAPID env vars)");
  // Defense-in-depth: subscribePush already validates on the way in, but re-check here so the
  // scheduler never POSTs to a disallowed endpoint (e.g. a row predating this guard). Treat a
  // bad endpoint as gone so the caller prunes the row.
  if (!validatePushEndpoint(sub.endpoint).ok) throw new PushGoneError(sub.endpoint);
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    );
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) throw new PushGoneError(sub.endpoint);
    throw err;
  }
}
