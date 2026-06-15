"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Unit } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTemplate } from "@/lib/data";
import { generateMesocycle } from "@/lib/generateMeso";

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

/** Hard delete — cascades to days/exercises/sets/priorities. */
export async function deleteMesocycle(key: string) {
  const me = await requireUser();
  await assertMesoOwner(key, me.id);
  await prisma.mesocycle.delete({ where: { key } });
  revalidatePath("/");
  revalidatePath("/mesocycles");
  redirect("/mesocycles");
}
