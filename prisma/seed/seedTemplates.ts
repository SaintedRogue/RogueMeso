// Seed the program-template library from the seed data (days -> slots, priorities).
import { prisma, readJson, listJson, muscleGroupMap, exerciseMap, MG_PRIORITY } from "./_shared";
import type { MgPriority } from "@prisma/client";

type IndexEntry = { id: number; key: string; frequency: number | null };
type RawSlot = { position: number; muscleGroupId: number; exerciseId: number | null };
type RawDay = { position: number; slots: RawSlot[] };
type RawPriority = { muscleGroupId: number; mgPriorityType: string };
type RawTemplate = {
  id: number; key: string; name: string; emphasis: string; sex: string;
  sourceTemplateId: number | null;
  days: RawDay[];
  priorities: Record<string, RawPriority>;
};

export async function seedTemplates() {
  const index = readJson<IndexEntry[]>("templates-index.json");
  const freqByKey = new Map(index.map((t) => [t.key, t.frequency]));
  const mg = await muscleGroupMap();
  const ex = await exerciseMap();

  let count = 0;
  for (const file of listJson("templates")) {
    const t = readJson<RawTemplate>("templates", file.split("/").pop()!);

    const days = [...t.days]
      .sort((a, b) => a.position - b.position)
      .map((d) => ({
        position: d.position,
        slots: {
          create: [...d.slots]
            .sort((a, b) => a.position - b.position)
            .map((s) => ({
              position: s.position,
              muscleGroupId: mustGet(mg, s.muscleGroupId, `muscleGroup ${s.muscleGroupId}`),
              exerciseId: s.exerciseId == null ? null : mustGet(ex, s.exerciseId, `exercise ${s.exerciseId}`),
            })),
        },
      }));

    const priorities = Object.values(t.priorities ?? {})
      .filter((p) => MG_PRIORITY.has(p.mgPriorityType))
      .map((p) => ({
        muscleGroupId: mustGet(mg, p.muscleGroupId, `muscleGroup ${p.muscleGroupId}`),
        priority: p.mgPriorityType as MgPriority,
      }));

    // idempotent: replace any existing template with this key
    await prisma.template.deleteMany({ where: { key: t.key } });
    await prisma.template.create({
      data: {
        sourceId: t.id,
        key: t.key,
        name: t.name,
        emphasis: t.emphasis,
        sex: t.sex,
        frequency: freqByKey.get(t.key) ?? null,
        sourceTemplateId: t.sourceTemplateId ?? null,
        days: { create: days },
        priorities: { create: priorities },
      },
    });
    count++;
  }

  const [tpl, slots] = await Promise.all([prisma.template.count(), prisma.templateSlot.count()]);
  console.log(`seedTemplates: ${count} templates created (${tpl} total, ${slots} slots)`);
  return { count };
}

function mustGet(m: Map<number, number>, k: number, label: string): number {
  const v = m.get(k);
  if (v == null) throw new Error(`Unresolved ${label}`);
  return v;
}

if (require.main === module) {
  seedTemplates()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
