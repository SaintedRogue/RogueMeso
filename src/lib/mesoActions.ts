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
  priorities: { name: string; priority: string }[];
  days: { position: number; slots: { mg: string; exercise: string | null }[] }[];
};

/**
 * On-demand detail for one template, fetched by the client picker when a card is
 * selected (we don't preload all 153 templates' day/slot trees into the page).
 * Auth + shared-or-own ownership are enforced by getTemplate; we map to a minimal
 * shape so only what the UI draws crosses the wire.
 */
export async function getTemplatePreview(key: string): Promise<TemplatePreview | null> {
  const me = await requireUser();
  const t = await getTemplate(key, me.id);
  if (!t) return null;
  return {
    priorities: t.priorities.map((p) => ({ name: p.muscleGroup.name, priority: p.priority })),
    days: t.days.map((d) => ({
      position: d.position,
      slots: d.slots.map((s) => ({ mg: s.muscleGroup.name, exercise: s.exercise?.name ?? null })),
    })),
  };
}

async function assertMesoOwner(key: string, userId: number) {
  const m = await prisma.mesocycle.findUnique({ where: { key }, select: { userId: true } });
  if (!m || m.userId !== userId) throw new Error("Forbidden");
}

/** Form action: create a mesocycle from a template (owned by the current user) and go to it. */
export async function createMesocycleAction(formData: FormData) {
  const me = await requireUser();
  const key = await generateMesocycle({
    userId: me.id,
    templateKey: String(formData.get("templateKey") ?? ""),
    name: String(formData.get("name") ?? ""),
    weeks: Number(formData.get("weeks") ?? 5),
    unit: (String(formData.get("unit") ?? "lb") === "kg" ? "kg" : "lb") as Unit,
  });
  revalidatePath("/mesocycles");
  redirect(`/mesocycles/${key}`);
}

/** A meso's status shows on the home screen, the list, and its own detail page. */
function revalidateMeso(key: string) {
  revalidatePath("/");
  revalidatePath("/mesocycles");
  revalidatePath(`/mesocycles/${key}`);
}

export async function archiveMesocycle(key: string) {
  const me = await requireUser();
  await assertMesoOwner(key, me.id);
  await prisma.mesocycle.update({ where: { key }, data: { status: "archived" } });
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
