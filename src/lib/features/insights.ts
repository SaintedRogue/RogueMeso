// Insights analytics. Split in two halves:
//   1. PURE transforms below — no I/O, deterministic, unit-tested. They TRUST that
//      callers pass only completed sets; the "completed only" filter lives in the
//      async wrappers (Task 3), so it has exactly one source of truth.
//   2. Async Prisma wrappers (added in Task 3) that fetch rows and feed these.

// ----- Row shapes the pure transforms consume -----
export type VolumeRow = { muscleGroup: string; week: number };
export type HistoryRow = { date: Date; weight: number; reps: number };
export type PrRow = { exercise: string; weight: number; reps: number; date: Date };

/**
 * Epley estimated 1RM. A true single (reps <= 1) is returned as-is (not inflated).
 * Assumes valid completed-set input (weight > 0, reps >= 1); negative reps are not guarded.
 */
export function estimated1RM(weight: number, reps: number): number {
  if (reps <= 1) return weight;
  return weight * (1 + reps / 30);
}

/** Set counts per muscle group across `weeksCount` weeks. One entry per muscle, sorted by name. */
export function weeklyVolume(
  rows: VolumeRow[],
  weeksCount: number,
): { muscleGroup: string; perWeek: number[] }[] {
  const byMg = new Map<string, number[]>();
  for (const r of rows) {
    if (r.week < 0 || r.week >= weeksCount) continue;
    let arr = byMg.get(r.muscleGroup);
    if (!arr) {
      arr = new Array(weeksCount).fill(0);
      byMg.set(r.muscleGroup, arr);
    }
    arr[r.week] += 1;
  }
  return [...byMg.entries()]
    .map(([muscleGroup, perWeek]) => ({ muscleGroup, perWeek }))
    .sort((a, b) => a.muscleGroup.localeCompare(b.muscleGroup));
}

/** Est-1RM points over time for one exercise, oldest first. */
export function buildHistory(
  rows: HistoryRow[],
): { date: Date; weight: number; reps: number; oneRm: number }[] {
  return rows
    .map((r) => ({
      date: r.date,
      weight: r.weight,
      reps: r.reps,
      oneRm: Math.round(estimated1RM(r.weight, r.reps)),
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Best est-1RM per exercise, sorted desc; `isNew` if the best set is within `windowDays`. */
export function personalRecords(
  rows: PrRow[],
  now: Date,
  windowDays = 14,
): { exercise: string; weight: number; reps: number; oneRm: number; date: Date; isNew: boolean }[] {
  const best = new Map<string, { exercise: string; weight: number; reps: number; date: Date; oneRm: number }>();
  for (const r of rows) {
    const oneRm = estimated1RM(r.weight, r.reps);
    const cur = best.get(r.exercise);
    if (!cur || oneRm > cur.oneRm || (oneRm === cur.oneRm && r.date > cur.date)) {
      best.set(r.exercise, { exercise: r.exercise, weight: r.weight, reps: r.reps, date: r.date, oneRm });
    }
  }
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  return [...best.values()]
    .map((b) => ({
      ...b,
      oneRm: Math.round(b.oneRm),
      isNew: now.getTime() - b.date.getTime() <= windowMs,
    }))
    .sort((a, b) => b.oneRm - a.oneRm);
}
