// Seed muscle groups + exercise catalog from the seed data.
import { prisma, readJson, mapExerciseType } from "./_shared";

type RawExercise = {
  id: number;
  name: string;
  muscleGroupId: number;
  exerciseType: string;
  youtubeId?: string | null;
  notes?: unknown; // source data sends an array; we stringify if non-empty, else null
};

/** Coerce a possibly non-string value to String|null for storage. */
function asNotes(v: unknown): string | null {
  if (typeof v === "string") return v.length ? v : null;
  if (Array.isArray(v)) return v.length ? JSON.stringify(v) : null;
  if (v && typeof v === "object") return JSON.stringify(v);
  return null;
}

export async function seedReference() {
  // Muscle groups: { "1": "Chest", ... }
  const mgs = readJson<Record<string, string>>("reference", "muscle-groups.json");
  for (const [srcId, name] of Object.entries(mgs)) {
    await prisma.muscleGroup.upsert({
      where: { sourceId: Number(srcId) },
      create: { sourceId: Number(srcId), name },
      update: { name },
    });
  }
  const mgBySource = new Map(
    (await prisma.muscleGroup.findMany({ select: { id: true, sourceId: true } })).map((m) => [m.sourceId, m.id]),
  );

  // Exercises
  const exercises = readJson<RawExercise[]>("reference", "exercises.json");
  for (const e of exercises) {
    const muscleGroupId = mgBySource.get(e.muscleGroupId);
    if (!muscleGroupId) throw new Error(`Exercise ${e.id} references unknown muscleGroupId ${e.muscleGroupId}`);
    await prisma.exercise.upsert({
      where: { sourceId: e.id },
      create: {
        sourceId: e.id,
        name: e.name,
        muscleGroupId,
        exerciseType: mapExerciseType(e.exerciseType),
        youtubeId: e.youtubeId ?? null,
        notes: asNotes(e.notes),
      },
      update: {
        name: e.name,
        muscleGroupId,
        exerciseType: mapExerciseType(e.exerciseType),
        youtubeId: e.youtubeId ?? null,
      },
    });
  }

  const [mgCount, exCount] = await Promise.all([prisma.muscleGroup.count(), prisma.exercise.count()]);
  console.log(`seedReference: ${mgCount} muscle groups, ${exCount} exercises`);
  return { mgCount, exCount };
}

if (require.main === module) {
  seedReference()
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
