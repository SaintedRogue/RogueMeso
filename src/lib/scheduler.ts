// In-process reminder scheduler. Started once from instrumentation.ts on the Node.js
// runtime; ticks every minute and delivers due reminders via web-push — even when the
// user's phone is locked. There is no cron/queue in this deployment, so this is the
// single source of timed sends. Server-only (imports Prisma + web-push).
//
// Correctness rests on three things proven in adhdMode.test.ts + the ReminderLog unique
// constraint: (1) tz-correct local time via Intl, (2) a catch-up window so a late tick
// self-heals, (3) markSent's create-or-false guard so a restart never double-sends.
import {
  ADHD_MODE_CONSTANTS,
  dueIndices,
  getLocalDateStr,
  getLocalMinuteOfDay,
  isQuietHours,
  mergeParams,
  type DailySchedule,
  type NotificationPayload,
  type ReminderContext,
} from "@/lib/features/adhdMode";
import { HABIT_REGISTRY, findHabit } from "@/lib/features/adhdModeRegistry";
import type { Macros } from "@/lib/features/bodyTuning";
import * as data from "@/lib/features/adhdData";
import { isPushConfigured, PushGoneError, sendWebPush } from "@/lib/webPush";

let started = false;
let ticking = false;

// Per-user Body Tuning macros + training state change at most daily; cache across ticks
// to avoid re-querying every minute. Keyed by userId with a short TTL.
const macroCache = new Map<number, { macros: Macros | null; at: number }>();
const trainingCache = new Map<number, { training: { currentWeek: number | null; weeksCount: number | null }; at: number }>();

export function startReminderScheduler(): void {
  if (started) return; // idempotent against dev HMR / double register()
  started = true;
  if (!isPushConfigured()) {
    console.warn("[adhd] scheduler started but VAPID is not configured — reminders disabled");
  }
  // Align the first tick to the next clock minute so fires land on the minute.
  const msToNextMinute = 60_000 - (Date.now() % 60_000);
  setTimeout(() => {
    void tick();
    setInterval(() => void tick(), ADHD_MODE_CONSTANTS.TICK_INTERVAL_MS);
  }, msToNextMinute);
  console.log("[adhd] reminder scheduler started");
}

async function tick(): Promise<void> {
  if (ticking) return; // never let a slow tick pile up on the next interval
  ticking = true;
  const now = new Date();
  try {
    if (!isPushConfigured()) return;
    const users = await data.getActiveUsers();
    for (const u of users) {
      try {
        await tickUser(u, now);
      } catch (err) {
        // One user's failure must never kill the loop for the others.
        console.error("[adhd] tick failed for user", u.userId, err);
      }
    }
  } catch (err) {
    console.error("[adhd] tick failed", err);
  } finally {
    ticking = false;
  }
}

async function getMacros(userId: number, now: Date): Promise<Macros | null> {
  const cached = macroCache.get(userId);
  if (cached && Date.now() - cached.at < ADHD_MODE_CONSTANTS.MACRO_CACHE_TTL_MS) return cached.macros;
  const macros = await data.getUserMacros(userId, now);
  macroCache.set(userId, { macros, at: Date.now() });
  return macros;
}

async function getTraining(userId: number) {
  const cached = trainingCache.get(userId);
  if (cached && Date.now() - cached.at < ADHD_MODE_CONSTANTS.MACRO_CACHE_TTL_MS) return cached.training;
  const training = await data.getTrainingState(userId);
  trainingCache.set(userId, { training, at: Date.now() });
  return training;
}

async function sendToAllDevices(u: data.ActiveUser, payload: NotificationPayload): Promise<void> {
  for (const sub of u.subscriptions) {
    try {
      await sendWebPush(sub, payload);
    } catch (err) {
      if (err instanceof PushGoneError) {
        await data.deleteSubscriptionByEndpoint(sub.endpoint);
      } else {
        throw err;
      }
    }
  }
}

async function tickUser(u: data.ActiveUser, now: Date): Promise<void> {
  const schedule: DailySchedule = {
    wakeHHMM: u.schedule.wakeHHMM,
    bedtimeHHMM: u.schedule.bedtimeHHMM,
    workoutHHMM: u.schedule.workoutHHMM,
    mealsPerDay: u.schedule.mealsPerDay,
  };

  // Local time uses the user's first device timezone (schedule is per-user, not per-device).
  const tz = u.subscriptions[0].timezone;
  const localDate = getLocalDateStr(now, tz);
  const localMinute = getLocalMinuteOfDay(now, tz);
  const quiet = isQuietHours(localMinute, schedule.wakeHHMM, schedule.bedtimeHHMM);

  const macros = await getMacros(u.userId, now);
  const training = await getTraining(u.userId);
  const configs = await data.getHabitConfigMap(u.userId);
  const baseCtx = { schedule, macros, training, userName: u.name };

  // (1) Re-fire elapsed snoozes — but not during quiet hours (they wait for morning).
  if (!quiet) {
    for (const s of await data.getDueSnoozes(u.userId, now)) {
      const habit = findHabit(s.habitKey);
      if (!habit) {
        await data.clearSnooze(u.userId, s.habitKey, s.localDate, s.firingIndex);
        continue;
      }
      const params = mergeParams(habit, configs.get(habit.key)?.params);
      const payload = habit.buildPayload({ ...baseCtx, params }, s.firingIndex);
      payload.data = { habitKey: s.habitKey, localDate: s.localDate, firingIndex: s.firingIndex };
      await sendToAllDevices(u, payload);
      await data.clearSnooze(u.userId, s.habitKey, s.localDate, s.firingIndex);
    }
  }

  if (quiet) return;

  // (2) Normal due reminders, registry-driven.
  let sentToday = await data.dailySentCount(u.userId, localDate);
  for (const habit of HABIT_REGISTRY) {
    const cfg = configs.get(habit.key);
    const enabled = cfg ? cfg.enabled : habit.defaultEnabled;
    if (!enabled) continue;

    const params = mergeParams(habit, cfg?.params);
    const ctx: ReminderContext = { ...baseCtx, params };
    const due = dueIndices(habit.computeFireTimes(ctx), localMinute, ADHD_MODE_CONSTANTS.CATCHUP_WINDOW_MIN);

    for (const idx of due) {
      if (sentToday >= u.schedule.dailyCap) return; // anti-spam cap reached for the day
      // Claim before sending; create-or-false makes a concurrent/restarted tick safe.
      const claimed = await data.markSent(u.userId, habit.key, localDate, idx);
      if (!claimed) continue;
      const payload = habit.buildPayload(ctx, idx);
      payload.data = { habitKey: habit.key, localDate, firingIndex: idx };
      try {
        await sendToAllDevices(u, payload);
        sentToday++;
      } catch (err) {
        await data.unmarkSent(u.userId, habit.key, localDate, idx); // release claim → retry next tick
        throw err;
      }
    }
  }
}
