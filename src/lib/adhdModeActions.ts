"use server";

// ADHD Mode settings mutations: the master switch, the daily-schedule profile, and
// per-habit toggles + tunables. Schedule/habit saves use the ToastForm signature;
// the master toggle is a plain action called from a switch.
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actionResult";
import { coerceParamValue, type HabitParams } from "@/lib/features/adhdMode";
import { findHabit } from "@/lib/features/adhdModeRegistry";

/** "HH:MM" → HHMM integer (1730), or null for blank/invalid. */
function parseTimeToHHMM(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 100 + min;
}

function clamp(n: number, min?: number, max?: number): number {
  if (min != null && n < min) return min;
  if (max != null && n > max) return max;
  return n;
}

/** Flip the global ADHD Mode switch on/off for the current user. */
export async function setGlobalEnabled(enabled: boolean): Promise<ActionResult> {
  const me = await requireUser();
  await prisma.notificationSchedule.upsert({
    where: { userId: me.id },
    create: { userId: me.id, globalEnabled: enabled },
    update: { globalEnabled: enabled },
  });
  revalidatePath("/adhd-mode");
  return ok(enabled ? "ADHD Mode on" : "ADHD Mode off");
}

/** Save the daily-schedule anchors (wake / bedtime / workout / meals). */
export async function saveSchedule(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireUser();

  const wake = parseTimeToHHMM(formData.get("wake"));
  const bed = parseTimeToHHMM(formData.get("bedtime"));
  if (wake == null || bed == null) return fail("Enter a valid wake and bedtime");

  const workout = parseTimeToHHMM(formData.get("workout")); // optional → null = rest day
  const mealsRaw = Number(formData.get("mealsPerDay"));
  const mealsPerDay = Number.isFinite(mealsRaw) ? clamp(Math.round(mealsRaw), 1, 8) : 3;

  await prisma.notificationSchedule.upsert({
    where: { userId: me.id },
    create: { userId: me.id, wakeHHMM: wake, bedtimeHHMM: bed, workoutHHMM: workout, mealsPerDay },
    update: { wakeHHMM: wake, bedtimeHHMM: bed, workoutHHMM: workout, mealsPerDay },
  });
  revalidatePath("/adhd-mode");
  return ok("Schedule saved");
}

/** Save one habit's enabled flag + tunable params (validated against the registry). */
export async function saveHabitConfig(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const habitKey = String(formData.get("habitKey") ?? "");
  const habit = findHabit(habitKey);
  if (!habit) return fail("Unknown habit");

  // Unchecked checkboxes submit nothing, so presence === enabled.
  const enabled = formData.get("enabled") != null;

  const params: HabitParams = {};
  for (const def of habit.params) {
    const raw = formData.get(def.key);
    if (raw == null && def.type !== "boolean") continue; // leave default
    const value = coerceParamValue(def, def.type === "boolean" ? formData.get(def.key) != null : raw);
    if (typeof value === "number") {
      if (Number.isNaN(value)) continue;
      params[def.key] = clamp(value, def.min, def.max);
    } else {
      params[def.key] = value;
    }
  }

  await prisma.habitConfig.upsert({
    where: { userId_habitKey: { userId: me.id, habitKey } },
    create: { userId: me.id, habitKey, enabled, params },
    update: { enabled, params },
  });
  revalidatePath("/adhd-mode");
  return ok(`${habit.label} saved`);
}
