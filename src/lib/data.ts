import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// All queries are scoped to a user. Mesocycles are private; exercises/templates are the shared
// shared library (userId null) PLUS the user's own creations (userId === me).

/** A template is usable by `userId` if it's the seeded library, their own, or shared by an
 *  opted-in member. The single source of truth for both reads (getTemplate) and the
 *  copy-on-use guard (generateMesocycle). Callers must select `userId`, `sharedWithInstance`
 *  and `user.communityOptIn` + `user.active` (a deactivated author's shares disappear). */
export function isTemplateAccessible(
  tpl: { userId: number | null; sharedWithInstance: boolean; user?: { communityOptIn: boolean; active: boolean } | null },
  userId: number,
): boolean {
  return (
    tpl.userId === null ||
    tpl.userId === userId ||
    (tpl.sharedWithInstance && !!tpl.user?.communityOptIn && !!tpl.user?.active)
  );
}

export function getMesocycles(userId: number) {
  return prisma.mesocycle.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { days: true } } },
  });
}

// Shallow day list (status only) for the home screen, so we can pick the current
// day without deep-loading every week's exercises and sets.
const homeDays = {
  select: { week: true, position: true, status: true, label: true },
  orderBy: [{ week: "asc" }, { position: "asc" }],
} satisfies Prisma.Mesocycle$daysArgs;

/** The meso to show on the home/current-workout screen. The user's explicitly-activated block
 *  wins (activeAt is the single-active pointer); absent one (legacy data, pre-activate) we fall
 *  back to the newest unfinished block, then to the newest non-archived one. */
export async function getActiveMeso(userId: number) {
  return (
    (await prisma.mesocycle.findFirst({
      // status guard is defensive: write paths always clear activeAt before completing/archiving.
      where: { userId, activeAt: { not: null }, status: { notIn: ["complete", "archived"] } },
      orderBy: { activeAt: "desc" },
      include: { days: homeDays },
    })) ??
    (await prisma.mesocycle.findFirst({
      where: { userId, status: { notIn: ["complete", "archived"] }, finishedAt: null },
      orderBy: { createdAt: "desc" },
      include: { days: homeDays },
    })) ??
    (await prisma.mesocycle.findFirst({
      where: { userId, status: { not: "archived" } },
      orderBy: { createdAt: "desc" },
      include: { days: homeDays },
    }))
  );
}

const dayInclude = {
  exercises: {
    orderBy: { position: "asc" },
    include: {
      exercise: true,
      muscleGroup: true,
      sets: { orderBy: { position: "asc" } },
    },
  },
} as const;

export async function getMesocycle(key: string, userId: number) {
  const meso = await prisma.mesocycle.findUnique({
    where: { key },
    include: {
      priorities: { include: { muscleGroup: true } },
      days: { orderBy: [{ week: "asc" }, { position: "asc" }], include: dayInclude },
    },
  });
  if (!meso || meso.userId !== userId) return null; // ownership enforced
  return meso;
}

export function getDay(mesoKey: string, week: number, position: number, userId: number) {
  return prisma.mesoDay.findFirst({
    where: { meso: { key: mesoKey, userId }, week, position },
    include: { ...dayInclude, meso: true },
  });
}

export async function getExercises(userId: number, search?: string, muscleGroupId?: number) {
  return prisma.exercise.findMany({
    where: {
      OR: [{ userId: null }, { userId }],
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      ...(muscleGroupId ? { muscleGroupId } : {}),
    },
    include: { muscleGroup: true },
    orderBy: [{ muscleGroup: { name: "asc" } }, { name: "asc" }],
  });
}

export function getMuscleGroups() {
  return prisma.muscleGroup.findMany({ orderBy: { sourceId: "asc" } });
}

export function getTemplates(userId: number) {
  return prisma.template.findMany({
    where: { OR: [{ userId: null }, { userId }] },
    orderBy: [{ name: "asc" }, { frequency: "asc" }],
    include: { _count: { select: { days: true } } },
  });
}

export async function getTemplate(key: string, userId: number) {
  const tpl = await prisma.template.findUnique({
    where: { key },
    include: {
      user: { select: { id: true, name: true, email: true, communityOptIn: true, active: true } },
      priorities: { include: { muscleGroup: true } },
      days: {
        orderBy: { position: "asc" },
        include: { slots: { orderBy: { position: "asc" }, include: { exercise: true, muscleGroup: true } } },
      },
    },
  });
  if (!tpl) return null;
  return isTemplateAccessible(tpl, userId) ? tpl : null;
}
