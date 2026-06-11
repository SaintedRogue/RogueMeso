import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRecentAudit, auditActionLabel } from "@/lib/audit";
import { timeAgo } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { AddUserForm } from "@/components/admin/AddUserForm";
import { UserBadges } from "@/components/admin/UserBadges";

export default async function AdminUsersPage() {
  const me = await requireAdmin();
  const [users, audit] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, name: true, role: true, active: true },
    }),
    getRecentAudit(15),
  ]);

  return (
    <>
      <PageHeader title="Users" subtitle={`${users.length} account${users.length === 1 ? "" : "s"} · admin only`} />

      <div className="max-w-2xl space-y-6">
        <AddUserForm />

        <div className="card divide-y divide-line/60">
          {users.map((u) => (
            <Link
              key={u.id}
              href={`/admin/users/${u.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-line/20"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{u.name ?? u.email}</span>
                  <UserBadges role={u.role} active={u.active} isSelf={u.id === me.id} />
                </div>
                <div className="truncate text-xs text-muted">{u.email}</div>
              </div>
              <ChevronRight aria-hidden size={18} className="shrink-0 text-muted" />
            </Link>
          ))}
        </div>

        {audit.length > 0 && (
          <div className="card p-5">
            <div className="mb-3 text-sm font-semibold">Recent activity</div>
            <ul className="space-y-2 text-xs text-muted">
              {audit.map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    <span className="font-medium text-text">{a.actorLabel}</span> {auditActionLabel(a.action)}
                    {a.targetLabel ? <span className="font-medium text-text"> {a.targetLabel}</span> : null}
                    {a.detail ? <span className="text-muted/80"> ({a.detail})</span> : null}
                  </span>
                  <span className="shrink-0 text-muted/70">{timeAgo(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
