// Pure helpers for adding/removing sets within an exercise group. Kept outside the
// "use server" action module (which may only export async actions) so they stay unit-testable.

import { DEFAULT_REPS_TARGET } from "@/lib/progression";

/** The minimal shape of an existing set needed to derive an appended set. */
type SetShape = {
  position: number;
  repsTarget: number | null;
  weightTarget: number | null;
  weightTargetMin: number | null;
  weightTargetMax: number | null;
  unit: string | null;
};

/** Fields for a new ExerciseSet, minus the dayExerciseId the caller attaches. */
export type NewSetData = {
  position: number;
  setType: string;
  repsTarget: number | null;
  weightTarget: number | null;
  weightTargetMin: number | null;
  weightTargetMax: number | null;
  unit: string | null;
  status: string;
};

/**
 * Build the row for one more set appended to an exercise group. "Add another set" means
 * "one more like the last one": the new set copies the last set's rep/weight targets and
 * unit, so the planned load carries down. Falls back to the engine default rep target and
 * the meso's unit when the group is somehow empty.
 */
export function nextSetData(existing: SetShape[], fallbackUnit: string): NewSetData {
  const last = existing.reduce<SetShape | null>(
    (max, s) => (max == null || s.position > max.position ? s : max),
    null,
  );
  return {
    position: last ? last.position + 1 : 0,
    setType: "regular",
    repsTarget: last?.repsTarget ?? DEFAULT_REPS_TARGET,
    weightTarget: last?.weightTarget ?? null,
    weightTargetMin: last?.weightTargetMin ?? null,
    weightTargetMax: last?.weightTargetMax ?? null,
    unit: last?.unit ?? fallbackUnit,
    status: "pendingWeight",
  };
}

/**
 * After removing a set, positions can have a gap (deleting set 2 of [1,2,3] leaves [1,3]).
 * Returns the {id, position} pairs whose position must change to keep the group contiguous
 * and 0-based, in display order — callers persist only these.
 */
export function reindex(remaining: { id: number; position: number }[]): { id: number; position: number }[] {
  const sorted = [...remaining].sort((a, b) => a.position - b.position);
  const changes: { id: number; position: number }[] = [];
  sorted.forEach((s, i) => {
    if (s.position !== i) changes.push({ id: s.id, position: i });
  });
  return changes;
}
