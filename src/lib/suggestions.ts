// Derives "same day, last week" targets for the current day's sets. Pure + I/O-free so it's
// unit-testable; the page server components fetch both days and hand them here. Nothing is
// persisted — a suggestion is always recomputed from last week's actuals, never stale.

import { suggestedReps } from "@/lib/progression";
import { DONE_STATUSES } from "@/lib/dayStatus";

export type SetSuggestion = { weight: number; reps: number };

// Structural subsets of the day payload this builder needs.
type SugSet = { id: number; position: number; weight: number | null; reps: number | null; status: string };
type SugExercise = { exercise: { id: number } | null; sets: SugSet[] };

/**
 * Map current-set id → suggested {weight, reps}, for sets that are still unlogged and whose
 * matching set last week was actually completed. Exercises are matched by exercise id, sets by
 * position. Weight repeats last week's load; reps climb by the RIR drop (see `suggestedReps`).
 */
export function buildSetSuggestions(
  currentExercises: SugExercise[],
  prevExercises: SugExercise[],
  lastWeekRir: number | null,
  thisWeekRir: number | null,
): Record<number, SetSuggestion> {
  // Group last week's slots by exercise id; an exercise can legitimately appear more than once
  // in a day, so we keep a list and match by occurrence order rather than last-writer-wins.
  const prevByExercise = new Map<number, SugExercise[]>();
  for (const ex of prevExercises) {
    if (!ex.exercise) continue;
    const list = prevByExercise.get(ex.exercise.id) ?? [];
    list.push(ex);
    prevByExercise.set(ex.exercise.id, list);
  }

  const out: Record<number, SetSuggestion> = {};
  const seen = new Map<number, number>(); // exercise id → how many of its slots we've matched
  for (const ex of currentExercises) {
    if (!ex.exercise) continue;
    const occurrence = seen.get(ex.exercise.id) ?? 0;
    seen.set(ex.exercise.id, occurrence + 1);
    const prev = prevByExercise.get(ex.exercise.id)?.[occurrence];
    if (!prev) continue;
    for (const set of ex.sets) {
      // Only suggest into a set the user hasn't engaged with yet.
      if (DONE_STATUSES.has(set.status) || set.weight != null) continue;
      const prevSet = prev.sets.find((p) => p.position === set.position);
      if (!prevSet || prevSet.status !== "complete" || prevSet.weight == null || prevSet.reps == null) continue;
      out[set.id] = {
        weight: prevSet.weight,
        reps: suggestedReps(prevSet.reps, lastWeekRir, thisWeekRir),
      };
    }
  }
  return out;
}
