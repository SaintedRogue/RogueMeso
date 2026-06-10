"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toKg } from "@/lib/format";

/** Log (or overwrite) today's bodyweight check-in. Weight is entered in the user's unit. */
export async function logWeight(formData: FormData) {
  const me = await requireUser();
  const weightRaw = Number(formData.get("weight"));
  if (!Number.isFinite(weightRaw) || weightRaw <= 0) return;

  const dateStr = String(formData.get("date") ?? "");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(dateStr) : new Date();
  date.setUTCHours(0, 0, 0, 0);

  const bfRaw = Number(formData.get("bodyFatPct"));
  const bodyFatPct = Number.isFinite(bfRaw) && bfRaw > 0 && bfRaw < 70 ? bfRaw / 100 : null;

  const weightKg = toKg(weightRaw, me.unit);

  await prisma.weightEntry.upsert({
    where: { userId_date: { userId: me.id, date } },
    create: { userId: me.id, date, weightKg, bodyFatPct },
    update: { weightKg, bodyFatPct },
  });
  revalidatePath("/body-tuning");
}

/** Save the user's biometric profile (height/sex/birthdate/activity). */
export async function setBiometrics(formData: FormData) {
  const me = await requireUser();
  const heightRaw = Number(formData.get("heightCm"));
  const heightCm = Number.isFinite(heightRaw) && heightRaw > 0 ? heightRaw : null;

  const sexRaw = String(formData.get("bodySex"));
  const bodySex = sexRaw === "M" || sexRaw === "F" ? sexRaw : null;

  const activityRaw = String(formData.get("activityLevel"));
  const activityLevel =
    activityRaw === "sedentary" || activityRaw === "light" || activityRaw === "moderate" ? activityRaw : null;

  const birthStr = String(formData.get("birthDate") ?? "");
  const birthDate = /^\d{4}-\d{2}-\d{2}$/.test(birthStr) ? new Date(birthStr) : null;

  await prisma.user.update({
    where: { id: me.id },
    data: { heightCm, bodySex, activityLevel, birthDate },
  });
  revalidatePath("/body-tuning");
  revalidatePath("/profile");
}

/** Set the active mesocycle's nutrition goal (ownership-checked). */
export async function setMesoGoal(formData: FormData) {
  const me = await requireUser();
  const mesoId = Number(formData.get("mesoId"));
  if (!Number.isFinite(mesoId)) return;

  const goalRaw = String(formData.get("nutritionGoal"));
  const nutritionGoal = goalRaw === "cut" || goalRaw === "bulk" || goalRaw === "maintain" ? goalRaw : null;

  const meso = await prisma.mesocycle.findUnique({ where: { id: mesoId }, select: { userId: true } });
  if (!meso || meso.userId !== me.id) return; // ownership guard

  await prisma.mesocycle.update({ where: { id: mesoId }, data: { nutritionGoal } });
  revalidatePath("/body-tuning");
}
