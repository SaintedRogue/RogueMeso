"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toKg, ftInToCm, parseDateField } from "@/lib/format";
import { ok, fail, type ActionResult } from "@/lib/actionResult";

/** Log (or overwrite) today's bodyweight check-in. Weight is entered in the user's unit. */
export async function logWeight(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const weightRaw = Number(formData.get("weight"));
  if (!Number.isFinite(weightRaw) || weightRaw <= 0) return fail("Enter a valid weight");

  const date = parseDateField(formData.get("date"));

  const bfRaw = Number(formData.get("bodyFatPct"));
  const bodyFatPct = Number.isFinite(bfRaw) && bfRaw > 0 && bfRaw < 70 ? bfRaw / 100 : null;

  // Minutes since the user's LOCAL midnight, captured client-side. Lets us bucket AM/PM weigh-ins
  // without knowing their timezone. Re-logging a day refreshes it to the latest weigh-in time.
  const lmRaw = Number(formData.get("localMinutes"));
  const localMinutes = Number.isInteger(lmRaw) && lmRaw >= 0 && lmRaw < 1440 ? lmRaw : null;

  const weightKg = toKg(weightRaw, me.unit);

  await prisma.weightEntry.upsert({
    where: { userId_date: { userId: me.id, date } },
    create: { userId: me.id, date, weightKg, bodyFatPct, localMinutes },
    update: { weightKg, bodyFatPct, localMinutes },
  });
  revalidatePath("/body-tuning");
  return ok("Weight logged");
}

/** Save the user's biometric profile (height/sex/birthdate/activity). */
export async function setBiometrics(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireUser();

  // Height is stored as cm. Imperial users (unit=lb) submit heightFt/heightIn;
  // metric users submit heightCm. Convert at this boundary so the formulas only
  // ever see cm. A blank submit leaves height untouched (see the spread guard below).
  const ftRaw = formData.get("heightFt");
  const inRaw = formData.get("heightIn");
  let heightCm: number | null = null;
  if (ftRaw != null || inRaw != null) {
    const ft = Number(ftRaw);
    const inches = Number(inRaw);
    const cm = ftInToCm(ft, inches);
    heightCm = cm > 0 ? cm : null;
  } else {
    const heightRaw = Number(formData.get("heightCm"));
    heightCm = Number.isFinite(heightRaw) && heightRaw > 0 ? heightRaw : null;
  }

  const sexRaw = String(formData.get("bodySex"));
  const bodySex = sexRaw === "M" || sexRaw === "F" ? sexRaw : null;

  const activityRaw = String(formData.get("activityLevel"));
  const activityLevel =
    activityRaw === "sedentary" || activityRaw === "light" || activityRaw === "moderate" ? activityRaw : null;

  const birthStr = String(formData.get("birthDate") ?? "");
  const birthDate = /^\d{4}-\d{2}-\d{2}$/.test(birthStr) ? new Date(birthStr) : null;

  // Only write fields that parsed successfully, so a partial submit never wipes saved data.
  await prisma.user.update({
    where: { id: me.id },
    data: {
      ...(heightCm != null && { heightCm }),
      ...(bodySex != null && { bodySex }),
      ...(activityLevel != null && { activityLevel }),
      ...(birthDate != null && { birthDate }),
    },
  });
  revalidatePath("/body-tuning");
  revalidatePath("/profile");
  return ok("Profile saved");
}

/** Parse an optional goal-weight field (entered in the user's unit) to canonical kg, or null when
 *  blank (clears the goal). Returns the sentinel `"invalid"` for a present-but-bad value. */
function parseGoalWeightKg(value: FormDataEntryValue | null, unit: string): number | null | "invalid" {
  const raw = String(value ?? "").trim();
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return "invalid";
  return toKg(n, unit);
}

/** Set the user's long-term goal weight (personal, spans mesocycles). Blank clears it. */
export async function setGoalWeight(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const goalWeightKg = parseGoalWeightKg(formData.get("goalWeight"), me.unit);
  if (goalWeightKg === "invalid") return fail("Enter a valid goal weight");

  await prisma.user.update({ where: { id: me.id }, data: { goalWeightKg } });
  revalidatePath("/body-tuning");
  return ok(goalWeightKg == null ? "Long-term goal cleared" : "Long-term goal saved");
}

/** Set the active mesocycle's nutrition goal + (optional) cycle goal weight (ownership-checked). */
export async function setMesoGoal(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const mesoId = Number(formData.get("mesoId"));
  if (!Number.isInteger(mesoId) || mesoId <= 0) return fail("No mesocycle selected");

  const goalRaw = String(formData.get("nutritionGoal"));
  const nutritionGoal = goalRaw === "cut" || goalRaw === "bulk" || goalRaw === "maintain" ? goalRaw : null;

  const goalWeightKg = parseGoalWeightKg(formData.get("goalWeight"), me.unit);
  if (goalWeightKg === "invalid") return fail("Enter a valid goal weight");

  const meso = await prisma.mesocycle.findUnique({ where: { id: mesoId }, select: { userId: true } });
  if (!meso || meso.userId !== me.id) return fail("Not found"); // ownership guard

  await prisma.mesocycle.update({ where: { id: mesoId }, data: { nutritionGoal, goalWeightKg } });
  revalidatePath("/body-tuning");
  return ok("Goal saved");
}
