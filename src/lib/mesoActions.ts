"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Unit } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateMesocycle } from "@/lib/generateMeso";

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

export async function archiveMesocycle(key: string) {
  const me = await requireUser();
  await assertMesoOwner(key, me.id);
  await prisma.mesocycle.update({ where: { key }, data: { status: "archived" } });
  revalidatePath("/", "layout");
}

export async function unarchiveMesocycle(key: string) {
  const me = await requireUser();
  await assertMesoOwner(key, me.id);
  const m = await prisma.mesocycle.findUnique({ where: { key }, select: { finishedAt: true } });
  await prisma.mesocycle.update({
    where: { key },
    data: { status: m?.finishedAt ? "complete" : "ready" },
  });
  revalidatePath("/", "layout");
}

/** Hard delete — cascades to days/exercises/sets/priorities. */
export async function deleteMesocycle(key: string) {
  const me = await requireUser();
  await assertMesoOwner(key, me.id);
  await prisma.mesocycle.delete({ where: { key } });
  revalidatePath("/", "layout");
  redirect("/mesocycles");
}
