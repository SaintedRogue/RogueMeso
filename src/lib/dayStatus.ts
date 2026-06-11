// Pure roll-up of a meso day's status from its exercises' set statuses. Lives outside the
// "use server" action module (which may only export async actions) so it stays unit-testable.

/** Set statuses that count as "work done" for roll-up purposes. */
export const DONE_STATUSES = new Set(["complete", "skipped"]);

/**
 * Derive a MesoDay's status from its exercises:
 *  - "complete" when every exercise has all its sets done/skipped,
 *  - "partial"  when any set is done/skipped but not all,
 *  - otherwise the day is idle: keep an "up next" day (ready/current), else "pending".
 *
 * The idle branch matters for swaps: clearing an exercise's logged sets must let a
 * previously "complete"/"partial" day drop back, rather than stay falsely finished.
 */
export function rolledUpDayStatus(
  exercises: { sets: { status: string }[] }[],
  currentStatus: string,
): string {
  const allComplete =
    exercises.length > 0 &&
    exercises.every((e) => e.sets.length > 0 && e.sets.every((s) => DONE_STATUSES.has(s.status)));
  const anyStarted = exercises.some((e) => e.sets.some((s) => DONE_STATUSES.has(s.status)));
  const idle = currentStatus === "ready" || currentStatus === "current" ? currentStatus : "pending";
  return allComplete ? "complete" : anyStarted ? "partial" : idle;
}
