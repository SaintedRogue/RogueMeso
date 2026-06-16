"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { MgPriority, Unit } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTemplate } from "@/lib/data";
import { generateMesocycle } from "@/lib/generateMeso";
import { DONE_STATUSES } from "@/lib/dayStatus";
import { plannedSets } from "@/lib/progression";
import { nextSetData, reconcileSetCount } from "@/lib/setOps";
import { PRIORITIES } from "@/lib/priorities";

/** Slim, serializable shape the TemplatePicker preview renders — no raw DB rows. */
export type TemplatePreview = {
  description: string | null;
  priorities: { name: string; priority: string }[];
  days: { position: number; label: string | null; slots: { mg: string; exercise: string | null }[] }[];
};

/**
 * On-demand detail for one template, fetched by the client picker when a card is
 * selected (we don't preload every template's day/slot tree into the page).
 * Auth + shared-or-own ownership are enforced by getTemplate; we map to a minimal
 * shape so only what the UI draws crosses the wire.
 */
export async function getTemplatePreview(key: string): Promise<TemplatePreview | null> {
  const me = await requireUser();
  const t = await getTemplate(key, me.id);
  if (!t) return null;
  return {
    description: t.description ?? null,
    priorities: t.priorities.map((p) => ({ name: p.muscleGroup.name, priority: p.priority })),
    days: t.days.map((d) => ({
      position: d.position,
      label: d.label ?? null,
      slots: d.slots.map((s) => ({ mg: s.muscleGroup.name, exercise: s.exercise?.name ?? null })),
    })),
  };
}

async function assertMesoOwner(key: string, userId: number) {
  const m = await prisma.mesocycle.findUnique({ where: { key }, select: { userId: true } });
  if (!m || m.userId !== userId) throw new Error("Forbidden");
}

/** Form action: create a mesocycle from a template (owned by the current user) and go to it.
 *  The new block is created active (generateMeso stamps activeAt); we then bench every other
 *  block so exactly one stays active. */
export async function createMesocycleAction(formData: FormData) {
  const me = await requireUser();
  const key = await generateMesocycle({
    userId: me.id,
    templateKey: String(formData.get("templateKey") ?? ""),
    name: String(formData.get("name") ?? ""),
    weeks: Number(formData.get("weeks") ?? 5),
    unit: (String(formData.get("unit") ?? "lb") === "kg" ? "kg" : "lb") as Unit,
  });
  // Stamp the new block active and bench every other block in one transaction (single-active).
  await prisma.$transaction([
    prisma.mesocycle.updateMany({
      where: { userId: me.id, activeAt: { not: null }, key: { not: key } },
      data: { activeAt: null },
    }),
    prisma.mesocycle.update({ where: { key }, data: { activeAt: new Date() } }),
  ]);
  revalidatePath("/");
  revalidatePath("/mesocycles");
  redirect(`/mesocycles/${key}`);
}

/** A meso's status shows on the home screen, the list, and its own detail page. */
function revalidateMeso(key: string) {
  revalidatePath("/");
  revalidatePath("/mesocycles");
  revalidatePath(`/mesocycles/${key}`);
}

/**
 * Make `key` the single active/current block: stamp its activeAt and clear every other block's,
 * in one transaction so two rows can never be active at once. A block that was archived or marked
 * complete is reactivated to "ready" so "Set active" doubles as a resume. */
export async function setActiveMesocycle(key: string) {
  const me = await requireUser();
  // Ownership read + status read + both writes share one transaction snapshot, so a concurrent
  // finish/archive can't slip between "is it complete?" and the activate write.
  await prisma.$transaction(async (tx) => {
    const m = await tx.mesocycle.findUnique({ where: { key }, select: { userId: true, status: true } });
    if (!m || m.userId !== me.id) throw new Error("Forbidden");
    const reactivated = m.status === "archived" || m.status === "complete";
    await tx.mesocycle.updateMany({
      where: { userId: me.id, activeAt: { not: null }, key: { not: key } },
      data: { activeAt: null },
    });
    await tx.mesocycle.update({
      where: { key },
      data: { activeAt: new Date(), ...(reactivated ? { status: "ready", finishedAt: null } : {}) },
    });
  });
  revalidateMeso(key);
}

/** Rename a block. Name is required; trimmed and capped so a stray paste can't bloat the UI. */
export async function renameMesocycle(key: string, name: string) {
  const me = await requireUser();
  await assertMesoOwner(key, me.id);
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new Error("Name is required.");
  await prisma.mesocycle.update({ where: { key }, data: { name: clean } });
  revalidateMeso(key);
}

/** Finish a block: mark it complete and stamp finishedAt, and clear its active pointer so it
 *  leaves the active pool (it's done — the home screen should move on). */
export async function finishMesocycle(key: string) {
  const me = await requireUser();
  await assertMesoOwner(key, me.id);
  await prisma.mesocycle.update({
    where: { key },
    data: { status: "complete", finishedAt: new Date(), activeAt: null },
  });
  revalidateMeso(key);
}

