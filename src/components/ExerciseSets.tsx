"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { SetLogger } from "@/components/SetLogger";
import { addSet, removeSet } from "@/lib/setActions";
import type { ViewSet } from "@/components/DayView";

/**
 * Owns the weight inputs for one exercise's sets so logging a set can pre-fill the
 * NEXT set's weight ("assume the same load again"). Reps stay local to each SetLogger —
 * only weight carries down. The fill is a non-destructive default: it never overwrites a
 * next set that already has a value or has been logged/skipped, so manual edits win.
 *
 * Also hosts the structural controls: an "Add set" footer (with day/meso scope) and the
 * per-row remove handler. After either, revalidatePath re-renders this subtree with the
 * fresh set list, so there's no separate client-side set list to keep in sync.
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
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();

  const setWeight = (id: number, value: string) =>
    setWeights((prev) => ({ ...prev, [id]: value }));

  const fillNext = (index: number, value: string) => {
    const next = sets[index + 1];
    if (!next || next.status === "complete" || next.status === "skipped") return;
    // Only seed an empty next set — don't clobber a weight the user already entered.
    setWeights((prev) => (prev[next.id] ? prev : { ...prev, [next.id]: value }));
  };

  const add = (scope: "day" | "meso") =>
    start(async () => {
      await addSet(dayExerciseId, scope);
      setAdding(false);
    });

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
          canRemove={sets.length > 1}
          onRemove={(scope) => removeSet(s.id, scope)}
        />
      ))}

      <div className="px-3 py-2">
        {adding ? (
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-muted">Add set to</span>
            <button
              onClick={() => add("day")}
              disabled={pending}
              className="rounded-md border border-line px-2 py-1 text-xs font-medium hover:border-accent hover:text-accent disabled:opacity-50"
            >
              This day
            </button>
            <button
              onClick={() => add("meso")}
              disabled={pending}
              className="rounded-md border border-line px-2 py-1 text-xs font-medium hover:border-accent hover:text-accent disabled:opacity-50"
            >
              Rest of meso
            </button>
            <button onClick={() => setAdding(false)} disabled={pending} className="text-xs text-muted hover:text-text">
              cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex min-h-9 items-center gap-1 text-sm text-muted hover:text-text"
          >
            <Plus size={15} aria-hidden /> Add set
          </button>
        )}
      </div>
    </div>
  );
}
