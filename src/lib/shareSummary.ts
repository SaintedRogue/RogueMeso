// Pure transforms behind the "share workout" image: condense a day's exercises into one
// scannable line each (set count + a single headline "top set"). Lives outside any
// "use server"/route module so it stays unit-testable and reusable by the image renderer.
//
// Bodyweight exercises store weight === null (only reps are logged), so summaries must
// treat "loaded" and "bodyweight" sets differently both when ranking and when formatting.

import { DONE_STATUSES } from "@/lib/dayStatus";

/** The minimal slice of an ExerciseSet this module needs (matches ViewSet's shape). */
export type SummarySet = {
  weight: number | null;
  reps: number | null;
  status: string;
};

export type SummaryExercise = {
  exercise: { name: string } | null;
  muscleGroup: { name: string };
  sets: SummarySet[];
};

export type ExerciseSummary = {
  name: string;
  muscleGroup: string;
  /** Sets the user has resolved (logged or skipped) — the numerator of "2/3 sets". */
  loggedCount: number;
  /** Total planned sets — the denominator. */
  plannedCount: number;
  /** The headline logged set, or null if nothing's been logged yet. */
  topSet: SummarySet | null;
  /** One-line detail: the top set ("185 lb × 6" / "15 reps"), else the target ("target 2 RIR" / "deload"). */
  detail: string;
};

/** A set counts toward the top-set headline only once actually logged (weight or reps entered). */
function isLogged(s: SummarySet): boolean {
  return s.status === "complete";
}

/**
 * The single headline set for an exercise — the "best" logged set to show off in the summary.
 *
 * DESIGN DECISION (yours to make): only LOGGED sets (status "complete") are candidates;
 * pending/skipped sets are never the top set. Among the candidates, which one is "best"?
 *  - Loaded lifts (weight != null): rank by heaviest weight, breaking ties by more reps.
 *  - Bodyweight lifts (weight == null): rank by most reps.
 * Return null when there are no logged sets.
 *
 * See tests/lib/shareSummary.test.ts for the exact behavior the tests pin down.
 */
export function pickTopSet(sets: SummarySet[]): SummarySet | null {
  const logged = sets.filter(isLogged);
  if (logged.length === 0) return null;
  // Heaviest wins; bodyweight sets (null weight) sort below any load and fall back to reps,
  // which also makes a pure-bodyweight exercise rank purely by reps.
  return logged.reduce((best, s) => {
    const bw = best.weight ?? -Infinity;
    const sw = s.weight ?? -Infinity;
    if (sw !== bw) return sw > bw ? s : best;
    return (s.reps ?? 0) > (best.reps ?? 0) ? s : best;
  });
}

/** Format the headline set for display: loaded lifts as "W unit × reps", bodyweight as "N reps". */
function formatTopSet(top: SummarySet, unit: string): string {
  if (top.weight == null) return `${top.reps ?? 0} reps`;
  const w = Number.isInteger(top.weight) ? top.weight : top.weight.toFixed(1);
  return `${w} ${unit} × ${top.reps ?? 0}`;
}

/** Condense one exercise into its summary line. `targetRir` is the planned RIR for the week (null = deload). */
export function summarizeExercise(ex: SummaryExercise, unit: string, targetRir: number | null): ExerciseSummary {
  const plannedCount = ex.sets.length;
  const loggedCount = ex.sets.filter((s) => DONE_STATUSES.has(s.status)).length;
  const topSet = pickTopSet(ex.sets);
  const detail = topSet
    ? formatTopSet(topSet, unit)
    : targetRir == null
      ? "deload"
      : `target ${targetRir} RIR`;
  return {
    name: ex.exercise?.name ?? "—",
    muscleGroup: ex.muscleGroup.name,
    loggedCount,
    plannedCount,
    topSet,
    detail,
  };
}
