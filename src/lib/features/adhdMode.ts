// ADHD Mode engine — PURE half (client-safe).
//
// Like bodyTuning.ts this file is deterministic and unit-tested, but it is split
// across a module boundary the React Server Component model forces on us: the habit
// REGISTRY (adhdModeRegistry.ts) is imported by a *client* settings component, so
// nothing on this path may pull in Prisma. All I/O (Prisma, web-push) therefore lives
// in adhdData.ts, and this file holds only types, scheduler/delivery constants, and
// pure time/timezone math.
//
// Habit-specific evidence (caffeine dosing, hydration volumes, sleep duration, …) is
// cited inline on each registry entry's param defs, mirroring BODY_TUNING_CONSTANTS.
import type { LucideIcon } from "lucide-react";
import type { Macros } from "./bodyTuning";

// ----- Scheduler / delivery constants (NOT habit science — that lives in the registry) -----

export const ADHD_MODE_CONSTANTS = {
  // The in-process scheduler re-checks every minute (src/lib/scheduler.ts).
  TICK_INTERVAL_MS: 60_000,
  // A reminder is "due" if its local fire time passed within this look-back window.
  // Wider than one tick so a missed/late tick (GC pause, brief restart) self-heals;
  // the ReminderLog unique constraint stops the extra ticks from double-sending.
  CATCHUP_WINDOW_MIN: 5,
  // How long a "Snooze" pushes a reminder out before the tick re-fires it.
  SNOOZE_MINUTES: 15,
  // Per-user Body Tuning macros change at most daily; cache them across ticks.
  MACRO_CACHE_TTL_MS: 10 * 60_000,
} as const;

// ----- Core types -----

/** Daily-schedule anchors in LOCAL time, as HHMM integers (2230 = 22:30). */
export type DailySchedule = {
  wakeHHMM: number;
  bedtimeHHMM: number;
  workoutHHMM: number | null; // null = rest day → training-anchored reminders skip
  mealsPerDay: number;
};

/** User-tunable per-habit overrides; each habit owns its own key set. */
export type HabitParams = Record<string, number | boolean | string>;

/** Active-block progress, for training-aware reminders (e.g. the deload nudge). */
export type TrainingState = { currentWeek: number | null; weeksCount: number | null };

/** Everything a registry entry needs to compute its fire times and build its payload. */
export type ReminderContext = {
  schedule: DailySchedule;
  params: HabitParams; // merged over the habit's registry defaults
  macros: Macros | null; // from Body Tuning; null when the profile is incomplete
  userName: string | null;
  // Optional so the pure unit tests can omit it; the scheduler always provides it.
  training?: TrainingState | null;
};

export type NotificationAction = { action: string; title: string };

export type NotificationPayload = {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  actions?: NotificationAction[];
  // Routing data the service worker echoes back to /api/push/action on Snooze/Done.
  // Set by the scheduler at send time (the habit doesn't know its localDate).
  data?: { habitKey: string; localDate: string; firingIndex: number };
};

/** UI/validation metadata for one tunable param — drives the settings control. */
export type ParamType = "minutes" | "integer" | "boolean" | "select";

export type ParamDef = {
  key: string;
  label: string;
  type: ParamType;
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string; // "min", "ml", "mg", …
  options?: { value: number | string; label: string }[]; // for type: "select"
  citation?: string; // PMC id / DOI backing the default
  hint?: string; // one-line science blurb shown in the UI
};

/** Pure: returns this habit's LOCAL fire times for today as HHMM ints. [] = nothing today. */
export type ComputeFireTimes = (ctx: ReminderContext) => number[];

/** Pure: builds the push payload for a single firing (firingIndex into computeFireTimes). */
export type BuildPayload = (ctx: ReminderContext, firingIndex: number) => NotificationPayload;

/** One declarative reminder. Adding a habit = adding one of these to the registry. */
export type HabitDefinition = {
  key: string; // stable identity; also the HabitConfig.habitKey and ReminderLog.habitKey
  label: string;
  description: string;
  icon: LucideIcon;
  group: "training" | "nutrition" | "recovery" | "wellbeing";
  defaultEnabled: boolean;
  params: ParamDef[];
  computeFireTimes: ComputeFireTimes;
  buildPayload: BuildPayload;
};

