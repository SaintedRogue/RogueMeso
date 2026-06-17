// Body Tuning engine. Two halves (like insights.ts):
//   1. PURE functions below — no I/O, deterministic, unit-tested. They encode the
//      evidence base; every coefficient lives in BODY_TUNING_CONSTANTS with a citation.
//   2. Async Prisma wrappers (Task 6) that fetch rows and feed these.
// Evidence + sources: research/body-tuning-science.md
import { prisma } from "@/lib/prisma";

export type Sex = "M" | "F";
export type Goal = "cut" | "bulk" | "maintain";
export type ActivityLevel = "sedentary" | "light" | "moderate";

export type Profile = {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
  bodyFatPct: number | null; // 0..1 fraction
  activityLevel: ActivityLevel;
};

export const BODY_TUNING_CONSTANTS = {
  // RMR — Ten-Haaf 2014 (Sports Med 2023 meta-analysis, PMC10687135). Height in METERS.
  TEN_HAAF: { wt: 11.936, ht: 587.728, age: 8.129, sex: 191.027, intercept: 29.279 },
  // Tinsley 2019 FFM (PMC11216238) — lean physique athletes only.
  TINSLEY_FFM: { slope: 25.9, intercept: 284 },
  LEAN_BF_THRESHOLD: { M: 0.15, F: 0.23 } as Record<Sex, number>,
  // Training energy — duration-based MET model (Reis 2021 PMC8714826; Compendium PMC10818145).
  PER_SET_MINUTES: 3,
  MET_RESISTANCE: 5.0, // gross MET; we use (MET-1) as the delta above rest
  // NEAT multipliers on RMR (non-training daily activity).
  NEAT_MULT: { sedentary: 1.2, light: 1.35, moderate: 1.5 } as Record<ActivityLevel, number>,
  // Goal target rates (fraction of BW per week). Cut <=0.5% preserves FFM (PMC7052702).
  CUT_RATE_PCT: 0.005,
  LEAN_BULK_RATE_PCT: 0.003, // RE-VERIFY: range 0.0025–0.005 (PMC7052702)
  // Forward-prescription effective energy densities (kcal/kg) — Hall variable density.
  ED_CUT: 7700,
  ED_BULK: 5500,
  // Macros (ISSN PMC5477153; Roberts/Helms PMC7052702).
  PROTEIN_G_PER_KG: { cut: 2.6, bulk: 1.8, maintain: 2.0 } as Record<Goal, number>,
  FAT_FLOOR_G_PER_KG: 0.8, // RE-VERIFY: range 0.5–1.0 (PMC7052702)
  FAT_MIN_PCT: 0.2,
  // Safety floors.
  MIN_KCAL_FLOOR: { M: 1500, F: 1200 } as Record<Sex, number>,
  RMR_FLOOR_MULT: 1.0, // never prescribe below resting metabolism
  // Adaptive controller (Hall dynamic model; NIH Body Weight Planner).
  ADAPT_ENERGY_DENSITY: 7700,
  MIN_WEEKS_FOR_ADAPT: 3,
  ADAPT_RAMP_WEEKS: 6,
  MAX_BLEND: 0.5, // damping: never shift more than halfway toward measured per update
  EWMA_ALPHA: 0.25,
  MAX_PLAUSIBLE_KG_DELTA: 2.5, // reject day-over-day jumps beyond this from the trend
} as const;

/** Resting metabolic rate (kcal/24h). Ten-Haaf by default; Tinsley FFM for lean users with BF%. */
export function estimateRMR(p: Profile): number {
  const C = BODY_TUNING_CONSTANTS;
  const bf = p.bodyFatPct;
  if (bf != null && bf <= C.LEAN_BF_THRESHOLD[p.sex]) {
    const ffm = p.weightKg * (1 - bf);
    return C.TINSLEY_FFM.slope * ffm + C.TINSLEY_FFM.intercept;
  }
  const t = C.TEN_HAAF;
  const htM = p.heightCm / 100;
  return t.wt * p.weightKg + t.ht * htM - t.age * p.age + t.sex * (p.sex === "M" ? 1 : 0) + t.intercept;
}

