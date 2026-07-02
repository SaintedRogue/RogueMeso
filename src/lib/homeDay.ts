import { DONE_STATUSES } from "@/lib/dayStatus";

/** Minimal day shape the home-screen picker needs. */
export type HomeDayLike = { week: number; position: number; status: string; finishedAt: Date | null };

/**
 * Pick which day the home screen shows, and (when relevant) the next workout to advance to.
 *
 * The rule that keeps the completion experience visible: after you finish a session, stay on that
 * completed day for the rest of *your* local day instead of jumping straight to the next workout.
 * The next day it advances on its own; a manual "Start next workout" uses `next`.
 *
 * Precedence: an in-progress (partial) day always wins → else a session completed *today* (so the
 * complete state + survey stay put) → else the next non-done day → else the first day.
 * `next` is the upcoming workout, returned only while we're parked on a completed-today session.
 */
export function pickHomeDay<T extends HomeDayLike>(
  days: T[],
  todayLocal: string,
  toLocalDate: (d: Date) => string,
): { current: T | null; next: T | null } {
  const inProgress = days.find((d) => d.status === "partial") ?? null;
  const nextUp = days.find((d) => !DONE_STATUSES.has(d.status)) ?? null;

  let doneToday: T | null = null;
  for (const d of days) {
    if (d.status !== "complete" || !d.finishedAt) continue;
    if (toLocalDate(d.finishedAt) !== todayLocal) continue;
    if (!doneToday || d.finishedAt > doneToday.finishedAt!) doneToday = d;
  }

  const current = inProgress ?? doneToday ?? nextUp ?? days[0] ?? null;
  const next = current !== null && current === doneToday ? nextUp : null;
  return { current, next };
}