// ----- Time helpers (pure) -----

/** HHMM integer → minutes since local midnight. 2230 → 1350. */
export function hhmmToMin(hhmm: number): number {
  return Math.floor(hhmm / 100) * 60 + (hhmm % 100);
}

/** Minutes since midnight → HHMM integer, wrapping across the day. 1350 → 2230. */
export function minToHhmm(min: number): number {
  const wrapped = ((Math.round(min) % 1440) + 1440) % 1440;
  return Math.floor(wrapped / 60) * 100 + (wrapped % 60);
}

type LocalParts = { dateStr: string; minuteOfDay: number };

/** Resolve a UTC instant to a user's local "YYYY-MM-DD" + minute-of-day via Intl (no deps). */
function localParts(utcNow: Date, timezone: string): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(utcNow);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = Number(get("hour")) % 24; // some runtimes emit "24" at midnight
  const minute = Number(get("minute"));
  return { dateStr: `${get("year")}-${get("month")}-${get("day")}`, minuteOfDay: hour * 60 + minute };
}

/** The user's local calendar date ("YYYY-MM-DD") at a UTC instant. */
export function getLocalDateStr(utcNow: Date, timezone: string): string {
  return localParts(utcNow, timezone).dateStr;
}

/** The user's local minute-of-day (0..1439) at a UTC instant. */
export function getLocalMinuteOfDay(utcNow: Date, timezone: string): number {
  return localParts(utcNow, timezone).minuteOfDay;
}

/** True if a fire time has just passed (within the catch-up window) — i.e. it is due now. */
export function isDue(fireHHMM: number, localMinuteOfDay: number, windowMin: number): boolean {
  const delta = localMinuteOfDay - hhmmToMin(fireHHMM);
  return delta >= 0 && delta <= windowMin;
}

/** Indices of the fire times that are due right now. */
export function dueIndices(fireTimes: number[], localMinuteOfDay: number, windowMin: number): number[] {
  const out: number[] = [];
  fireTimes.forEach((f, i) => {
    if (isDue(f, localMinuteOfDay, windowMin)) out.push(i);
  });
  return out;
}

/** Awake window is [wake, bed); handles a past-midnight bedtime (bed < wake) by wrapping. */
export function isAwake(localMinuteOfDay: number, wakeHHMM: number, bedtimeHHMM: number): boolean {
  const w = hhmmToMin(wakeHHMM);
  const b = hhmmToMin(bedtimeHHMM);
  return w <= b ? localMinuteOfDay >= w && localMinuteOfDay < b : localMinuteOfDay >= w || localMinuteOfDay < b;
}

/** Quiet hours = outside the awake window. The scheduler never sends during these. */
export function isQuietHours(localMinuteOfDay: number, wakeHHMM: number, bedtimeHHMM: number): boolean {
  return !isAwake(localMinuteOfDay, wakeHHMM, bedtimeHHMM);
}

/** Length of the waking window in minutes, wrapping a past-midnight bedtime. */
export function wakingSpanMin(wakeHHMM: number, bedtimeHHMM: number): number {
  const w = hhmmToMin(wakeHHMM);
  const b = hhmmToMin(bedtimeHHMM);
  return b > w ? b - w : b + 1440 - w;
}

// ----- Param helpers (pure) -----

/** Default params object for a habit, derived from its ParamDef list. */
export function getDefaultParams(habit: HabitDefinition): HabitParams {
  return Object.fromEntries(habit.params.map((p) => [p.key, p.default]));
}

/** Registry defaults with the user's stored overrides applied on top. */
export function mergeParams(habit: HabitDefinition, overrides: HabitParams | null | undefined): HabitParams {
  return { ...getDefaultParams(habit), ...(overrides ?? {}) };
}

/** Coerce a raw form/JSON value to the type a ParamDef expects (used by the save action). */
export function coerceParamValue(def: ParamDef, raw: unknown): number | boolean | string {
  if (def.type === "boolean") return raw === true || raw === "true" || raw === "on";
  if (def.type === "select") {
    // Selects may carry numeric or string option values; keep the def's value type.
    const numeric = typeof def.default === "number";
    return numeric ? Number(raw) : String(raw);
  }
  return Number(raw); // minutes | integer
}
