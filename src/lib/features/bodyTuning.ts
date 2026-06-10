// Body Tuning engine. Two halves (like insights.ts):
//   1. PURE functions below — no I/O, deterministic, unit-tested. They encode the
//      evidence base; every coefficient lives in BODY_TUNING_CONSTANTS with a citation.
//   2. Async Prisma wrappers (Task 6) that fetch rows and feed these.
// Spec + sources: docs/superpowers/specs/2026-06-10-body-tuning-design.md

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
