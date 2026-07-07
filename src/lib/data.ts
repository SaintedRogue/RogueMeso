import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseJsonArray } from "@/lib/json";
import { rirForWeek } from "@/lib/progression";
import { maxHrFor } from "@/lib/heartRate";
import { downsampleHr, hrSessionStats, mergePerSecond, setRecoveryDrop, type HrSessionStats } from "@/lib/features/hrInsights";
import {
  buildSetSuggestions,
  buildBodyweightSeeds,
  buildBodyweightOnlySeeds,
  isBodyweightType,
  type SetSuggestion,
  type SugExercise,
} from "@/lib/suggestions";
import { fromKg } from "@/lib/format";

// All queries are scoped to a user. Mesocycles are private; exercises/templates are the shared
// shared library (userId null) PLUS the user's own creations (userId === me).

/** A template is usable by `userId` if it's the seeded library, their own, or shared by an
 *  opted-in member. The single source of truth for both reads (getTemplate) and the
 *  copy-on-use guard (generateMesocycle). Callers must select `userId`, `sharedWithInstance`
 *  and `user.communityOptIn` + `user.active` (a deactivated author's shares disappear). */
export function isTemplateAccessible(
  tpl: { userId: number | null; sharedWithInstance: boolean; user?: { communityOptIn: boolean; active: boolean } | null },
  userId: number,
): boolean {
  return (
    tpl.userId === null ||
    tpl.userId === userId ||
    (tpl.sharedWithInstance && !!tpl.user?.communityOptIn && !!tpl.user?.active)
  );
}

export function getMesocycles(userId: number) {
  return prisma.mesocycle.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { days: true } } },
  });
}

// Shallow day list (status only) for the home screen, so we can pick the current
// day without deep-loading every week's exercises and sets.
const homeDays = {
  select: { week: true, position: true, status: true, label: true, finishedAt: true },
  orderBy: [{ week: "asc" }, { position: "asc" }],
} satisfies Prisma.Mesocycle$daysArgs;

/** The meso to show on the home/current-workout screen. The user's explicitly-activated block
 *  wins (activeAt is the single-active pointer); absent one (legacy data, pre-activate) we fall
 *  back to the newest unfinished block, then to the newest non-archived one. */
export async function getActiveMeso(userId: number) {
  return (
    (await prisma.mesocycle.findFirst({
      // status guard is defensive: write paths always clear activeAt before completing/archiving.
      where: { userId, activeAt: { not: null }, status: { notIn: ["complete", "archived"] } },
      orderBy: { activeAt: "desc" },
      include: { days: homeDays },
    })) ??
    (await prisma.mesocycle.findFirst({
      where: { userId, status: { notIn: ["complete", "archived"] }, finishedAt: null },
      orderBy: { createdAt: "desc" },
      include: { days: homeDays },
    })) ??
    (await prisma.mesocycle.findFirst({
      where: { userId, status: { not: "archived" } },
      orderBy: { createdAt: "desc" },
      include: { days: homeDays },
    }))
  );
}

const dayInclude = {
  exercises: {
    orderBy: { position: "asc" },
    include: {
      exercise: true,
      muscleGroup: true,
      sets: { orderBy: { position: "asc" } },
    },
  },
} as const;

export async function getMesocycle(key: string, userId: number) {
  const meso = await prisma.mesocycle.findUnique({
    where: { key },
    include: {
      priorities: { include: { muscleGroup: true } },
      days: { orderBy: [{ week: "asc" }, { position: "asc" }], include: dayInclude },
    },
  });
  if (!meso || meso.userId !== userId) return null; // ownership enforced
  return meso;
}

export function getDay(mesoKey: string, week: number, position: number, userId: number) {
  return prisma.mesoDay.findFirst({
    where: { meso: { key: mesoKey, userId }, week, position },
    include: { ...dayInclude, meso: true },
  });
}

// ----- Physical Therapy Lens: per-session check-ins -----

