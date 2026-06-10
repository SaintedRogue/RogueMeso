import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { UsersAdmin } from "@/components/UsersAdmin";

export default async function AdminUsersPage() {
  const me = await requireAdmin();
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, role: true },
  });

  return (
    <>
      <PageHeader title="Users" subtitle={`${users.length} account${users.length === 1 ? "" : "s"} · admin only`} />
      <UsersAdmin users={users} meId={me.id} />
    </>
  );
}
