// Shared write-authorization guards enforcing the core invariant: a user may only mutate
// their own data. Centralized so a fix to an ownership check (e.g. tightening the userId
// comparison) lands in one place instead of silently drifting between action files.

import { prisma } from "@/lib/prisma";

/** Verify a DayExercise belongs to the user; return the coordinates add/remove/swap need. */
export async function assertDayExerciseOwner(dayExerciseId: number, userId: number) {
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

/** Verify a template belongs to the user. Library templates (userId null) and other users'
 *  templates are immutable. */
export async function assertTemplateOwner(key: string, userId: number) {
  const t = await prisma.template.findUnique({ where: { key }, select: { userId: true } });
  if (!t || t.userId !== userId) throw new Error("Forbidden");
}