/** Raw SessionCheckIn columns (JSON arrays as strings), or null when the session has no check-in. */
export type SessionCheckInRow = {
  prePainScore: number | null;
  prePainLocations: string | null;
  preNote: string | null;
  preSubmittedAt: Date | null;
  postPainScore: number | null;
  postPainLocations: string | null;
  postPainTiming: string | null;
  postRangeOfMotion: string | null;
  postQualityTags: string | null;
  postNote: string | null;
  postSubmittedAt: Date | null;
} | null;

/** Compact summary of the previous session's post check-in, shown for context in the pre form. */
export type LastSessionSummary = {
  label: string | null;
  week: number;
  painScore: number | null;
  regions: string[];
} | null;

const checkInSelect = {
  prePainScore: true,
  prePainLocations: true,
  preNote: true,
  preSubmittedAt: true,
  postPainScore: true,
  postPainLocations: true,
  postPainTiming: true,
  postRangeOfMotion: true,
  postQualityTags: true,
  postNote: true,
  postSubmittedAt: true,
} as const;

/** The pre + post check-in for one session, or null if none has been started. */
export function getSessionCheckIn(dayId: number): Promise<SessionCheckInRow> {
  return prisma.sessionCheckIn.findUnique({ where: { dayId }, select: checkInSelect });
}

/**
 * The most recent *other* session (owned by the same user) that has a submitted post check-in —
 * i.e. "last session" — summarized for the pre-form "how has it evolved?" context. Derives the
 * owner from the current day so callers don't have to thread userId through.
 */
export async function getLastSessionSymptoms(currentDayId: number): Promise<LastSessionSummary> {
  const cur = await prisma.mesoDay.findUnique({
    where: { id: currentDayId },
    select: { meso: { select: { userId: true } } },
  });
  const userId = cur?.meso.userId;
  if (userId == null) return null;
  const row = await prisma.sessionCheckIn.findFirst({
    where: { postSubmittedAt: { not: null }, dayId: { not: currentDayId }, day: { meso: { userId } } },
    orderBy: { postSubmittedAt: "desc" },
    select: { postPainScore: true, postPainLocations: true, day: { select: { label: true, week: true } } },
  });
  if (!row) return null;
  return {
    label: row.day.label,
    week: row.day.week,
    painScore: row.postPainScore,
    regions: parseJsonArray(row.postPainLocations),
  };
}

/**
 * Bundle a session's check-in + last-session context for the workout screen. Returns nulls when
 * the lens is off, so callers can pass the result straight to DayView without branching.
 */
export async function getSessionContext(
  dayId: number,
  lensEnabled: boolean,
): Promise<{ checkIn: SessionCheckInRow; lastSession: LastSessionSummary }> {
  if (!lensEnabled) return { checkIn: null, lastSession: null };
  const [checkIn, lastSession] = await Promise.all([getSessionCheckIn(dayId), getLastSessionSymptoms(dayId)]);
  return { checkIn, lastSession };
}

/**
 * Shaded targets for the current day's sets, keyed by current set id. Two layered sources:
 *  - "same day last week" (current-meso progression) — empty on week 0 or if the prior day is missing.
 *  - bodyweight fallback — each bodyweight exercise's last logged load, carried across all
 *    mesocycles, for sets last week didn't already cover (incl. week 0 / a brand-new block).
 * Last week wins on overlap. The single place this policy lives, shared by home and day screens.
 */
