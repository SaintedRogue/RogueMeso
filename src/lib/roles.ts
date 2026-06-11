// The instance's role vocabulary. `User.role` is a plain String column (no DB enum, to
// avoid migration churn), so this module is the single source of truth that keeps it
// honest: every assignment goes through `Role`, and the admin guards below are pure so
// they're unit-tested in isolation from Prisma.

export const ROLES = ["admin", "user"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/** Display label for a role, for chips/menus. */
export function roleLabel(role: string): string {
  return role === "admin" ? "Admin" : "Member";
}

export function isAdmin(user: { role: string }): boolean {
  return user.role === "admin";
}

/**
 * Whether a user currently counts toward the live-admin pool. An admin who is
 * deactivated does NOT count — they can't sign in, so they can't administer.
 */
export function isActiveAdmin(user: { role: string; active: boolean }): boolean {
  return user.role === "admin" && user.active;
}

/**
 * Would removing `target` from the active-admin pool leave the instance with zero
 * admins? `otherActiveAdmins` is the count of OTHER users who are active admins. This
 * one guard backs demote, deactivate, AND delete — each strips a user's admin coverage,
 * and none may take the last one. A target who isn't currently an active admin can never
 * orphan the pool, so the action is always allowed for them.
 */
export function wouldOrphanAdmins(
  target: { role: string; active: boolean },
  otherActiveAdmins: number,
): boolean {
  return isActiveAdmin(target) && otherActiveAdmins <= 0;
}
