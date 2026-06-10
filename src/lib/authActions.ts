"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { SESSION_COOKIE, signSession } from "@/lib/session";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = !!user?.passwordHash && (await bcrypt.compare(password, user.passwordHash));
  if (!ok || !user) redirect("/login?error=1");

  (await cookies()).set(SESSION_COOKIE, await signSession(process.env.AUTH_SECRET ?? "", user.id), {
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

/** Change your own password. */
export async function changeMyPassword(formData: FormData) {
  const me = await requireUser();
  const password = String(formData.get("password") ?? "");
  if (password.length < 4) return;
  await prisma.user.update({ where: { id: me.id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  revalidatePath("/profile");
}
