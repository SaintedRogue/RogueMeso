"use client";

import { useState } from "react";
import { SetLogger } from "@/components/SetLogger";
import { useRestTimer } from "@/components/RestTimerProvider";
import { addSet, removeSet } from "@/lib/setActions";
import type { ViewSet } from "@/components/DayView";
import type { SetSuggestion } from "@/lib/suggestions";

/**
 * Owns the weight AND reps inputs for one exercise's sets so logging a set can pre-fill the
 * NEXT set ("assume the same effort again"). Both carry down as a non-destructive default:
 * they never overwrite a next set the user has already typed into or logged/skipped.
 *
 * Sets also seed from "same day last week" suggestions (weight + RIR-bumped reps). A seeded
 * value renders shaded and lives in `suggestedIds` until it's "locked in" — the user edits it
 * (their value now) or logs it. Carry-down outranks an unconfirmed suggestion (your most recent
 * set is a stronger signal than last week), but a value you typed always wins.
 *
 * Add/remove are surfaced through each row's ⋮ menu (in SetLogger). After either action
 * revalidatePath re-renders this subtree with the fresh set list.
 */
export function ExerciseSets({
  sets,
  targetRir,
  unit,
  dayExerciseId,
  suggestions = {},
  physicalTherapyLens = false,
  exerciseName = "",
  exerciseType = null,
}: {
  sets: ViewSet[];
  targetRir: number | null;
  unit: string;
  dayExerciseId: number;
  suggestions?: Record<number, SetSuggestion>;
  /** Physical Therapy Lens: reveal a per-set Left/Both/Right control (persisted on log). */
  physicalTherapyLens?: boolean;
  /** Shown on the rest-timer pill after a set is logged. */
  exerciseName?: string;
  /** Drives the rest duration (barbell rests longer than a machine). */
  exerciseType?: string | null;
}) {
  // Seed each field: a logged value wins, else the last-week suggestion, else empty.
  const [weights, setWeights] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      sets.map((s) => [s.id, s.weight?.toString() ?? suggestions[s.id]?.weight.toString() ?? ""]),
    ),
  );
  // A bodyweight fallback seeds weight only (reps optional), so a missing reps suggestion leaves
  // the field empty — it falls through to the set's own rep target placeholder.
  const [reps, setReps] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      sets.map((s) => [s.id, s.reps?.toString() ?? suggestions[s.id]?.reps?.toString() ?? ""]),
    ),
  );
  // Sets whose seeded values are still an unconfirmed suggestion (shaded, not locked in).
  const [suggestedIds, setSuggestedIds] = useState<Set<number>>(
    () => new Set(sets.filter((s) => suggestions[s.id]).map((s) => s.id)),
  );
  // Physical Therapy Lens: which side each set loaded (null in the DB == bilateral). Not carried
  // down — a unilateral lift alternates sides, so each set keeps its own choice.
  const [sides, setSides] = useState<Record<number, string>>(() =>
    Object.fromEntries(sets.map((s) => [s.id, s.side ?? "bilateral"])),
  );

  // Auto-start the between-sets rest countdown whenever a set is logged.
  const restTimer = useRestTimer();

  // Touching a field locks it in: it's the user's value now, not a suggestion.
  const confirm = (id: number) =>
    setSuggestedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  const setWeight = (id: number, value: string) => {
    setWeights((prev) => ({ ...prev, [id]: value }));
    confirm(id);
  };
  const setRepsFor = (id: number, value: string) => {
    setReps((prev) => ({ ...prev, [id]: value }));
    confirm(id);
  };

  // After logging set `index`, carry its weight + reps onto the next set. Overwrites an empty
  // or still-suggested next set; leaves a value the user typed alone.
  const fillNext = (index: number) => {
    const cur = sets[index];
    const next = sets[index + 1];
    if (!next || next.status === "complete" || next.status === "skipped") return;
    const w = weights[cur.id] ?? "";
    const r = reps[cur.id] ?? "";
    const canFill = (map: Record<number, string>) => !map[next.id] || suggestedIds.has(next.id);
    setWeights((prev) => (canFill(prev) ? { ...prev, [next.id]: w } : prev));
    setReps((prev) => (canFill(prev) ? { ...prev, [next.id]: r } : prev));
    // A carried-down value is a concrete default, no longer "last week". Safe no-op when the
    // next set wasn't a suggestion (confirm only deletes a present id).
    confirm(next.id);
  };

  return (
    <div className="divide-y divide-line/60">
      {sets.map((s, i) => (
        <SetLogger
          key={s.id}
          set={s}
          targetRir={targetRir}
          unit={unit}
          weight={weights[s.id] ?? ""}
          reps={reps[s.id] ?? ""}
          suggested={suggestedIds.has(s.id)}
          onWeightChange={(v) => setWeight(s.id, v)}
          onRepsChange={(v) => setRepsFor(s.id, v)}
          onLogged={() => {
            fillNext(i);
            restTimer.start(exerciseType, exerciseName);
          }}
          onAdd={(scope) => addSet(dayExerciseId, scope)}
          canRemove={sets.length > 1}
          onRemove={(scope) => removeSet(s.id, scope)}
          physicalTherapyLens={physicalTherapyLens}
          side={sides[s.id] ?? "bilateral"}
          onSideChange={(v) => setSides((prev) => ({ ...prev, [s.id]: v }))}
        />
      ))}
    </div>
  );
}
