"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getExercises } from "@/lib/data";
import { dedupeDays, recomputeDayStatus, revalidateMesoDays } from "@/lib/dayRollup";
import { assertDayExerciseOwner } from "@/lib/ownership";

/** Slim, serializable shape the SwapPanel renders — no raw DB rows. */
export type SwapCandidate = {
  id: number;
  name: string;
  exerciseType: string;
  muscleGroupId: number;
};

/**
 * Candidate exercises a `DayExercise` can be swapped to. Browsing is scoped to one muscle
 * group (defaults to the slot's own; the dropdown is the escape hatch), but a search query
 * spans the whole catalog so users can find a movement without first guessing its group.
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
  const q = search?.trim() || undefined;
  const list = await getExercises(me.id, q, q ? undefined : muscleGroupId);
  return list.map((e) => ({
    id: e.id,
    name: e.name,
    exerciseType: e.exerciseType,
    muscleGroupId: e.muscleGroupId,
  }));
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
  revalidateMesoDays(key, days);
}
