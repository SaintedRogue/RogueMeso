// DB-backed day roll-up helpers shared by the structural meso actions (swap, add/remove set).
// Not a "use server" module, so it can export sync helpers (dedupeDays) next to async ones.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { rolledUpDayStatus } from "@/lib/dayStatus";

/** Collapse repeated (week, position) day coordinates so each day is processed once. */
export function dedupeDays<T extends { week: number; position: number }>(days: T[]): T[] {
  const seen = new Map<string, T>();
  for (const d of days) seen.set(`${d.week}:${d.position}`, d);
  return [...seen.values()];
}

/** Refresh every page that renders a meso's days: home, the meso detail, and each given day. */
export function revalidateMesoDays(key: string, days: { week: number; position: number }[] = []) {
  revalidatePath("/");
  revalidatePath(`/mesocycles/${key}`);
  for (const d of dedupeDays(days)) revalidatePath(`/mesocycles/${key}/${d.week}/${d.position}`);
}

/** Recompute one day's roll-up status after its sets changed (swap reset, add, remove). */
export async function recomputeDayStatus(mesoId: number, week: number, position: number) {
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
