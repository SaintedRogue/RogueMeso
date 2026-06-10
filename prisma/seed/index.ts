// Full seed: reference -> templates -> personal mesocycles. Idempotent.
import { prisma } from "./_shared";
import { seedReference } from "./seedReference";
import { seedTemplates } from "./seedTemplates";
import { importMesocycles } from "./importMesocycles";

async function main() {
  await seedReference();
  await seedTemplates();
  await importMesocycles();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