export async function archiveMesocycle(key: string) {
  const me = await requireUser();
  await assertMesoOwner(key, me.id);
  // Archiving also benches the block — an archived meso must never be the active one.
  await prisma.mesocycle.update({ where: { key }, data: { status: "archived", activeAt: null } });
  revalidateMeso(key);
}

export async function unarchiveMesocycle(key: string) {
  const me = await requireUser();
  await assertMesoOwner(key, me.id);
  const m = await prisma.mesocycle.findUnique({ where: { key }, select: { finishedAt: true } });
  await prisma.mesocycle.update({
    where: { key },
    data: { status: m?.finishedAt ? "complete" : "ready" },
  });
  revalidateMeso(key);
}

/**
 * Retune a muscle group's volume priority on a live block. Set counts are reconciled toward the
 * new priority's planned volume for every UNTRAINED day from the week the user has reached
 * forward — past and in-progress days are left exactly as they were logged. Raising adds sets;
 * lowering trims trailing unlogged sets (never a logged set, never below one). The stored
 * MesoPriority is upserted so the change sticks and shows on the detail page.
 */
export async function updateMesoPriority(key: string, muscleGroupId: number, priority: MgPriority) {
  const me = await requireUser();
  if (!PRIORITIES.includes(priority)) throw new Error("Invalid priority.");

  // Read + reconcile + write all inside one transaction so a set logged concurrently between
  // the snapshot and the writes can't be deleted on stale data.
  const touchedDays = new Map<string, { week: number; position: number }>();
  await prisma.$transaction(async (tx) => {
    const meso = await tx.mesocycle.findUnique({
      where: { key },
      select: {
        id: true,
        userId: true,
        unit: true,
        weeksCount: true,
        days: {
          select: {
            week: true,
            position: true,
            exercises: {
              select: {
                id: true,
                muscleGroupId: true,
                sets: {
                  select: {
                    id: true,
                    position: true,
                    status: true,
                    repsTarget: true,
                    weightTarget: true,
                    weightTargetMin: true,
                    weightTargetMax: true,
                    unit: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!meso || meso.userId !== me.id) throw new Error("Forbidden");
    if (!meso.days.some((d) => d.exercises.some((e) => e.muscleGroupId === muscleGroupId)))
      throw new Error("Muscle group not in this mesocycle.");

    // How far the user has trained: the latest week with any logged/skipped set (-1 if untouched,
    // so week 0 isn't mistaken for a reached week and its untrained days are still reconciled).
    const dayTrained = (d: (typeof meso.days)[number]) =>
      d.exercises.some((e) => e.sets.some((s) => DONE_STATUSES.has(s.status)));
    let reachedWeek = -1;
    for (const d of meso.days) if (dayTrained(d) && d.week > reachedWeek) reachedWeek = d.week;

    const toCreate: { dayExerciseId: number; position: number; setType: string; repsTarget: number | null; weightTarget: number | null; weightTargetMin: number | null; weightTargetMax: number | null; unit: string | null; status: string }[] = [];
    const removeIds: number[] = [];
    for (const d of meso.days) {
      if (d.week < reachedWeek || dayTrained(d)) continue; // protect past + in-progress days
      const target = plannedSets(priority, d.week, meso.weeksCount);
      for (const ex of d.exercises) {
        if (ex.muscleGroupId !== muscleGroupId) continue;
        const { add, removeIds: rm } = reconcileSetCount(ex.sets, target);
        if (add === 0 && rm.length === 0) continue;
        if (add > 0) {
          const base = nextSetData(ex.sets, meso.unit);
          for (let i = 0; i < add; i++) toCreate.push({ dayExerciseId: ex.id, ...base, position: base.position + i });
        }
        removeIds.push(...rm);
        touchedDays.set(`${d.week}:${d.position}`, { week: d.week, position: d.position });
      }
    }

    if (toCreate.length) await tx.exerciseSet.createMany({ data: toCreate });
    if (removeIds.length) await tx.exerciseSet.deleteMany({ where: { id: { in: removeIds } } });
    await tx.mesoPriority.upsert({
      where: { mesoId_muscleGroupId: { mesoId: meso.id, muscleGroupId } },
      create: { mesoId: meso.id, muscleGroupId, priority },
      update: { priority },
    });
  });

  revalidateMeso(key);
  for (const d of touchedDays.values()) revalidatePath(`/mesocycles/${key}/${d.week}/${d.position}`);
}

/** Hard delete — cascades to days/exercises/sets/priorities. */
export async function deleteMesocycle(key: string) {
  const me = await requireUser();
  await assertMesoOwner(key, me.id);
  await prisma.mesocycle.delete({ where: { key } });
  revalidatePath("/");
  revalidatePath("/mesocycles");
  redirect("/mesocycles");
}
