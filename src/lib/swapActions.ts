"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getExercises } from "@/lib/data";
import { rolledUpDayStatus } from "@/lib/dayStatus";

/** Slim, serializable shape the SwapPanel renders — no raw DB rows. */
export type SwapCandidate = {
  id: number;
  name: string;
  exerciseType: string;
  muscleGroupId: number;
};

/**
 * Candidate exercises a `DayExercise` can be swapped to, scoped to one muscle group
 * (defaults to the slot's own group; the picker can pass another for the escape hatch).
 * Auth + ownership are enforced here; the picker is a client component so it can't read
 * the DB directly. Mirrors getTemplatePreview: we map to a minimal shape so only what the
 * UI draws crosses the wire.
 */
export async function getSwapCandidates(
  dayExerciseId: number,
  muscleGroupId: number,
  search?: string,
): Promise<SwapCandidate[]> {
  const me = await requireUser();
  await assertDayExerciseOwner(dayExerciseId, me.id);
  const list = await getExercises(me.id, search?.trim() || undefined, muscleGroupId);
  return list.map((e) => ({
    id: e.id,
    name: e.name,
    exerciseType: e.exerciseType,
    muscleGroupId: e.muscleGroupId,
  }));
}

/** Verify a DayExercise belongs to the user and return the coordinates a swap needs. */
async function assertDayExerciseOwner(dayExerciseId: number, userId: number) {
  const de = await prisma.dayExercise.findUnique({
    where: { id: dayExerciseId },
    select: {
      exerciseId: true,
      day: { select: { week: true, position: true, mesoId: true, meso: { select: { key: true, userId: true } } } },
    },
  });
  if (!de || de.day.meso.userId !== userId) throw new Error("Forbidden");
  return de;
}

/** Reset a set of DayExercises onto a new exercise: keep set count, clear logged values.
 *  Both writes run in one transaction so a partial failure can't leave a slot pointing at
 *  the old exercise with its sets already wiped. */
async function applySwap(dayExerciseIds: number[], newExerciseId: number, newMuscleGroupId: number) {
  await prisma.$transaction([
    prisma.exerciseSet.updateMany({
      where: { dayExerciseId: { in: dayExerciseIds } },
      data: { weight: null, reps: null, status: "pendingWeight", finishedAt: null },
    }),
    prisma.dayExercise.updateMany({
      where: { id: { in: dayExerciseIds } },
      data: { exerciseId: newExerciseId, muscleGroupId: newMuscleGroupId, status: "pending" },
    }),
  ]);
}

/**
 * Swap the exercise on a DayExercise. `scope`:
 *  - "day":  just this row.
 *  - "meso": every occurrence of the *old* exercise from this day forward (this week's
 *            remaining slots + all future weeks). Past/logged weeks are left intact so
 *            history is preserved.
 *
 * In both cases the set count is kept and logged weight/reps are cleared — the numbers
 * belonged to the old movement. The muscle group is taken from the new exercise so the
 * escape-hatch (cross-group) swap stays consistent.
 */
export async function swapExercise(dayExerciseId: number, newExerciseId: number, scope: "day" | "meso") {
  const me = await requireUser();
  const de = await assertDayExerciseOwner(dayExerciseId, me.id);

  // The new exercise must be in the shared catalog or owned by this user.
  const next = await prisma.exercise.findFirst({
    where: { id: newExerciseId, OR: [{ userId: null }, { userId: me.id }] },
    select: { id: true, muscleGroupId: true },
  });
  if (!next) throw new Error("Forbidden");

  const { week, position, mesoId } = de.day;
  const key = de.day.meso.key;

  // Resolve which DayExercise rows to swap, and the days that need revalidating.
  // Always include the exact row the user tapped. For "meso" scope, also every *later*
  // occurrence of the old exercise (later days this week + all future weeks). Anchoring
  // the current day to the tapped row — rather than matching exerciseId on it — means a
  // second slot that happens to use the same exercise today is left untouched.
  const current = { id: dayExerciseId, day: { week, position } };
  let targets: { id: number; day: { week: number; position: number } }[];
  if (scope === "meso") {
    const later = await prisma.dayExercise.findMany({
      where: {
        exerciseId: de.exerciseId,
        day: {
          mesoId,
          OR: [{ week: { gt: week } }, { week, position: { gt: position } }],
        },
      },
      select: { id: true, day: { select: { week: true, position: true } } },
    });
    targets = [current, ...later];
  } else {
    targets = [current];
  }

  await applySwap(targets.map((t) => t.id), next.id, next.muscleGroupId);

  // Recompute each affected day's roll-up status, then refresh the pages that render them.
  const days = dedupeDays(targets.map((t) => t.day));
  for (const d of days) await recomputeDayStatus(mesoId, d.week, d.position);
  revalidatePath("/");
  revalidatePath(`/mesocycles/${key}`);
  for (const d of days) revalidatePath(`/mesocycles/${key}/${d.week}/${d.position}`);
}

function dedupeDays(days: { week: number; position: number }[]) {
  const seen = new Map<string, { week: number; position: number }>();
  for (const d of days) seen.set(`${d.week}:${d.position}`, d);
  return [...seen.values()];
}

/** Recompute one day's roll-up status after a swap reset its sets. */
async function recomputeDayStatus(mesoId: number, week: number, position: number) {
  const day = await prisma.mesoDay.findFirst({
    where: { mesoId, week, position },
    include: { exercises: { include: { sets: { select: { status: true } } } } },
  });
  if (!day) return;
  const status = rolledUpDayStatus(day.exercises, day.status);
  await prisma.mesoDay.update({
    where: { id: day.id },
    data: { status, finishedAt: status === "complete" ? day.finishedAt ?? new Date() : null },
  });
}
