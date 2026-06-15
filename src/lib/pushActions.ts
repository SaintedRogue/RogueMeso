"use server";

// Push-subscription lifecycle + test send. Called programmatically from the client
// PushEnableCard (not via ToastForm), so these take plain serializable args.
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actionResult";
import { sendWebPush, PushGoneError, isPushConfigured } from "@/lib/webPush";
import { validatePushEndpoint } from "@/lib/pushEndpoint";

export type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  timezone: string;
  userAgent?: string;
};

/** Persist (or refresh) a device's push subscription and ensure a schedule row exists. */
export async function subscribePush(sub: PushSubscriptionInput): Promise<ActionResult> {
  const me = await requireUser();
  if (!sub?.endpoint || !sub.p256dh || !sub.auth) return fail("Invalid subscription");
  // Don't persist an endpoint the server would later refuse (or shouldn't) POST to — SSRF guard.
  if (!validatePushEndpoint(sub.endpoint).ok) return fail("Invalid subscription endpoint");

  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: {
      userId: me.id,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      timezone: sub.timezone || "UTC",
      userAgent: sub.userAgent ?? null,
    },
    update: { userId: me.id, p256dh: sub.p256dh, auth: sub.auth, timezone: sub.timezone || "UTC" },
  });
  // First-run: make sure the user has a schedule row so the master toggle has something
  // to flip (defaults are off until they opt in).
  await prisma.notificationSchedule.upsert({ where: { userId: me.id }, create: { userId: me.id }, update: {} });

  revalidatePath("/adhd-mode");
  return ok("Notifications enabled on this device");
}

/** Remove a device's subscription (called on disable / sign-out of notifications). */
export async function unsubscribePush(endpoint: string): Promise<ActionResult> {
  const me = await requireUser();
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: me.id } });
  revalidatePath("/adhd-mode");
  return ok("Notifications disabled on this device");
}

/** Send an immediate test notification to all of the user's devices. */
export async function sendTestPush(): Promise<ActionResult> {
  const me = await requireUser();
  if (!isPushConfigured()) return fail("Server push keys are not configured");

  const subs = await prisma.pushSubscription.findMany({ where: { userId: me.id } });
  if (subs.length === 0) return fail("No device subscribed yet");

  const payload = {
    title: "🏋️ RogueMeso",
    body: "Test reminder — your notifications are working.",
    tag: "test",
    actions: [{ action: "done", title: "Nice" }],
  };

  let delivered = 0;
  for (const s of subs) {
    try {
      await sendWebPush(s, payload);
      delivered++;
    } catch (err) {
      if (err instanceof PushGoneError) {
        await prisma.pushSubscription.deleteMany({ where: { endpoint: s.endpoint } });
      } else {
        console.error("[adhd] test push failed", err);
      }
    }
  }
  return delivered > 0
    ? ok(`Test sent to ${delivered} device${delivered > 1 ? "s" : ""}`)
    : fail("Could not send — try re-enabling notifications");
}