/** Daily-averaged energy cost of resistance training, from logged weekly set count. */
export function estimateTrainingEnergyDaily(weeklySets: number, bodyweightKg: number): number {
  const C = BODY_TUNING_CONSTANTS;
  const hours = (weeklySets * C.PER_SET_MINUTES) / 60;
  const weeklyKcal = (C.MET_RESISTANCE - 1) * bodyweightKg * hours;
  return weeklyKcal / 7;
}

/** NEAT energy above RMR for the user's non-training activity level. */
export function estimateNEAT(rmr: number, activityLevel: ActivityLevel): number {
  return rmr * (BODY_TUNING_CONSTANTS.NEAT_MULT[activityLevel] - 1);
}

/** Formula-tier maintenance: RMR + NEAT + structured-training energy. */
export function maintenanceEstimate(p: Profile, weeklySets: number): number {
  const rmr = estimateRMR(p);
  return rmr + estimateNEAT(rmr, p.activityLevel) + estimateTrainingEnergyDaily(weeklySets, p.weightKg);
}

export type Macros = { kcal: number; proteinG: number; fatG: number; carbG: number };

/** Signed target rate of weight change (kg/week). Override is a signed fraction of BW/week. */
export function goalRateKgPerWeek(goal: Goal, weightKg: number, rateOverridePct?: number | null): number {
  const C = BODY_TUNING_CONSTANTS;
  let pct: number;
  if (rateOverridePct != null) pct = rateOverridePct;
  else if (goal === "cut") pct = -C.CUT_RATE_PCT;
  else if (goal === "bulk") pct = C.LEAN_BULK_RATE_PCT;
  else pct = 0;
  return pct * weightKg;
}

/** Goal-adjusted daily kcal target (rounded), clamped to evidence-based safety floors. */
export function goalAdjustedTarget(
  maintenance: number,
  goal: Goal,
  p: Profile,
  rateOverridePct?: number | null,
): number {
  const C = BODY_TUNING_CONSTANTS;
  const rateKg = goalRateKgPerWeek(goal, p.weightKg, rateOverridePct);
  const ed = rateKg < 0 ? C.ED_CUT : C.ED_BULK;
  const raw = maintenance + (rateKg * ed) / 7;
  const floor = Math.max(C.MIN_KCAL_FLOOR[p.sex], estimateRMR(p) * C.RMR_FLOOR_MULT);
  return Math.round(Math.max(raw, floor));
}

/** Protein-first macro split: protein by goal g/kg, fat floor, carbs as the remainder. */
export function macroTargets(targetKcal: number, p: Profile, goal: Goal): Macros {
  const C = BODY_TUNING_CONSTANTS;
  const proteinG = C.PROTEIN_G_PER_KG[goal] * p.weightKg;
  const proteinKcal = proteinG * 4;
  const fatKcal = Math.max(C.FAT_FLOOR_G_PER_KG * p.weightKg * 9, C.FAT_MIN_PCT * targetKcal);
  const carbKcal = Math.max(0, targetKcal - proteinKcal - fatKcal);
  return {
    kcal: Math.round(targetKcal),
    proteinG: Math.round(proteinG),
    fatG: Math.round(fatKcal / 9),
    carbG: Math.round(carbKcal / 4),
  };
}

/** Exponentially weighted moving average — smooths daily water-weight noise. */
export function ewma(series: number[], alpha: number = BODY_TUNING_CONSTANTS.EWMA_ALPHA): number[] {
  const out: number[] = [];
  for (let i = 0; i < series.length; i++) {
    out.push(i === 0 ? series[i] : alpha * series[i] + (1 - alpha) * out[i - 1]);
  }
  return out;
}

/** Slope of a smoothed weight series across its spanned days, expressed as kg/week. */
export function weeklyRateKg(smoothed: number[], spanDays: number): number {
  if (smoothed.length < 2 || spanDays <= 0) return 0;
  const delta = smoothed[smoothed.length - 1] - smoothed[0];
  return (delta / spanDays) * 7;
}

/**
 * Adherence-assumed maintenance, inferred from the gap between the prescribed target rate
 * and the observed rate. Derivation: intake = maintenance + targetRate·ED/7 (by construction),
 * and trueMaintenance = intake − observedRate·ED/7, so the maintenance terms collapse to this.
 */
