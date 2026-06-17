"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { maybePostWorkoutActivity, maybePostPrActivity } from "@/lib/features/community";
import { rolledUpDayStatus, DONE_STATUSES as DONE } from "@/lib/dayStatus";
import { revalidateMesoDays } from "@/lib/dayRollup";

/**
 * Post community feed activities for a set mutation, best-effort. The social layer is
 * purely additive: a failure here must never break logging, so we swallow + log it.
 * (Each writer is a no-op unless the user has opted into the community.)
 */
async function postCommunityActivity(dayId: number, userId: number, setId?: number) {
  try {
    await maybePostWorkoutActivity(dayId, userId);
    if (setId != null) await maybePostPrActivity(setId, userId);
  } catch (e) {
    console.error("[community] activity hook failed", e);
  }
}

/** A logged set is rendered on the home screen, the meso detail, and the day page — refresh just those. */
function revalidateForDay(info: { key: string; week: number; position: number }) {
  revalidateMesoDays(info.key, [{ week: info.week, position: info.position }]);
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
 * Day status comes from the shared pure `rolledUpDayStatus`, which never auto-promotes a
 * day to "complete" (that's the explicit Complete-session button); it only preserves a
 * day already finished. Returns the day's route coordinates (meso key / week / position)
 * so callers can revalidate the exact pages that render it, or null if the row is gone.
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
  const dayStatus = rolledUpDayStatus(day.exercises, day.status);
  await prisma.mesoDay.update({
    where: { id: day.id },
    data: { status: dayStatus, finishedAt: dayStatus === "complete" ? day.finishedAt ?? new Date() : null },
  });

  return { key: day.meso.key, week: day.week, position: day.position, dayId: day.id };
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
  if (info) {
    await postCommunityActivity(info.dayId, me.id, setId);
    revalidateForDay(info);
  }
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
  if (info) {
    await postCommunityActivity(info.dayId, me.id); // skipping the last set can finish a day
    revalidateForDay(info);
  }
}

/**
 * Explicitly finish a day. Any sets that were never logged are marked "skipped" so the
 * day is unambiguously complete and the roll-up (which demotes days with open sets) can't
 * later revert it. Mirrors the set-mutation flow: post community activity + revalidate.
 */
export async function completeDay(key: string, week: number, position: number) {
  const me = await requireUser();
  const day = await prisma.mesoDay.findFirst({
    where: { meso: { key, userId: me.id }, week, position },
    select: { id: true, finishedAt: true, exercises: { select: { id: true } } },
  });
  if (!day) throw new Error("Forbidden"); // not found or not the caller's meso

  const exIds = day.exercises.map((e) => e.id);
  if (exIds.length > 0) {
    await prisma.exerciseSet.updateMany({
      where: { dayExerciseId: { in: exIds }, status: { notIn: ["complete", "skipped"] } },
      data: { status: "skipped", finishedAt: new Date() },
    });
    await prisma.dayExercise.updateMany({ where: { id: { in: exIds } }, data: { status: "complete" } });
  }
  await prisma.mesoDay.update({
    where: { id: day.id },
    data: { status: "complete", finishedAt: day.finishedAt ?? new Date() },
  });

  await postCommunityActivity(day.id, me.id);
  revalidateForDay({ key, week, position });
}

/**
 * Reopen a finished day for editing (the inverse of completeDay). Sets that were auto-skipped
 * on completion because they were never logged (skipped + no weight/reps) flip back to open
 * inputs so they can be filled in; genuinely logged or deliberately skipped sets are left as-is.
 * Recomputing each exercise then demotes the day off "complete" and clears its finishedAt.
 */
export async function reopenDay(key: string, week: number, position: number) {
  const me = await requireUser();
  const day = await prisma.mesoDay.findFirst({
    where: { meso: { key, userId: me.id }, week, position },
    select: { id: true, exercises: { select: { id: true } } },
  });
  if (!day) throw new Error("Forbidden"); // not found or not the caller's meso

  const exIds = day.exercises.map((e) => e.id);
  if (exIds.length === 0) {
    // No exercises to roll up from — just unlock the day directly.
    await prisma.mesoDay.update({ where: { id: day.id }, data: { status: "pending", finishedAt: null } });
  } else {
    await prisma.exerciseSet.updateMany({
      where: { dayExerciseId: { in: exIds }, status: "skipped", weight: null, reps: null },
      data: { status: "pendingWeight", finishedAt: null },
    });
    // Recompute each exercise + the day from the now-open sets; the roll-up demotes the day
    // off "complete" (sticky only while every set is done) and nulls finishedAt. Independent
    // per-exercise reads/writes over the same post-update snapshot, so run them together.
    await Promise.all(exIds.map((id) => recomputeRollups(id)));
  }
  revalidateForDay({ key, week, position });
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
