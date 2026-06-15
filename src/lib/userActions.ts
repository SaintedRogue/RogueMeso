"use server";

import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { isValidPassword } from "@/lib/password";
import { isRole, roleLabel, wouldOrphanAdmins } from "@/lib/roles";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actionResult";

// Admin-only user management. Every export gates on requireAdmin() first. Mutations that
// strip a user's admin coverage (role change, deactivate, delete) run the last-admin
// guard so the instance can never be locked out, and admins can't act destructively on
// their own account. Each mutation records an audit entry (best-effort, never throws).

const SELECT = { id: true, email: true, name: true, role: true, active: true, unit: true } as const;

type TargetUser = Prisma.UserGetPayload<{ select: typeof SELECT }>;

/**
 * Run a mutation that strips a user's admin coverage (demote/deactivate/delete) inside a
 * serializable transaction, re-counting active admins under that isolation so two admins
 * acting concurrently can't both pass the last-admin check and orphan the instance. The
 * count+write are atomic; on a guard failure nothing is written. Returns false if blocked.
 */
async function guardedAdminMutation(
  target: TargetUser,
  write: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<boolean> {
  return prisma.$transaction(
    async (tx) => {
      const others = await tx.user.count({ where: { role: "admin", active: true, id: { not: target.id } } });
      if (wouldOrphanAdmins(target, others)) return false;
      await write(tx);
      return true;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

function revalidateUser(id: number) {
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${id}`);
}

export async function createUser(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim() || null;
  const password = String(formData.get("password") ?? "");
  if (!email) return fail("Email is required");
  if (!isValidPassword(password)) return fail("Password must be 8–72 characters");
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return fail("That email is already in use");
  // New members get a temp password and must choose their own on first login.
  const created = await prisma.user.create({
    data: {
      email,
      name,
      role: "user",
      passwordHash: await bcrypt.hash(password, 10),
      mustChangePassword: true,
    },
    select: SELECT,
  });
  await recordAudit(me, AUDIT_ACTIONS.create, created, "as member");
  revalidatePath("/admin/users");
  return ok(`Added ${name ?? email}`);
}

/** Edit a user's profile fields (name, email, default unit). */
export async function updateUserProfile(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return fail("Bad request");
  const target = await prisma.user.findUnique({ where: { id }, select: SELECT });
  if (!target) return fail("User not found");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim() || null;
  const unit = String(formData.get("unit")) === "kg" ? "kg" : "lb";
  if (!email || !email.includes("@")) return fail("A valid email is required");

  const clash = await prisma.user.findUnique({ where: { email } });
  if (clash && clash.id !== id) return fail("That email is already in use");

  const changed = [
    email !== target.email && "email",
    (name ?? "") !== (target.name ?? "") && "name",
    unit !== target.unit && "unit",
  ].filter(Boolean) as string[];
  if (changed.length === 0) return ok("No changes");

  await prisma.user.update({ where: { id }, data: { email, name, unit } });
  await recordAudit(me, AUDIT_ACTIONS.edit, target, changed.join(", "));
  revalidateUser(id);
  return ok("Profile saved");
}

/** Promote/demote a user. Can't change your own role; can't demote the last admin. */
export async function setUserRole(id: number, role: string): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!isRole(role)) return fail("Unknown role");
  if (id === me.id) return fail("You can't change your own role");
  const target = await prisma.user.findUnique({ where: { id }, select: SELECT });
  if (!target) return fail("User not found");
  if (target.role === role) return ok(`Already ${roleLabel(role).toLowerCase()}`);

  // Demoting an admin re-checks the active-admin pool atomically (last-admin guard).
  const done = await guardedAdminMutation(target, (tx) => tx.user.update({ where: { id }, data: { role } }).then(() => {}));
  if (!done) return fail("Can't remove the last admin");

  await recordAudit(me, AUDIT_ACTIONS.roleSet, target, `${target.role} → ${role}`);
  revalidateUser(id);
  return ok(`${target.name ?? target.email} is now ${roleLabel(role).toLowerCase()}`);
}

/** Deactivate (soft disable) or reactivate a user. Can't deactivate yourself or the last admin. */
export async function setUserActive(id: number, active: boolean): Promise<ActionResult> {
  const me = await requireAdmin();
  if (id === me.id) return fail("You can't deactivate your own account");
  const target = await prisma.user.findUnique({ where: { id }, select: SELECT });
  if (!target) return fail("User not found");
  if (target.active === active) return ok(active ? "Already active" : "Already deactivated");

  if (active) {
    // Reactivating can never orphan the admin pool — no guard needed.
    await prisma.user.update({ where: { id }, data: { active: true } });
  } else {
    const done = await guardedAdminMutation(target, (tx) => tx.user.update({ where: { id }, data: { active: false } }).then(() => {}));
    if (!done) return fail("Can't deactivate the last admin");
  }
  await recordAudit(me, active ? AUDIT_ACTIONS.activate : AUDIT_ACTIONS.deactivate, target);
  revalidateUser(id);
  return ok(active ? "Account reactivated" : "Account deactivated");
}

/** Reset a user's password to a temp value; forces them to set their own on next login. */
export async function resetUserPassword(id: number, password: string): Promise<ActionResult> {
  const me = await requireAdmin();
  if (id === me.id) return fail("Use your profile page to change your own password");
  if (!isValidPassword(password)) return fail("Password must be 8–72 characters");
  const target = await prisma.user.findUnique({ where: { id }, select: SELECT });
  if (!target) return fail("User not found");
  // Bumping sessionVersion revokes the target's existing cookies — exactly what a reset
  // should do, since the point is to lock out whoever currently holds the old credentials.
  await prisma.user.update({
    where: { id },
    data: {
      passwordHash: await bcrypt.hash(password, 10),
      mustChangePassword: true,
      sessionVersion: { increment: 1 },
    },
  });
  await recordAudit(me, AUDIT_ACTIONS.passwordReset, target);
  revalidateUser(id);
  return ok("Password reset — they'll set a new one at next login");
}

/** Delete a user and all their owned data. Can't delete yourself or the last admin.
 *  Returns an ActionResult; the client navigates back to the list on success (no redirect
 *  here — a thrown redirect inside the caller's transition would swallow the result). */
export async function deleteUser(id: number): Promise<ActionResult> {
  const me = await requireAdmin();
  if (id === me.id) return fail("You can't delete your own account");
  const target = await prisma.user.findUnique({ where: { id }, select: SELECT });
  if (!target) return fail("User not found");

  // Atomic: the last-admin re-check and the whole manual cascade commit together, so a
  // crash mid-delete can't leave a half-deleted user. Mesocycles/templates have nullable
  // userId (no DB cascade) so they're deleted explicitly; activities/reactions/weight
  // entries/push rows cascade at the DB level on user.delete.
  const done = await guardedAdminMutation(target, async (tx) => {
    await tx.mesocycle.deleteMany({ where: { userId: id } });
    await tx.template.deleteMany({ where: { userId: id } });
    await tx.exercise.deleteMany({ where: { userId: id } });
    await tx.user.delete({ where: { id } });
  });
  if (!done) return fail("Can't delete the last admin");

  await recordAudit(me, AUDIT_ACTIONS.delete, target);
  revalidatePath("/admin/users");
  return ok(`Deleted ${target.name ?? target.email}`);
}
