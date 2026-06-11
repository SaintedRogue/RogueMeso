import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateUserProfile } from "@/lib/userActions";
import { timeAgo } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { ToastForm } from "@/components/forms";
import { UserAdminControls } from "@/components/admin/UserAdminControls";
import { UserBadges } from "@/components/admin/UserBadges";

export default async function AdminUserDetail({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, email: true, name: true, role: true, active: true, unit: true,
      mustChangePassword: true, communityOptIn: true, createdAt: true,
      _count: { select: { mesocycles: true, templates: true, exercises: true } },
    },
  });
  if (!user) notFound();

  const label = user.name ?? user.email;
  const isSelf = user.id === me.id;

  return (
    <>
      <Link href="/admin/users" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft size={16} /> All users
      </Link>
      <PageHeader title={label} subtitle={user.email}>
        <div className="flex items-center gap-2">
          <UserBadges role={user.role} active={user.active} isSelf={isSelf} />
        </div>
      </PageHeader>

      <div className="max-w-2xl space-y-6">
        <ToastForm action={updateUserProfile} submitLabel="Save profile" className="card space-y-3 p-5">
          <div className="text-sm font-semibold">Profile</div>
          <input type="hidden" name="id" value={user.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Name</span>
              <input className="input" name="name" defaultValue={user.name ?? ""} placeholder="Name" autoComplete="off" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Email</span>
              <input className="input" name="email" type="email" defaultValue={user.email} required autoComplete="off" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Default unit</span>
            <select className="input" name="unit" defaultValue={user.unit}>
              <option value="lb">lb</option>
              <option value="kg">kg</option>
            </select>
          </label>
        </ToastForm>

        <UserAdminControls userId={user.id} role={user.role} active={user.active} isSelf={isSelf} label={label} />

        <div className="card space-y-1.5 p-5 text-xs text-muted">
          <div className="mb-1 text-sm font-semibold text-text">Account</div>
          <div>Joined {timeAgo(user.createdAt.toISOString())}</div>
          <div>Community: {user.communityOptIn ? "opted in" : "not participating"}</div>
          {user.mustChangePassword && <div className="text-accent">Must set a new password at next login</div>}
          <div>
            Owns {user._count.mesocycles} mesocycle{user._count.mesocycles === 1 ? "" : "s"},{" "}
            {user._count.templates} template{user._count.templates === 1 ? "" : "s"},{" "}
            {user._count.exercises} custom exercise{user._count.exercises === 1 ? "" : "s"}
          </div>
        </div>
      </div>
    </>
  );
}
