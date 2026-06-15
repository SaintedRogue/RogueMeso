"use server";

import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { isValidPassword } from "@/lib/password";
import { SESSION_COOKIE, signSession } from "@/lib/session";
import { loginLimiter } from "@/lib/rateLimit";
import { ok, fail, type ActionResult } from "@/lib/actionResult";

/** Best-effort client IP for rate-limit keying. Behind the documented reverse proxy the
 *  left-most x-forwarded-for hop is the real client; falls back to x-real-ip, then a
 *  constant so a header-less request still shares one bucket rather than bypassing the limit. */
async function getClientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

// A throwaway bcrypt hash compared against when no user matches, so a missing
// account takes the same time as a wrong password (no email-enumeration oracle).
const DUMMY_HASH = "$2b$10$B7W7L6yVOGjEhRXdChRRveK1F3ye5fiBTMQgovc/.DSnp0oJDlyES";

/** Mint + set the session cookie for a user at a given session version. Single source of
 *  the cookie options so login, first-run, and password-change re-issue can't drift apart. */
async function setSessionCookie(uid: number, ver: number): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, await signSession(uid, ver), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  // Throttle brute force / credential stuffing. Keyed by IP+email so one attacker can't lock a
  // victim out globally, and checked before bcrypt so a locked key costs no hashing work.
  const key = `${await getClientIp()}|${email}`;
  const gate = loginLimiter.check(key);
  if (!gate.allowed) redirect(`/login?error=locked&retry=${Math.ceil(gate.retryAfterMs / 1000)}`);

  const user = await prisma.user.findUnique({ where: { email } });
  // Always run a compare so timing doesn't reveal whether the email exists.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!ok || !user?.passwordHash) {
    loginLimiter.recordFailure(key);
    redirect("/login?error=1");
  }
  // Deactivated accounts can't sign in (their data is retained, reversibly).
  if (!user.active) redirect("/login?error=disabled");

  loginLimiter.recordSuccess(key);
  await setSessionCookie(user.id, user.sessionVersion);
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

// First-run only: create the initial admin in the browser when the DB has no
// users yet, then sign them in. Public (no session required) BUT self-closing:
// it refuses the moment any user exists, so it can never be used to mint a
// second admin. Mirrors the login cookie block on success.
export async function createFirstAdmin(formData: FormData) {
  if ((await prisma.user.count()) > 0) redirect("/login"); // already set up — locked

  // This route is public until the first user exists; throttle by IP so it can't be hammered.
  // Count every attempt (a successful one is harmless — the route self-locks once a user exists).
  const setupKey = `setup|${await getClientIp()}`;
  if (!loginLimiter.check(setupKey).allowed) redirect("/setup?err=locked");
  loginLimiter.recordFailure(setupKey);

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim() || null;
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!email || !email.includes("@")) redirect("/setup?err=email");
  if (password !== confirm) redirect("/setup?err=mismatch");
  if (!isValidPassword(password)) redirect("/setup?err=weak");
  if (await prisma.user.findUnique({ where: { email } })) redirect("/setup?err=taken");

  const user = await prisma.user.create({
    data: { email, name, role: "admin", passwordHash: await bcrypt.hash(password, 10) },
  });

  await setSessionCookie(user.id, user.sessionVersion);
  redirect("/");
}

/** Change your own password — requires confirming the current one. */
export async function changeMyPassword(formData: FormData) {
  const me = await requireUser();
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("password") ?? "");

  const ok = !!me.passwordHash && (await bcrypt.compare(current, me.passwordHash));
  if (!ok) redirect("/profile?pw=bad");
  if (!isValidPassword(next)) redirect("/profile?pw=weak");

  // Clear any admin-set force-change flag: choosing your own password satisfies it. Bumping
  // sessionVersion revokes every other device's cookie ("sign out everywhere"); we then
  // re-issue this device's cookie at the new version so the user isn't logged out here.
  const updated = await prisma.user.update({
    where: { id: me.id },
    data: {
      passwordHash: await bcrypt.hash(next, 10),
      mustChangePassword: false,
      sessionVersion: { increment: 1 },
    },
  });
  await setSessionCookie(updated.id, updated.sessionVersion);
  redirect("/profile?pw=ok");
}

/**
 * The forced-change flow shown by the app layout when `mustChangePassword` is set (after
 * an admin reset). Same checks as changeMyPassword but toast-based (ToastForm), and it
 * redirects home on success — clearing the flag lets the layout render the app again.
 */
export async function forcePasswordChange(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const okCurrent = !!me.passwordHash && (await bcrypt.compare(current, me.passwordHash));
  if (!okCurrent) return fail("Current password is incorrect");
  if (!isValidPassword(next)) return fail("New password must be 8–72 characters");
  if (next !== confirm) return fail("New passwords don't match");
  if (next === current) return fail("Choose a password different from the temporary one");

  // Bump sessionVersion to revoke any other sessions, then re-issue this device's cookie
  // at the new version (same as changeMyPassword) so the redirect home stays authenticated.
  const updated = await prisma.user.update({
    where: { id: me.id },
    data: {
      passwordHash: await bcrypt.hash(next, 10),
      mustChangePassword: false,
      sessionVersion: { increment: 1 },
    },
  });
  await setSessionCookie(updated.id, updated.sessionVersion);
  // The (app) layout gate (layout.tsx) is cached per-route in the client Router Cache;
  // without invalidating it, redirecting to "/" replays the cached "must change password"
  // screen forever (the loop). Revalidate the layout so the gate re-reads the cleared flag.
  revalidatePath("/", "layout");
  redirect("/");
  return ok(); // unreachable (redirect throws) — satisfies the ActionResult return type
}
