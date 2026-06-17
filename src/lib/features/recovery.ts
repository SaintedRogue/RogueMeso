// Recovery engine. Two halves (like bodyTuning.ts):
//   1. PURE functions below — no I/O, deterministic, unit-tested. They encode the
//      evidence base; every constant lives in RECOVERY_CONSTANTS with a citation.
//   2. Async Prisma wrappers at the bottom that fetch rows and feed these.
//
// The readiness score is ADVISORY ONLY. It is surfaced to the user but never feeds back
// into progression.ts / programmed sets / RIR — auto-regulation evidence is weak, so we
// show a signal and let the user decide. See the Recovery hub plan + deep-research pass.
import { prisma } from "@/lib/prisma";
import { getActiveMeso } from "@/lib/data";
import { getTrainingState } from "@/lib/features/adhdData";

export type RecoveryCategory = "active_recovery" | "foam_rolling" | "mobility";
export type ReadinessBandColor = "good" | "warn" | "bad";

export const RECOVERY_CONSTANTS = {
  // --- Readiness score weights (sum to 1). Sleep is heaviest: under-sleep raises RPE
  // SMD 0.39 — the same load feels harder (PMC11996801; Vitale 2021 sleep-extension review).
  SLEEP_WEIGHT: 0.45,
  // Soreness proxies accumulated DOMS/fatigue; active recovery cuts DOMS SMD -0.94 (PMC5932411).
  SORENESS_WEIGHT: 0.3,
  // Energy/mood is the weakest, most subjective input — kept light (advisory-only design).
  ENERGY_WEIGHT: 0.25,

  // --- Sleep thresholds (hours). Below the floor sleep score bottoms out; at/above the
  // ceiling it is full. Target 7–9 h for adults; athletes trend higher (Watson 2015 PMC4434546).
  SLEEP_FLOOR_H: 5,
  SLEEP_TARGET_H: 8,
  SLEEP_CEIL_H: 9,

  // --- Self-report scales (inclusive). 1 = best for energy, 1 = least sore.
  SCALE_MIN: 1,
  SCALE_MAX: 5,

  // --- Advisory score bands (first match wins, walked high→low). Colors map to the
  // app's --color-good/warn/bad design tokens.
  SCORE_BANDS: [
    { min: 80, label: "Ready", color: "good" },
    { min: 60, label: "Moderate", color: "warn" },
    { min: 0, label: "Low", color: "bad" },
  ] as const,

  // --- Routine selection by training context (read-only off the engine):
  //   deload week   → mobility/ROM work (shed load; framed as ROM, NOT a DOMS cure)
  //   training day  → foam rolling/SMR (DOMS benefit g=0.47 grows from 24h; PMC6465761)
  //   off day       → light active recovery (walking 10–20 min rivals foam rolling; PMC5932411)
  DELOAD_CATEGORY: "mobility",
  TRAINING_DAY_CATEGORY: "foam_rolling",
  OFF_DAY_CATEGORY: "active_recovery",
} as const;

export type ReadinessLabel = { label: string; color: ReadinessBandColor };

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Sleep input normalised to 0..1 between the floor and ceiling hours (clamped). */
export function sleepNormalised(sleepHours: number): number {
  const C = RECOVERY_CONSTANTS;
  return clamp01((sleepHours - C.SLEEP_FLOOR_H) / (C.SLEEP_CEIL_H - C.SLEEP_FLOOR_H));
}

/** Soreness (1=none .. 5=very sore) normalised to 0..1, inverted so less sore scores higher. */
export function sorenessNormalised(soreness: number): number {
  const C = RECOVERY_CONSTANTS;
  return clamp01((C.SCALE_MAX - soreness) / (C.SCALE_MAX - C.SCALE_MIN));
}

/** Energy (1=drained .. 5=great) normalised to 0..1. */
export function energyNormalised(energy: number): number {
  const C = RECOVERY_CONSTANTS;
  return clamp01((energy - C.SCALE_MIN) / (C.SCALE_MAX - C.SCALE_MIN));
}