export function measuredMaintenance(
  formulaMaintenance: number,
  targetRateKg: number,
  observedRateKg: number,
  ed: number = BODY_TUNING_CONSTANTS.ADAPT_ENERGY_DENSITY,
): number {
  return formulaMaintenance + ((targetRateKg - observedRateKg) * ed) / 7;
}

/** Confidence-ramped, damped blend of formula and measured maintenance. */
export function adaptiveMaintenance(formula: number, measured: number, weeksOfData: number): number {
  const C = BODY_TUNING_CONSTANTS;
  if (weeksOfData < C.MIN_WEEKS_FOR_ADAPT) return formula;
  const confidence = Math.min(1, (weeksOfData - C.MIN_WEEKS_FOR_ADAPT + 1) / C.ADAPT_RAMP_WEEKS);
  return formula + confidence * C.MAX_BLEND * (measured - formula);
}

/** UI badge state for how personalized the current estimate is. */
export function confidenceLabel(weeksOfData: number): "formula" | "personalizing" | "personalized" {
  const C = BODY_TUNING_CONSTANTS;
  if (weeksOfData < C.MIN_WEEKS_FOR_ADAPT) return "formula";
  if (weeksOfData - C.MIN_WEEKS_FOR_ADAPT + 1 >= C.ADAPT_RAMP_WEEKS) return "personalized";
  return "personalizing";
}

/** Whole-years age from a birth date as of `now`. Uses UTC to stay timezone-independent. */
export function ageFromBirthDate(birthDate: Date, now: Date): number {
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const m = now.getUTCMonth() - birthDate.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birthDate.getUTCDate())) age--;
  return age;
}

// ----- Async Prisma wrappers. I/O lives here; the pure functions above stay deterministic. -----

const DAY_MS = 24 * 60 * 60 * 1000;

export type BodyTuningResult = {
  needsProfile: boolean;
  profile: Profile | null;
  goal: Goal;
  mesoId: number | null;
  mesoName: string | null;
  rateOverride: number | null;
  weeklySets: number;
  formulaMaintenance: number;
  adjMaintenance: number;
  target: number;
  macros: Macros;
  confidence: "formula" | "personalizing" | "personalized";
  trend: { date: Date; weightKg: number; smoothedKg: number }[];
  observedRateKg: number;
  weeksOfData: number;
  latestWeightKg: number | null;
};

/** Assemble the engine Profile from the user row + latest weigh-in. Null if biometrics missing. */
export async function getProfile(userId: number, now: Date): Promise<Profile | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { heightCm: true, birthDate: true, bodySex: true, activityLevel: true },
  });
  if (!u || u.heightCm == null || u.birthDate == null || (u.bodySex !== "M" && u.bodySex !== "F")) {
    return null;
  }
  const latest = await prisma.weightEntry.findFirst({
    where: { userId },
    orderBy: { date: "desc" },
    select: { weightKg: true, bodyFatPct: true },
  });
  if (!latest) return null; // need at least one weigh-in for a bodyweight
  const al = u.activityLevel;
  const activityLevel: ActivityLevel = al === "light" || al === "moderate" ? al : "sedentary";
  return {
    weightKg: latest.weightKg,
    heightCm: u.heightCm,
    age: ageFromBirthDate(u.birthDate, now),
    sex: u.bodySex,
    bodyFatPct: latest.bodyFatPct,
    activityLevel,
  };
}

/** Completed working sets in the trailing 7 days (the training-energy driver). */
export async function getWeeklySetCount(userId: number, now: Date): Promise<number> {
  const since = new Date(now.getTime() - 7 * DAY_MS);
  return prisma.exerciseSet.count({
    where: {
      status: "complete",
      finishedAt: { gte: since, lte: now },
      dayExercise: { day: { meso: { userId } } },
    },
  });
}

