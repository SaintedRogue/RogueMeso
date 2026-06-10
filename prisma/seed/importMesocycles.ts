// Import mesocycles (training history + logged sets) from the seed data.
import { prisma, readJson, listJson, muscleGroupMap, exerciseMap, MG_PRIORITY } from "./_shared";
import type { MgPriority, Unit } from "@prisma/client";

type RawSet = {
  position: number; setType: string;
  weight: number | null; weightTarget: number | null;
  weightTargetMin: number | null; weightTargetMax: number | null;
  reps: number | null; repsTarget: number | null;
  bodyweight: number | null; unit: string | null;
  status: string; finishedAt: string | null;
};
type RawDayExercise = {
  exerciseId: number; muscleGroupId: number; position: number;
  jointPain: number | null; status: string; sets: RawSet[];
};
type RawDay = {
  week: number; position: number; label: string | null; status: string;
  bodyweight: number | null; unit: string | null; notes: unknown; finishedAt: string | null;
  exercises: RawDayExercise[];
};
type RawMeso = {
  id: number; key: string; name: string; days: number; unit: string;
  microRirs: number | null; status: string; generatedFrom: string | null;
  sourceTemplateId: number | null; notes: unknown;
  createdAt: string; finishedAt: string | null; firstWorkoutCompletedAt: string | null;
  priorities: Record<string, { muscleGroupId: number; mgPriorityType: string }>;
  weeks: { days: RawDay[] }[];
};

const date = (s: string | null | undefined) => (s ? new Date(s) : null);
const notes = (v: unknown): string | null =>
  typeof v === "string" ? v || null : Array.isArray(v) ? (v.length ? JSON.stringify(v) : null) : v ? JSON.stringify(v) : null;
const unit = (u: string): Unit => (u === "kg" ? "kg" : "lb");

export async function importMesocycles() {
  const mg = await muscleGroupMap();
  const ex = await exerciseMap();
  const must = (m: Map<number, number>, k: number, label: string) => {
    const v = m.get(k);
    if (v == null) throw new Error(`Unresolved ${label}`);
    return v;
  };

  let count = 0;
  for (const file of listJson("mesocycles")) {
    const m = readJson<RawMeso>("mesocycles", file.split("/").pop()!);

    const days = m.weeks.flatMap((w) =>
      [...w.days]
        .sort((a, b) => a.position - b.position)
        .map((d) => ({
          week: d.week,
          position: d.position,
          label: d.label ?? null,
          status: d.status,
          bodyweight: d.bodyweight ?? null,
          bodyweightUnit: d.unit ?? null,
          notes: notes(d.notes),
          finishedAt: date(d.finishedAt),
          exercises: {
            create: [...d.exercises]
              .sort((a, b) => a.position - b.position)
              .map((e) => ({
                exerciseId: must(ex, e.exerciseId, `exercise ${e.exerciseId}`),
                muscleGroupId: must(mg, e.muscleGroupId, `muscleGroup ${e.muscleGroupId}`),
                position: e.position,
                jointPain: e.jointPain ?? null,
                status: e.status,
                sets: {
                  create: [...e.sets]
                    .sort((a, b) => a.position - b.position)
                    .map((s) => ({
                      position: s.position,
                      setType: s.setType ?? "regular",
                      weight: s.weight, weightTarget: s.weightTarget,
                      weightTargetMin: s.weightTargetMin, weightTargetMax: s.weightTargetMax,
                      reps: s.reps, repsTarget: s.repsTarget,
                      bodyweight: s.bodyweight, unit: s.unit,
                      status: s.status, finishedAt: date(s.finishedAt),
                    })),
                },
              })),
          },
        })),
    );

    const priorities = Object.values(m.priorities ?? {})
      .filter((p) => MG_PRIORITY.has(p.mgPriorityType))
      .map((p) => ({ muscleGroupId: must(mg, p.muscleGroupId, `mg ${p.muscleGroupId}`), priority: p.mgPriorityType as MgPriority }));

    await prisma.mesocycle.deleteMany({ where: { key: m.key } });
    await prisma.mesocycle.create({
      data: {
        sourceId: m.id, key: m.key, name: m.name,
        daysPerWeek: m.days, weeksCount: m.weeks.length, unit: unit(m.unit),
        microRirs: m.microRirs ?? null, status: m.status, generatedFrom: m.generatedFrom ?? null,
        sourceTemplateId: m.sourceTemplateId ?? null, notes: notes(m.notes),
        startedAt: date(m.firstWorkoutCompletedAt), finishedAt: date(m.finishedAt),
        createdAt: new Date(m.createdAt),
        priorities: { create: priorities },
        days: { create: days },
      },
    });
    count++;
    console.log(`  imported ${m.name} (${m.weeks.length} wk)`);
  }

  const [mc, sets] = await Promise.all([prisma.mesocycle.count(), prisma.exerciseSet.count()]);
  console.log(`importMesocycles: ${count} mesocycles (${mc} total, ${sets} sets)`);
  return { count };
}

if (require.main === module) {
  importMesocycles()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
