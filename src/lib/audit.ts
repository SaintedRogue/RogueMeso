import { prisma } from "@/lib/prisma";

// Append-only audit trail for admin actions on users. Labels are snapshotted at write
// time (see the AuditLog model) so an entry stays readable after the actor or target is
// deleted. Writing is best-effort from the caller's perspective: the admin action itself
// has already committed by the time we log, so a logging failure must never throw back
// into (and roll back) the action — callers wrap recordAudit in try/catch.

/** The action vocabulary. Keeping these as constants prevents drift between writers. */
export const AUDIT_ACTIONS = {
  create: "user.create",
  edit: "user.edit",
  roleSet: "user.role.set",
  activate: "user.activate",
  deactivate: "user.deactivate",
  passwordReset: "user.password.reset",
  delete: "user.delete",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/** Human label for the feed. Pure — derived from the stored action string. */
export function auditActionLabel(action: string): string {
  switch (action) {
    case AUDIT_ACTIONS.create: return "created";
    case AUDIT_ACTIONS.edit: return "edited";
    case AUDIT_ACTIONS.roleSet: return "changed role of";
    case AUDIT_ACTIONS.activate: return "reactivated";
    case AUDIT_ACTIONS.deactivate: return "deactivated";
    case AUDIT_ACTIONS.passwordReset: return "reset password for";
    case AUDIT_ACTIONS.delete: return "deleted";
    default: return action;
  }
}

type Person = { id: number; name: string | null; email: string };
function label(u: { name: string | null; email: string }): string {
  return u.name?.trim() || u.email;
}

/** Record one admin action. Never throws — a failed log can't undo the action it describes. */
export async function recordAudit(
  actor: Person,
  action: AuditAction,
  target?: Person | null,
  detail?: string,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorLabel: label(actor),
        action,
        targetUserId: target?.id ?? null,
        targetLabel: target ? label(target) : null,
        detail: detail ?? null,
      },
    });
  } catch {
    // swallow — auditing is observational, not transactional
  }
}

export type AuditEntry = {
  id: number;
  actorLabel: string;
  action: string;
  targetLabel: string | null;
  detail: string | null;
  createdAt: string; // ISO — formatted relative on render
};

/** Most recent admin actions, newest first, for the admin Users page. */
export async function getRecentAudit(limit = 20): Promise<AuditEntry[]> {
  const rows = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  return rows.map((r) => ({
    id: r.id,
    actorLabel: r.actorLabel,
    action: r.action,
    targetLabel: r.targetLabel,
    detail: r.detail,
    createdAt: r.createdAt.toISOString(),
  }));
}