/** Advisory readiness score 0..100 from a daily check-in. Deterministic; never adjusts load. */
export function computeReadinessScore(sleepHours: number, soreness: number, energy: number): number {
  const C = RECOVERY_CONSTANTS;
  const weighted =
    sleepNormalised(sleepHours) * C.SLEEP_WEIGHT +
    sorenessNormalised(soreness) * C.SORENESS_WEIGHT +
    energyNormalised(energy) * C.ENERGY_WEIGHT;
  return Math.round(clamp01(weighted) * 100);
}

/** The score band (label + design-token color) for an advisory score. */
export function readinessLabel(score: number): ReadinessLabel {
  const band = RECOVERY_CONSTANTS.SCORE_BANDS.find((b) => score >= b.min) ?? RECOVERY_CONSTANTS.SCORE_BANDS[2];
  return { label: band.label, color: band.color };
}

/** Which routine category to surface, by training context. Deload takes priority. */
export function selectRoutineCategory(isDeload: boolean, isTrainingDay: boolean): RecoveryCategory {
  const C = RECOVERY_CONSTANTS;
  if (isDeload) return C.DELOAD_CATEGORY as RecoveryCategory;
  if (isTrainingDay) return C.TRAINING_DAY_CATEGORY as RecoveryCategory;
  return C.OFF_DAY_CATEGORY as RecoveryCategory;
}

/** Stable display order for the browsable library when nothing is suggested first. */
export const CATEGORY_ORDER: RecoveryCategory[] = ["active_recovery", "foam_rolling", "mobility"];

/**
 * Group routines by category for the browsable library. Empty categories are dropped, and
 * when a `suggested` category is given it floats to the front so today's pick reads first.
 * Generic over the routine shape (only `.category` is read) so it stays trivially testable.
 */
export function groupRoutinesByCategory<T extends { category: RecoveryCategory }>(
  routines: T[],
  suggested?: RecoveryCategory,
): { category: RecoveryCategory; routines: T[] }[] {
  const order = suggested ? [suggested, ...CATEGORY_ORDER.filter((c) => c !== suggested)] : CATEGORY_ORDER;
  return order
    .map((category) => ({ category, routines: routines.filter((r) => r.category === category) }))
    .filter((g) => g.routines.length > 0);
}

/** Whether to nudge the user toward more sleep (below the 7–9 h target band). */
export function shouldSuggestSleepExtension(sleepHours: number): boolean {
  return sleepHours < RECOVERY_CONSTANTS.SLEEP_TARGET_H;
}

// ----- Async Prisma wrappers. I/O lives here; the pure functions above stay deterministic. -----

export type RecoveryStep = { movement: string; durationSec: number; cue?: string };

export type RecoveryRoutineView = {
  id: number;
  key: string;
  name: string;
  category: RecoveryCategory;
  durationMin: number;
  bodyFocus: string;
  steps: RecoveryStep[];
  rationale: string;
  citation: string;
  guardrail: string | null;
};

export type ReadinessView = {
  date: Date;
  sleepHours: number;
  soreness: number;
  energy: number;
  note: string | null;
  score: number;
};

export type RoutineGroup = { category: RecoveryCategory; routines: RecoveryRoutineView[] };

export type RecoveryResult = {
  latestEntry: ReadinessView | null;
  todayLogged: boolean;
  score: number | null;
  label: ReadinessLabel | null;
  suggestSleepExtension: boolean;
  suggestedCategory: RecoveryCategory;
  /** Today's suggested-category routines (a shortcut into `library`). */
  routines: RecoveryRoutineView[];
  /** The full browsable library, grouped by category with the suggested one first. */
  library: RoutineGroup[];
  isDeload: boolean;
  isTrainingDay: boolean;
};

