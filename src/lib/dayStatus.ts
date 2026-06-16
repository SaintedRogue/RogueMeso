// Pure roll-up of a meso day's status from its exercises' set statuses. Lives outside the
// "use server" action module (which may only export async actions) so it stays unit-testable.

/** Set statuses that count as "work done" for roll-up purposes. */
export const DONE_STATUSES = new Set(["complete", "skipped"]);

/**
 * Derive a MesoDay's status from its exercises. Roll-up never *promotes* a day to
 * "complete" — finishing is an explicit user action (the "Complete session" button →
 * completeDay), so logging the final set leaves the day "partial" until the user confirms.
 * It only *preserves* a complete day (sticky) so re-editing a still-finished set doesn't
 * un-finish it, and demotes it the moment work is actually undone.
 *
 *  - "complete" only when it was ALREADY complete and every set is still done/skipped,
 *  - "partial"  when any set is done/skipped but the day isn't being kept complete,
 *  - otherwise the day is idle: keep an "up next" day (ready/current), else "pending".
 *
 * The idle branch matters for swaps: clearing an exercise's logged sets must let a
 * previously "complete"/"partial" day drop back, rather than stay falsely finished.
 */
export function rolledUpDayStatus(
  exercises: { sets: { status: string }[] }[],
  currentStatus: string,
): string {
  const allDone =
    exercises.length > 0 &&
    exercises.every((e) => e.sets.length > 0 && e.sets.every((s) => DONE_STATUSES.has(s.status)));
  const anyStarted = exercises.some((e) => e.sets.some((s) => DONE_STATUSES.has(s.status)));
  const idle = currentStatus === "ready" || currentStatus === "current" ? currentStatus : "pending";
  // Sticky: keep "complete" only if it was explicitly completed and nothing has been undone.
  if (allDone && currentStatus === "complete") return "complete";
  return anyStarted ? "partial" : idle;
}
