"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { isValidPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export async function createUser(formData: FormData) {
  await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim() || null;
  const password = String(formData.get("password") ?? "");
  if (!email || !isValidPassword(password)) return;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return; // ignore duplicate emails
  await prisma.user.create({
    data: { email, name, role: "user", passwordHash: await bcrypt.hash(password, 10) },
  });
  revalidatePath("/admin/users");
}

export async function resetUserPassword(id: number, password: string) {
  await requireAdmin();
  if (!isValidPassword(password)) return;
  await prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  revalidatePath("/admin/users");
}

/** Delete a user and all their owned data. Cannot delete yourself. */
export async function deleteUser(id: number) {
  const me = await requireAdmin();
  if (id === me.id) throw new Error("Cannot delete yourself");
  // Mesocycles cascade to days/exercises/sets; templates cascade to slots; then custom exercises.
  await prisma.mesocycle.deleteMany({ where: { userId: id } });
  await prisma.template.deleteMany({ where: { userId: id } });
  await prisma.exercise.deleteMany({ where: { userId: id } });
  await prisma.user.delete({ where: { id } });
  revalidatePath("/admin/users");
}
