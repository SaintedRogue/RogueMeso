"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { isValidPassword } from "@/lib/password";
import { SESSION_COOKIE, signSession } from "@/lib/session";

// A throwaway bcrypt hash compared against when no user matches, so a missing
// account takes the same time as a wrong password (no email-enumeration oracle).
const DUMMY_HASH = "$2b$10$B7W7L6yVOGjEhRXdChRRveK1F3ye5fiBTMQgovc/.DSnp0oJDlyES";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const user = await prisma.user.findUnique({ where: { email } });
  // Always run a compare so timing doesn't reveal whether the email exists.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!ok || !user?.passwordHash) redirect("/login?error=1");

  (await cookies()).set(SESSION_COOKIE, await signSession(user.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
    secure: process.env.NODE_ENV === "production",
  });
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

  (await cookies()).set(SESSION_COOKIE, await signSession(user.id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
    secure: process.env.NODE_ENV === "production",
  });
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

  await prisma.user.update({ where: { id: me.id }, data: { passwordHash: await bcrypt.hash(next, 10) } });
  redirect("/profile?pw=ok");
}
