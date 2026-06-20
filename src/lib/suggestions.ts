// Derives "same day, last week" targets for the current day's sets. Pure + I/O-free so it's
// unit-testable; the page server components fetch both days and hand them here. Nothing is
// persisted — a suggestion is always recomputed from last week's actuals, never stale.

import { suggestedReps } from "@/lib/progression";
import { DONE_STATUSES } from "@/lib/dayStatus";

// `reps` is optional: the "same day last week" builder fills both, but the bodyweight fallback
// carries weight only (added/assist load is stable; reps aren't) and leaves reps on its target.
export type SetSuggestion = { weight: number; reps?: number };

// The day-payload subset both builders need. `exerciseType` is only read by the bodyweight
// fallback; buildSetSuggestions ignores it. Exported as the single source of truth for the
// shape callers (data.ts) must pass — no parallel re-declaration.
type SugSet = { id: number; position: number; weight: number | null; reps: number | null; status: string };
export type SugExercise = { exercise: { id: number; exerciseType?: string } | null; sets: SugSet[] };

// A set the user has already engaged with — logged/skipped, or with a weight typed in. Both
// builders only seed sets that are NOT yet engaged, so this is the shared gate.
const isEngaged = (set: SugSet) => DONE_STATUSES.has(set.status) || set.weight != null;

// The three equipment types whose "weight" is added/assistance load worth carrying across
// mesocycles. The normalize mirrors exerciseMatch's compact() so we match the @map value
// ("bodyweight-only") or the enum identifier ("bodyweightOnly") interchangeably.
const BODYWEIGHT_TYPES = new Set(["bodyweightonly", "bodyweightloadable", "machineassistance"]);
export function isBodyweightType(type: string | null | undefined): boolean {
  return !!type && BODYWEIGHT_TYPES.has(type.toLowerCase().replace(/[^a-z0-9]/g, ""));
}

/**
 * Fallback seed for bodyweight exercises: carry each one's last logged weight (across all
 * mesocycles) onto its still-unlogged sets, keyed by current set id. Weight only — reps fall
 * through to the set's own target. Callers merge this UNDER `buildSetSuggestions` so a "same
 * day last week" target (current-meso progression) always wins on overlap.
 */
export function buildBodyweightSeeds(
  currentExercises: SugExercise[],
  lastLoggedWeight: Record<number, number>,
): Record<number, SetSuggestion> {
  const out: Record<number, SetSuggestion> = {};
  for (const ex of currentExercises) {
    if (!ex.exercise || !isBodyweightType(ex.exercise.exerciseType)) continue;
    const weight = lastLoggedWeight[ex.exercise.id];
    if (weight == null) continue;
    for (const set of ex.sets) {
      if (isEngaged(set)) continue;
      out[set.id] = { weight };
    }
  }
  return out;
}

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
      if (isEngaged(set)) continue;
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
