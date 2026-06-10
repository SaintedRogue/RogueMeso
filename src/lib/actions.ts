"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

const DONE = new Set(["complete", "skipped"]);

/** A logged set is rendered on the home screen, the meso detail, and the day page — refresh just those. */
function revalidateForDay(info: { key: string; week: number; position: number }) {
  revalidatePath("/");
  revalidatePath(`/mesocycles/${info.key}`);
  revalidatePath(`/mesocycles/${info.key}/${info.week}/${info.position}`);
}

/** Verify the set belongs to the given user (set -> dayExercise -> day -> meso.userId). */
async function assertSetOwner(setId: number, userId: number) {
  const set = await prisma.exerciseSet.findUnique({
    where: { id: setId },
    select: { dayExercise: { select: { day: { select: { meso: { select: { userId: true } } } } } } },
  });
  if (!set || set.dayExercise.day.meso.userId !== userId) throw new Error("Forbidden");
}

/**
 * Recompute the exercise's and day's roll-up status after a set changes.
 * Returns the day's route coordinates (meso key / week / position) so callers
 * can revalidate the exact pages that render it, or null if the row is gone.
 */
async function recomputeRollups(dayExerciseId: number) {
  const ex = await prisma.dayExercise.findUnique({
    where: { id: dayExerciseId },
    include: {
      sets: true,
      day: { include: { meso: { select: { key: true } }, exercises: { include: { sets: true } } } },
    },
  });
  if (!ex) return null;

  const exDone = ex.sets.length > 0 && ex.sets.every((s) => DONE.has(s.status));
  const exStatus = exDone ? "complete" : ex.sets.some((s) => DONE.has(s.status)) ? "started" : "pending";
  await prisma.dayExercise.update({ where: { id: ex.id }, data: { status: exStatus } });

  const day = ex.day;
  const exStatuses = day.exercises.map((e) =>
    e.id === ex.id ? exStatus : e.sets.length > 0 && e.sets.every((s) => DONE.has(s.status)) ? "complete" : "pending",
  );
  const allComplete = exStatuses.length > 0 && exStatuses.every((s) => s === "complete");
  const anyStarted = day.exercises.some((e) => e.sets.some((s) => DONE.has(s.status)));
  const dayStatus = allComplete ? "complete" : anyStarted ? "partial" : day.status;
  const finishedAt = allComplete ? day.finishedAt ?? new Date() : null;
  await prisma.mesoDay.update({ where: { id: day.id }, data: { status: dayStatus, finishedAt } });

  return { key: day.meso.key, week: day.week, position: day.position };
}

export async function logSet(setId: number, weight: number | null, reps: number | null) {
  const me = await requireUser();
  await assertSetOwner(setId, me.id);
  const set = await prisma.exerciseSet.update({
    where: { id: setId },
    data: {
      weight,
      reps,
      status: weight != null && reps != null ? "complete" : "pendingWeight",
      finishedAt: weight != null && reps != null ? new Date() : null,
    },
    select: { dayExerciseId: true },
  });
  const info = await recomputeRollups(set.dayExerciseId);
  if (info) revalidateForDay(info);
}

export async function skipSet(setId: number) {
  const me = await requireUser();
  await assertSetOwner(setId, me.id);
  const set = await prisma.exerciseSet.update({
    where: { id: setId },
    data: { status: "skipped", finishedAt: new Date() },
    select: { dayExerciseId: true },
  });
  const info = await recomputeRollups(set.dayExerciseId);
  if (info) revalidateForDay(info);
}

export async function clearSet(setId: number) {
  const me = await requireUser();
  await assertSetOwner(setId, me.id);
  const set = await prisma.exerciseSet.update({
    where: { id: setId },
    data: { weight: null, reps: null, status: "pendingWeight", finishedAt: null },
    select: { dayExerciseId: true },
  });
  const info = await recomputeRollups(set.dayExerciseId);
  if (info) revalidateForDay(info);
}