/** Active mesocycle's nutrition goal (null -> maintain). */
export async function getActiveGoal(
  userId: number,
): Promise<{ goal: Goal; mesoId: number | null; mesoName: string | null; rateOverride: number | null }> {
  // Mirror insights.getInsightsMeso: the user's most recent non-archived block.
  const m = await prisma.mesocycle.findFirst({
    where: { userId, status: { not: "archived" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, nutritionGoal: true, targetRatePctPerWeek: true },
  });
  const raw = m?.nutritionGoal;
  const goal: Goal = raw === "cut" || raw === "bulk" ? raw : "maintain";
  // Ignore an out-of-range override (e.g. a stray 5.0 meaning 500%/week); fall back to the goal default.
  const rawOverride = m?.targetRatePctPerWeek ?? null;
  const rateOverride = rawOverride != null && Math.abs(rawOverride) <= 0.05 ? rawOverride : null;
  return { goal, mesoId: m?.id ?? null, mesoName: m?.name ?? null, rateOverride };
}

/** Smoothed bodyweight trend + observed weekly rate + weeks of data. */
export async function getWeightTrend(userId: number, now: Date) {
  const rows = await prisma.weightEntry.findMany({
    where: { userId, date: { gte: new Date(now.getTime() - 180 * DAY_MS) } },
    orderBy: { date: "asc" },
    select: { date: true, weightKg: true },
  });
  const C = BODY_TUNING_CONSTANTS;
  // Drop implausible day-over-day jumps before smoothing. Known limitation: comparing
  // against the previous KEPT row means a genuine large swing (e.g. a >2.5kg refeed
  // bounce) is discarded, which can slightly understate the trend for volatile users.
  const clean: { date: Date; weightKg: number }[] = [];
  for (const r of rows) {
    const prev = clean[clean.length - 1];
    if (prev && Math.abs(r.weightKg - prev.weightKg) > C.MAX_PLAUSIBLE_KG_DELTA) continue;
    clean.push(r);
  }
  const smoothed = ewma(clean.map((r) => r.weightKg));
  const spanDays =
    clean.length >= 2 ? Math.max(1, (clean[clean.length - 1].date.getTime() - clean[0].date.getTime()) / DAY_MS) : 0;
  const observedRateKg = weeklyRateKg(smoothed, spanDays);
  const weeksOfData = Math.floor(spanDays / 7);
  return {
    trend: clean.map((r, i) => ({ date: r.date, weightKg: r.weightKg, smoothedKg: Math.round(smoothed[i] * 10) / 10 })),
    observedRateKg,
    weeksOfData,
    latestWeightKg: clean.length ? clean[clean.length - 1].weightKg : null,
  };
}

/** Full Body Tuning computation for a user: targets, macros, trend, confidence. */
export async function computeBodyTuning(userId: number, now: Date): Promise<BodyTuningResult> {
  const [profile, weeklySets, active, trend] = await Promise.all([
    getProfile(userId, now),
    getWeeklySetCount(userId, now),
    getActiveGoal(userId),
    getWeightTrend(userId, now),
  ]);

  if (!profile) {
    return {
      needsProfile: true,
      profile: null,
      goal: active.goal,
      mesoId: active.mesoId,
      mesoName: active.mesoName,
      rateOverride: active.rateOverride,
      weeklySets,
      formulaMaintenance: 0,
      adjMaintenance: 0,
      target: 0,
      macros: { kcal: 0, proteinG: 0, fatG: 0, carbG: 0 },
      confidence: "formula",
      trend: trend.trend,
      observedRateKg: trend.observedRateKg,
      weeksOfData: trend.weeksOfData,
      latestWeightKg: trend.latestWeightKg,
    };
  }

  const formulaMaintenance = maintenanceEstimate(profile, weeklySets);
  const targetRateKg = goalRateKgPerWeek(active.goal, profile.weightKg, active.rateOverride);
  const measured = measuredMaintenance(formulaMaintenance, targetRateKg, trend.observedRateKg);
  const adjMaintenance = adaptiveMaintenance(formulaMaintenance, measured, trend.weeksOfData);
  const target = goalAdjustedTarget(adjMaintenance, active.goal, profile, active.rateOverride);
  const macros = macroTargets(target, profile, active.goal);

  return {
    needsProfile: false,
    profile,
    goal: active.goal,
    mesoId: active.mesoId,
    mesoName: active.mesoName,
    rateOverride: active.rateOverride,
    weeklySets,
    formulaMaintenance: Math.round(formulaMaintenance),
    adjMaintenance: Math.round(adjMaintenance),
    target,
    macros,
    confidence: confidenceLabel(trend.weeksOfData),
    trend: trend.trend,
    observedRateKg: trend.observedRateKg,
    weeksOfData: trend.weeksOfData,
    latestWeightKg: trend.latestWeightKg,
  };
}
