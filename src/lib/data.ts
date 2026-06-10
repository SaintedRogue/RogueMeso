import { prisma } from "@/lib/prisma";

// All queries are scoped to a user. Mesocycles are private; exercises/templates are the shared
// shared library (userId null) PLUS the user's own creations (userId === me).

export function getMesocycles(userId: number) {
  return prisma.mesocycle.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { days: true } } },
  });
}

/** The meso to show on the home/current-workout screen: active one, else most recent. */
export async function getActiveMeso(userId: number) {
  return (
    (await prisma.mesocycle.findFirst({
      where: { userId, status: { notIn: ["complete", "archived"] }, finishedAt: null },
      orderBy: { createdAt: "desc" },
    })) ??
    (await prisma.mesocycle.findFirst({
      where: { userId, status: { not: "archived" } },
      orderBy: { createdAt: "desc" },
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
      priorities: { include: { muscleGroup: true } },
      days: {
        orderBy: { position: "asc" },
        include: { slots: { orderBy: { position: "asc" }, include: { exercise: true, muscleGroup: true } } },
      },
    },
  });
  if (!tpl || (tpl.userId !== null && tpl.userId !== userId)) return null; // shared or own only
  return tpl;
}
