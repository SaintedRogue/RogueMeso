"use client";

import { useState } from "react";
import { SetLogger } from "@/components/SetLogger";
import { addSet, removeSet } from "@/lib/setActions";
import type { ViewSet } from "@/components/DayView";

/**
 * Owns the weight inputs for one exercise's sets so logging a set can pre-fill the
 * NEXT set's weight ("assume the same load again"). Reps stay local to each SetLogger —
 * only weight carries down. The fill is a non-destructive default: it never overwrites a
 * next set that already has a value or has been logged/skipped, so manual edits win.
 *
 * Add/remove are surfaced through each row's ⋮ menu (in SetLogger) rather than an
 * always-visible control, so a structural change is deliberate. After either action
 * revalidatePath re-renders this subtree with the fresh set list — there's no separate
 * client-side set list to keep in sync.
 */
export function ExerciseSets({
  sets,
  targetRir,
  unit,
  dayExerciseId,
}: {
  sets: ViewSet[];
  targetRir: number | null;
  unit: string;
  dayExerciseId: number;
}) {
  const [weights, setWeights] = useState<Record<number, string>>(() =>
    Object.fromEntries(sets.map((s) => [s.id, s.weight?.toString() ?? ""])),
  );

  const setWeight = (id: number, value: string) =>
    setWeights((prev) => ({ ...prev, [id]: value }));

  const fillNext = (index: number, value: string) => {
    const next = sets[index + 1];
    if (!next || next.status === "complete" || next.status === "skipped") return;
    // Only seed an empty next set — don't clobber a weight the user already entered.
    setWeights((prev) => (prev[next.id] ? prev : { ...prev, [next.id]: value }));
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
          onWeightChange={(v) => setWeight(s.id, v)}
          onLogged={(v) => fillNext(i, v)}
          onAdd={(scope) => addSet(dayExerciseId, scope)}
          canRemove={sets.length > 1}
          onRemove={(scope) => removeSet(s.id, scope)}
        />
      ))}
    </div>
  );
}
