// RogueMeso progression engine — an isolated, tunable model of evidence-based hypertrophy
// periodization. Encodes well-established training principles:
//  - Volume by priority: Maintain = MV, Grow ≈ MEV (add volume only when needed),
//    Emphasize = ramp MEV → MRV while recovering well.
//  - Target RIR ramps down week-over-week to 0; the final week is a deload.
// All numbers live here so they're easy to adjust to your own approach.

import type { MgPriority } from "@prisma/client";

export const MEV_SETS = 2; // starting sets per exercise (week 1, ~MEV baseline)
export const MRV_SETS = 5; // cap (~MRV)
export const RIR_START_CAP = 3; // top of the weekly RIR ramp
export const DEFAULT_REPS_TARGET = 10;

/** Is this (0-indexed) week the deload? Deload = final week. */
export function isDeloadWeek(week: number, weeksCount: number): boolean {
  return week === weeksCount - 1;
}

/** Target RIR for a training week; null on the deload week. Ramps START→0. */
export function rirForWeek(week: number, weeksCount: number): number | null {
  if (isDeloadWeek(week, weeksCount)) return null;
  const start = Math.min(RIR_START_CAP, Math.max(0, weeksCount - 2));
  return Math.max(0, start - week);
}

/** Planned set count for one exercise, by its muscle group's priority and the week. */
export function plannedSets(priority: MgPriority, week: number, weeksCount: number): number {
  if (isDeloadWeek(week, weeksCount)) return Math.max(1, MEV_SETS - 1); // ~half volume
  const base = MEV_SETS;
  let added = 0;
  if (priority === "emphasize") added = week; // ramp MEV -> MRV each week
  else if (priority === "grow") added = Math.floor(week / 2); // add only periodically
  // maintain: stays at base (MV)
  return Math.min(MRV_SETS, base + added);
}
