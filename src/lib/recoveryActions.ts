"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeReadinessScore } from "@/lib/features/recovery";
import { ok, fail, type ActionResult } from "@/lib/actionResult";

/** Log (or overwrite) today's recovery readiness check-in. Advisory only — never adjusts load. */
export async function logReadiness(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireUser();

  const sleepHours = Number(formData.get("sleepHours"));
  if (!Number.isFinite(sleepHours) || sleepHours < 0 || sleepHours > 24) {
    return fail("Enter sleep hours between 0 and 24");
  }

  const soreness = Number(formData.get("soreness"));
  const energy = Number(formData.get("energy"));
  if (!Number.isInteger(soreness) || soreness < 1 || soreness > 5) return fail("Pick a soreness level");
  if (!Number.isInteger(energy) || energy < 1 || energy > 5) return fail("Pick an energy level");

  const noteRaw = String(formData.get("note") ?? "").trim();
  const note = noteRaw.length ? noteRaw.slice(0, 500) : null;

  const dateStr = String(formData.get("date") ?? "");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(dateStr) : new Date();
  date.setUTCHours(0, 0, 0, 0);

  const score = computeReadinessScore(sleepHours, soreness, energy);

  await prisma.readinessEntry.upsert({
    where: { userId_date: { userId: me.id, date } },
    create: { userId: me.id, date, sleepHours, soreness, energy, note, score },
    update: { sleepHours, soreness, energy, note, score },
  });

  revalidatePath("/recovery");
  revalidatePath("/");
  return ok("Check-in logged");
}