export async function getDaySuggestions(
  mesoKey: string,
  week: number,
  position: number,
  weeksCount: number,
  userId: number,
  unit: string,
  currentExercises: SugExercise[],
): Promise<Record<number, SetSuggestion>> {
  let lastWeek: Record<number, SetSuggestion> = {};
  if (week > 0) {
    const prev = await getDay(mesoKey, week - 1, position, userId);
    if (prev) {
      lastWeek = buildSetSuggestions(
        currentExercises,
        prev.exercises,
        rirForWeek(week - 1, weeksCount),
        rirForWeek(week, weeksCount),
      );
    }
  }
  const bodyweightIds = currentExercises.flatMap((e) =>
    e.exercise && isBodyweightType(e.exercise.exerciseType) ? [e.exercise.id] : [],
  );
  const lastLogged = await getLastLoggedWeights(userId, bodyweightIds);
  const bodyweightSeeds = buildBodyweightSeeds(currentExercises, lastLogged);
  const merged: Record<number, SetSuggestion> = { ...bodyweightSeeds, ...lastWeek };
  // Pure-bodyweight exercises (calf raises, push-ups): the load IS today's body weight, and it's
  // fresher than last week's logged value — overlay it onto the weight field while keeping last
  // week's reps progression. Null body weight (no weigh-in) leaves the existing seed untouched.
  const bodyWeight = await getCurrentBodyweight(userId, unit);
  const bwSeeds = buildBodyweightOnlySeeds(currentExercises, bodyWeight);
  for (const [id, weight] of Object.entries(bwSeeds)) {
    const setId = Number(id);
    merged[setId] = { weight, reps: merged[setId]?.reps };
  }
  return merged;
}

/**
 * The user's current body weight in their DISPLAY unit (weight is stored canonically in kg), taken
 * from their most recent weigh-in. Rounded to one decimal so a kg→lb conversion doesn't seed a
 * noisy value into the set-logger. Null when the user has never logged a weight.
 */
export async function getCurrentBodyweight(userId: number, unit: string): Promise<number | null> {
  const latest = await prisma.weightEntry.findFirst({
    where: { userId },
    orderBy: { date: "desc" },
    select: { weightKg: true },
  });
  if (!latest) return null;
  return Math.round(fromKg(latest.weightKg, unit) * 10) / 10;
}

/**
 * Most recent logged weight per exercise for `userId`, across ALL their mesocycles. Used to seed
 * bodyweight sets — added/assist load is stable session-to-session, so the last value is the best
 * default. Returns exerciseId → weight; empty when no ids are requested. Orders real timestamps
 * first (nulls last) so legacy/imported sets without a finishedAt never masquerade as the latest.
 */
export async function getLastLoggedWeights(
  userId: number,
  exerciseIds: number[],
): Promise<Record<number, number>> {
  if (exerciseIds.length === 0) return {};
  const rows = await prisma.exerciseSet.findMany({
    where: {
      status: "complete",
      weight: { not: null },
      dayExercise: { exerciseId: { in: exerciseIds }, day: { meso: { userId } } },
    },
    orderBy: [{ finishedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
    select: { weight: true, dayExercise: { select: { exerciseId: true } } },
  });
  const out: Record<number, number> = {};
  for (const r of rows) {
    const id = r.dayExercise.exerciseId;
    // Rows are latest-first; the query already filters weight non-null, so first seen wins.
    if (out[id] == null && r.weight != null) out[id] = r.weight;
  }
  return out;
}

export async function getExercises(userId: number, search?: string, muscleGroupId?: number) {
  return prisma.exercise.findMany({
    where: {
      OR: [{ userId: null }, { userId }],
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
      ...(muscleGroupId ? { muscleGroupId } : {}),
    },
    include: { muscleGroup: true },
    orderBy: [{ muscleGroup: { name: "asc" } }, { name: "asc" }],
  });
}

export function getMuscleGroups() {
  return prisma.muscleGroup.findMany({ orderBy: { sourceId: "asc" } });
}

export function getTemplates(userId: number) {
  return prisma.template.findMany({
    where: { OR: [{ userId: null }, { userId }] },
    orderBy: [{ name: "asc" }, { frequency: "asc" }],
    include: { _count: { select: { days: true } } },
  });
}

export async function getTemplate(key: string, userId: number) {
  const tpl = await prisma.template.findUnique({
    where: { key },
    include: {
      user: { select: { id: true, name: true, email: true, communityOptIn: true, active: true } },
      priorities: { include: { muscleGroup: true } },
      days: {
        orderBy: { position: "asc" },
        include: { slots: { orderBy: { position: "asc" }, include: { exercise: true, muscleGroup: true } } },
      },
    },
  });
  if (!tpl) return null;
  return isTemplateAccessible(tpl, userId) ? tpl : null;
}

// ----- Wearables: session heart-rate view -----

export type SessionHrView = {
  points: { ts: number; bpm: number }[]; // downsampled for the chart
  markers: { ts: number; label: string }[]; // one per logged set (finishedAt)
  stats: HrSessionStats;
  recoveryDrop: number | null; // avg bpm drop within 90s of a set, null if unmeasurable
  maxHr: number;
};

/**
 * Receipt for the Profile → Wearables panel: proof the watch recorder is delivering,
 * even when no session has claimed the samples yet (a test run is otherwise invisible —
 * the exact confusion this line exists to prevent).
 */
export async function getWatchSyncReceipt(
  userId: number,
): Promise<{ lastAt: Date; count24h: number } | null> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60_000);
  const [latest, count24h] = await Promise.all([
    prisma.hrSample.findFirst({
      where: { userId, dayId: null },
      orderBy: { at: "desc" },
      select: { at: true },
    }),
    prisma.hrSample.count({ where: { userId, dayId: null, at: { gte: dayAgo } } }),
  ]);
  return latest ? { lastAt: latest.at, count24h } : null;
}