/** UTC midnight for a given instant — matches how dated logs (WeightEntry) are keyed. */
function utcDay(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Coerce the JSON `steps` blob into a typed array, tolerating malformed rows. */
function asSteps(value: unknown): RecoveryStep[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((s) => {
    if (s && typeof s === "object" && typeof (s as RecoveryStep).movement === "string") {
      const step = s as RecoveryStep;
      return [{ movement: step.movement, durationSec: Number(step.durationSec) || 0, cue: step.cue }];
    }
    return [];
  });
}

/** The user's most recent readiness check-in, or null. */
export async function getLatestReadiness(userId: number): Promise<ReadinessView | null> {
  const row = await prisma.readinessEntry.findFirst({
    where: { userId },
    orderBy: { date: "desc" },
    select: { date: true, sleepHours: true, soreness: true, energy: true, note: true, score: true },
  });
  return row;
}

/** Map a RecoveryRoutine row to its typed view (steps coerced from JSON). */
function toRoutineView(r: {
  id: number;
  key: string;
  name: string;
  category: string;
  durationMin: number;
  bodyFocus: string;
  steps: unknown;
  rationale: string;
  citation: string;
  guardrail: string | null;
}): RecoveryRoutineView {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    category: r.category as RecoveryCategory,
    durationMin: r.durationMin,
    bodyFocus: r.bodyFocus,
    steps: asSteps(r.steps),
    rationale: r.rationale,
    citation: r.citation,
    guardrail: r.guardrail,
  };
}

/** All curated routines in a category, shortest first. */
export async function getRoutinesByCategory(category: RecoveryCategory): Promise<RecoveryRoutineView[]> {
  const rows = await prisma.recoveryRoutine.findMany({
    where: { category },
    orderBy: { durationMin: "asc" },
  });
  return rows.map(toRoutineView);
}

/** The entire curated routine library, ordered by category then duration. */
export async function getAllRoutines(): Promise<RecoveryRoutineView[]> {
  const rows = await prisma.recoveryRoutine.findMany({
    orderBy: [{ category: "asc" }, { durationMin: "asc" }],
  });
  return rows.map(toRoutineView);
}

/**
 * Assemble everything the Recovery hub needs: the latest check-in + advisory score, and
 * the routine category for today's training context. Reads engine state (deload week,
 * active-meso day status) READ-ONLY — it never writes back to the training plan.
 */
export async function computeRecovery(userId: number, now: Date): Promise<RecoveryResult> {
  const [latest, training, active, allRoutines] = await Promise.all([
    getLatestReadiness(userId),
    getTrainingState(userId),
    getActiveMeso(userId),
    getAllRoutines(),
  ]);

  // Deload = the final programmed week of the active block (mirrors the ADHD deload habit).
  const isDeload =
    training.currentWeek != null && training.weeksCount != null && training.currentWeek >= training.weeksCount - 1;

  // Training day = an active block with an actionable (not complete/skipped) day queued up.
  // No active block, or every day done, reads as an off day → active recovery.
  const isTrainingDay = !!active?.days.some((d) => !["complete", "skipped"].includes(d.status));

  const suggestedCategory = selectRoutineCategory(isDeload, isTrainingDay);
  // Full browsable library with the suggested category first; the suggested-only list is
  // just a shortcut into it (no extra query).
  const library = groupRoutinesByCategory(allRoutines, suggestedCategory);
  const routines = library.find((g) => g.category === suggestedCategory)?.routines ?? [];

  const today = utcDay(now);
  const todayLogged = !!latest && utcDay(latest.date).getTime() === today.getTime();
  const score = latest?.score ?? null;

  return {
    latestEntry: latest,
    todayLogged,
    score,
    label: score != null ? readinessLabel(score) : null,
    suggestSleepExtension: latest != null && shouldSuggestSleepExtension(latest.sleepHours),
    suggestedCategory,
    routines,
    library,
    isDeload,
    isTrainingDay,
  };
}
