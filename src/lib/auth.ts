import { cache } from "react";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

/**
 * The signed-in user, or null. Wrapped in React.cache() so the layout + page (+
 * any other callers) in a single request share one DB lookup instead of each
 * re-querying. The cache is per-request, so it never leaks between users.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.uid } });
  // A deactivated account is treated as signed-out even with a valid cookie, so an
  // admin's deactivation takes effect on the user's very next request (requireUser
  // then bounces them to /login, where login() also refuses them).
  if (!user?.active) return null;
  // Sessions are stateless, so a password change can't delete old cookies directly. Instead
  // each password change/reset bumps User.sessionVersion; a token minted before that bump
  // now carries a stale `ver` and is rejected here — "sign out everywhere" on credential change.
  if (user.sessionVersion !== session.ver) return null;
  return user;
});

/** Require a signed-in user (used by pages + every mutating Server Action). */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Require an admin user (gates user-management). */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") notFound();
  return user;
}