/** How far beyond the session's own bounds recorder samples still count as "this session". */
const HR_WINDOW_SLACK_MS = 15 * 60_000;
/** An unfinished session's claim window never extends past this — a day left open must
 *  not hoover up unrelated recorder samples hours or days later. (Recorder caps at 3h.) */
const HR_MAX_SESSION_MS = 6 * 60 * 60_000;

/**
 * Everything the session heart-rate card needs, or null when the day has no meaningful
 * capture (< 60 samples ≈ a minute — less renders as noise, not insight). Two sources
 * merge here (recorder spec §1/§6): live Web Bluetooth rows carry the dayId directly;
 * on-watch recorder rows are day-agnostic and match by time window around the session
 * (startedAt − 15 min … finishedAt|now + 15 min). Same-second duplicates collapse.
 */
export async function getSessionHrView(
  dayId: number,
  user: { id: number; birthDate: Date | null },
): Promise<SessionHrView | null> {
  const day = await prisma.mesoDay.findUnique({
    where: { id: dayId },
    select: { startedAt: true, finishedAt: true },
  });
  const windowed =
    day?.startedAt != null
      ? [
          {
            dayId: null,
            at: {
              gte: new Date(day.startedAt.getTime() - HR_WINDOW_SLACK_MS),
              lte: new Date(
                Math.min(
                  (day.finishedAt ?? new Date()).getTime(),
                  day.startedAt.getTime() + HR_MAX_SESSION_MS,
                ) + HR_WINDOW_SLACK_MS,
              ),
            },
          },
        ]
      : [];
  const samples = await prisma.hrSample.findMany({
    where: { userId: user.id, OR: [{ dayId }, ...windowed] },
    orderBy: { at: "asc" },
    select: { at: true, bpm: true },
  });
  // ≥20 readings ≈ 20 min of per-minute backfill or 20s of live capture — below that
  // it's noise, not insight. (Was 60 when 1 Hz was the only source.)
  if (samples.length < 20) return null;
  const raw = mergePerSecond(samples.map((s) => ({ ts: s.at.getTime(), bpm: s.bpm })));
  const maxHr = maxHrFor(user.birthDate, new Date());
  const stats = hrSessionStats(raw, maxHr);
  if (!stats) return null;

  const sets = await prisma.exerciseSet.findMany({
    where: { dayExercise: { dayId }, finishedAt: { not: null } },
    orderBy: { finishedAt: "asc" },
    select: { position: true, finishedAt: true, dayExercise: { select: { exercise: { select: { name: true } } } } },
  });
  const markers = sets.map((s) => ({
    ts: s.finishedAt!.getTime(),
    label: `${s.dayExercise.exercise?.name ?? "Set"} · set ${s.position + 1}`,
  }));

  return {
    points: downsampleHr(raw),
    markers,
    stats,
    recoveryDrop: setRecoveryDrop(raw, markers.map((m) => m.ts)),
    maxHr,
  };
}
