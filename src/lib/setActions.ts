"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { dedupeDays, recomputeDayStatus } from "@/lib/dayRollup";
import { nextSetData, reindex } from "@/lib/setOps";

type Scope = "day" | "meso";

/** Verify a DayExercise belongs to the user; return the coordinates add/remove need. */
async function assertDayExerciseOwner(dayExerciseId: number, userId: number) {
  const de = await prisma.dayExercise.findUnique({
    where: { id: dayExerciseId },
    select: {
      exerciseId: true,
      day: {
        select: {
          week: true,
          position: true,
          mesoId: true,
          meso: { select: { key: true, unit: true, userId: true } },
        },
      },
    },
  });
  if (!de || de.day.meso.userId !== userId) throw new Error("Forbidden");
  return de;
}

/** Every later occurrence of an exercise: remaining slots this week + all future weeks.
 *  Anchored after (week, position) so past/logged days are never touched. */
function laterOccurrences(exerciseId: number, mesoId: number, week: number, position: number) {
  return {
    exerciseId,
    day: { mesoId, OR: [{ week: { gt: week } }, { week, position: { gt: position } }] },
  };
}

/** Recompute roll-up status for every day the given groups belong to, then revalidate. */
async function finalize(mesoId: number, key: string, groupIds: number[]) {
  const groups = await prisma.dayExercise.findMany({
    where: { id: { in: groupIds } },
    select: { day: { select: { week: true, position: true } } },
  });
  const days = dedupeDays(groups.map((g) => g.day));
  for (const d of days) await recomputeDayStatus(mesoId, d.week, d.position);
  revalidatePath("/");
  revalidatePath(`/mesocycles/${key}`);
  for (const d of days) revalidatePath(`/mesocycles/${key}/${d.week}/${d.position}`);
}

/**
 * Add a set to an exercise group. `scope`:
 *  - "day":  just this group.
 *  - "meso": this group + every later occurrence of the same exercise, so the added volume
 *            carries forward (past weeks left intact).
 * Each affected group gets one set appended, copying that group's own last set's targets.
 */
export async function addSet(dayExerciseId: number, scope: Scope) {
  const me = await requireUser();
  const de = await assertDayExerciseOwner(dayExerciseId, me.id);
  const { week, position, mesoId } = de.day;
  const { key, unit } = de.day.meso;

  let groupIds = [dayExerciseId];
  if (scope === "meso") {
    const later = await prisma.dayExercise.findMany({
      where: { ...laterOccurrences(de.exerciseId, mesoId, week, position), id: { not: dayExerciseId } },
      select: { id: true },
    });
    groupIds = [dayExerciseId, ...later.map((l) => l.id)];
  }

  const groups = await prisma.dayExercise.findMany({
    where: { id: { in: groupIds } },
    select: {
      id: true,
      sets: {
        select: { position: true, repsTarget: true, weightTarget: true, weightTargetMin: true, weightTargetMax: true, unit: true },
      },
    },
  });
  await prisma.$transaction(
    groups.map((g) => prisma.exerciseSet.create({ data: { dayExerciseId: g.id, ...nextSetData(g.sets, unit) } })),
  );

  await finalize(mesoId, key, groupIds);
}

/**
 * Remove a set. `scope`:
 *  - "day":  delete this exact set.
 *  - "meso": also drop one set (the last) from every later occurrence of the same exercise,
 *            reducing planned volume from here forward.
 * A group is never reduced below one set. Remaining positions are re-compacted so the set
 * numbering stays contiguous.
 */
export async function removeSet(setId: number, scope: Scope) {
  const me = await requireUser();
  const set = await prisma.exerciseSet.findUnique({
    where: { id: setId },
    select: {
      dayExerciseId: true,
      dayExercise: {
        select: {
          exerciseId: true,
          _count: { select: { sets: true } },
          day: {
            select: { week: true, position: true, mesoId: true, meso: { select: { key: true, userId: true } } },
          },
        },
      },
    },
  });
  if (!set || set.dayExercise.day.meso.userId !== me.id) throw new Error("Forbidden");
  if (set.dayExercise._count.sets <= 1) throw new Error("An exercise must keep at least one set.");

  const { week, position, mesoId } = set.dayExercise.day;
  const { key } = set.dayExercise.day.meso;

  // The exact set the user removed; plus the last set of each later group for "meso" scope.
  const setIds = [setId];
  const groupIds = [set.dayExerciseId];
  if (scope === "meso") {
    const later = await prisma.dayExercise.findMany({
      where: {
        ...laterOccurrences(set.dayExercise.exerciseId, mesoId, week, position),
        id: { not: set.dayExerciseId },
      },
      select: { id: true, sets: { select: { id: true, position: true } } },
    });
    for (const g of later) {
      if (g.sets.length <= 1) continue; // never reduce a group below one set
      const last = g.sets.reduce((a, b) => (b.position > a.position ? b : a));
      setIds.push(last.id);
      groupIds.push(g.id);
    }
  }

  // Re-check the floor and delete in one transaction so concurrent removes (double-tap,
  // two tabs) can't both pass a stale count and drain the group to zero sets.
  await prisma.$transaction(async (tx) => {
    const count = await tx.exerciseSet.count({ where: { dayExerciseId: set.dayExerciseId } });
    if (count <= 1) throw new Error("An exercise must keep at least one set.");
    await tx.exerciseSet.deleteMany({ where: { id: { in: setIds } } });
  });

  // Re-compact positions so each affected group stays contiguous and 0-based.
  const groups = await prisma.dayExercise.findMany({
    where: { id: { in: groupIds } },
    select: { sets: { select: { id: true, position: true } } },
  });
  const moves = groups.flatMap((g) => reindex(g.sets));
  if (moves.length) {
    await prisma.$transaction(
      moves.map((m) => prisma.exerciseSet.update({ where: { id: m.id }, data: { position: m.position } })),
    );
  }

  await finalize(mesoId, key, groupIds);
}
