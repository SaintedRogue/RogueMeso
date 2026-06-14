// ADHD Mode — SERVER-ONLY I/O. Prisma access + Body Tuning macro reuse for the
// scheduler and server actions. Kept out of adhdMode.ts so the pure engine and the
// habit registry stay client-importable (see the header note in adhdMode.ts).
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeBodyTuning, type Macros } from "./bodyTuning";
import type { HabitParams } from "./adhdMode";

export type ActiveUser = {
  userId: number;
  name: string | null;
  schedule: {
    wakeHHMM: number;
    bedtimeHHMM: number;
    workoutHHMM: number | null;
    mealsPerDay: number;
    dailyCap: number;
  };
  subscriptions: { id: number; endpoint: string; p256dh: string; auth: string; timezone: string }[];
};

/** Users who have flipped the master switch on AND have at least one subscribed device. */
export async function getActiveUsers(): Promise<ActiveUser[]> {
  const users = await prisma.user.findMany({
    where: { notificationSchedule: { globalEnabled: true }, pushSubscriptions: { some: {} } },
    select: {
      id: true,
      name: true,
      notificationSchedule: {
        select: { wakeHHMM: true, bedtimeHHMM: true, workoutHHMM: true, mealsPerDay: true, dailyCap: true },
      },
      pushSubscriptions: { select: { id: true, endpoint: true, p256dh: true, auth: true, timezone: true } },
    },
  });
  return users
    .filter((u) => u.notificationSchedule && u.pushSubscriptions.length > 0)
    .map((u) => ({
      userId: u.id,
      name: u.name,
      schedule: u.notificationSchedule!,
      subscriptions: u.pushSubscriptions,
    }));
}

/** All of a user's per-habit configs, keyed by habitKey. Missing habits fall back to defaults. */
export async function getHabitConfigMap(
  userId: number,
): Promise<Map<string, { enabled: boolean; params: HabitParams }>> {
  const rows = await prisma.habitConfig.findMany({
    where: { userId },
    select: { habitKey: true, enabled: true, params: true },
  });
  const map = new Map<string, { enabled: boolean; params: HabitParams }>();
  for (const r of rows) {
    map.set(r.habitKey, { enabled: r.enabled, params: (r.params ?? {}) as HabitParams });
  }
  return map;
}

/** Daily kcal/macros from the Body Tuning engine; null when the profile is incomplete. */
export async function getUserMacros(userId: number, now: Date): Promise<Macros | null> {
  const bt = await computeBodyTuning(userId, now);
  return bt.needsProfile ? null : bt.macros;
}

/**
 * Idempotency claim: create the ReminderLog row for this firing. Returns false if a row
 * already exists (already sent / snoozed) — the unique constraint makes this race-safe.
 */
export async function markSent(
  userId: number,
  habitKey: string,
  localDate: string,
  firingIndex: number,
): Promise<boolean> {
  try {
    await prisma.reminderLog.create({ data: { userId, habitKey, localDate, firingIndex } });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }
}

/** Undo a claim when the send failed, so the next tick retries. */
export async function unmarkSent(
  userId: number,
  habitKey: string,
  localDate: string,
  firingIndex: number,
): Promise<void> {
  await prisma.reminderLog.deleteMany({ where: { userId, habitKey, localDate, firingIndex } });
}

/** Count of reminders already sent today (drives the per-user daily cap). */
export async function dailySentCount(userId: number, localDate: string): Promise<number> {
  return prisma.reminderLog.count({ where: { userId, localDate } });
}

/** Push a reminder out by SNOOZE_MINUTES (set on the existing, already-sent log row). */
export async function snoozeReminder(
  userId: number,
  habitKey: string,
  localDate: string,
  firingIndex: number,
  until: Date,
): Promise<void> {
  await prisma.reminderLog.updateMany({
    where: { userId, habitKey, localDate, firingIndex },
    data: { snoozedUntil: until },
  });
}

/** Snoozed reminders whose snooze has elapsed — the scheduler re-fires these. */
export async function getDueSnoozes(
  userId: number,
  now: Date,
): Promise<{ habitKey: string; localDate: string; firingIndex: number }[]> {
  return prisma.reminderLog.findMany({
    where: { userId, snoozedUntil: { not: null, lte: now } },
    select: { habitKey: true, localDate: true, firingIndex: true },
  });
}

/** Clear a snooze after re-firing so it doesn't fire again. */
export async function clearSnooze(
  userId: number,
  habitKey: string,
  localDate: string,
  firingIndex: number,
): Promise<void> {
  await prisma.reminderLog.updateMany({
    where: { userId, habitKey, localDate, firingIndex },
    data: { snoozedUntil: null },
  });
}

/** Drop a subscription the push service reported as gone (410/404). */
export async function deleteSubscriptionByEndpoint(endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

/** The user's schedule row, created with defaults on first access. */
export async function getOrCreateSchedule(userId: number) {
  return prisma.notificationSchedule.upsert({ where: { userId }, create: { userId }, update: {} });
}

/**
 * Active-block progress for training-aware reminders. currentWeek is the highest week
 * index that has any started/completed day (a cheap proxy for "where they are now").
 * Both null when there's no active block.
 */
export async function getTrainingState(userId: number): Promise<{ currentWeek: number | null; weeksCount: number | null }> {
  const meso = await prisma.mesocycle.findFirst({
    where: { userId, status: { notIn: ["archived", "complete"] } },
    // Track the explicitly-active block (matches getActiveMeso/home), else the newest one.
    orderBy: [{ activeAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    select: {
      weeksCount: true,
      days: { where: { status: { not: "pending" } }, orderBy: { week: "desc" }, take: 1, select: { week: true } },
    },
  });
  if (!meso) return { currentWeek: null, weeksCount: null };
  return { currentWeek: meso.days.length ? meso.days[0].week : 0, weeksCount: meso.weeksCount };
}
