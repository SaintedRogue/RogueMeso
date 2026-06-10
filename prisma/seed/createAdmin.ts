// Create the first (admin) user and migrate existing mesocycles under it.
// Idempotent: safe to re-run. Admin identity comes from env (with sensible defaults).
import bcrypt from "bcryptjs";
import { prisma } from "./_shared";

const EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
const NAME = process.env.ADMIN_NAME ?? "Admin";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "changeme";

export async function createAdmin() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const admin = await prisma.user.upsert({
    where: { email: EMAIL },
    create: { email: EMAIL, name: NAME, role: "admin", passwordHash },
    update: { role: "admin", name: NAME }, // keep existing password on re-run
  });
  console.log(`admin: #${admin.id} ${admin.email} (${admin.role})`);

  // Backfill: assign any unowned mesocycles to the admin (one-time migration of imported data).
  const res = await prisma.mesocycle.updateMany({ where: { userId: null }, data: { userId: admin.id } });
  console.log(`backfilled ${res.count} mesocycle(s) -> admin`);

  const owned = await prisma.mesocycle.count({ where: { userId: admin.id } });
  const sharedTpl = await prisma.template.count({ where: { userId: null } });
  console.log(`admin now owns ${owned} mesocycles; ${sharedTpl} templates remain shared`);
  return admin;
}

if (require.main === module) {
  createAdmin()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
