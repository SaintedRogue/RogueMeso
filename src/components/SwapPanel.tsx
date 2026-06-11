"use client";

import { useEffect, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { MgDot } from "@/components/ui";
import { mgColor } from "@/lib/format";
import { getSwapCandidates, swapExercise, type SwapCandidate } from "@/lib/swapActions";

type Props = {
  id?: string;
  dayExerciseId: number;
  currentExerciseId: number | null;
  defaultMuscleGroupId: number;
  muscleGroups: { id: number; name: string }[];
  onDone: () => void;
};

/**
 * Inline exercise-swap picker (an accordion panel, same in-place pattern as the "?" info
 * panel). Defaults to the slot's own muscle group but lets you escape-hatch to another;
 * pick a replacement, then choose whether the swap applies to just this workout or the
 * rest of the mesocycle. Mutations go through useTransition like SetLogger.
 */
export function SwapPanel({ id, dayExerciseId, currentExerciseId, defaultMuscleGroupId, muscleGroups, onDone }: Props) {
  const [mgId, setMgId] = useState(defaultMuscleGroupId);
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<SwapCandidate[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const mgName = (gid: number) => muscleGroups.find((m) => m.id === gid)?.name ?? "";

  // Load candidates for the chosen group + search (debounced); ignore stale responses.
  useEffect(() => {
    let active = true;
    const t = setTimeout(() => {
      setCandidates(null);
      getSwapCandidates(dayExerciseId, mgId, search)
        .then((rows) => active && setCandidates(rows))
        .catch(() => active && setCandidates([]));
    }, 200);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [dayExerciseId, mgId, search]);

  const commit = (scope: "day" | "meso") => {
    if (selectedId == null) return;
    setError(null);
    start(async () => {
      try {
        await swapExercise(dayExerciseId, selectedId, scope);
        onDone();
      } catch {
        setError("Couldn't swap that exercise. Please try again.");
      }
    });
  };

  return (
    <div id={id} className="space-y-3 border-b border-line bg-panel/40 px-4 py-3 text-sm">
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          className="input py-1.5 sm:max-w-[10rem]"
          value={mgId}
          onChange={(e) => {
            setMgId(Number(e.target.value));
            setSelectedId(null);
          }}
          aria-label="Muscle group"
        >
          {muscleGroups.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <div className="relative flex-1">
          <Search aria-hidden size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input w-full py-1.5 pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${mgName(mgId)} exercises…`}
            aria-label="Search exercises"
          />
        </div>
      </div>

      <ul className="max-h-64 space-y-1 overflow-y-auto" role="listbox" aria-label="Swap options">
        {candidates === null && <li className="px-1 py-2 text-muted">Loading…</li>}
        {candidates?.length === 0 && <li className="px-1 py-2 text-muted">No exercises found.</li>}
        {candidates?.map((c) => {
          const isCurrent = c.id === currentExerciseId;
          const selected = c.id === selectedId;
          return (
            <li key={c.id}>
              <button
                type="button"
                role="option"
                aria-selected={selected}
                disabled={isCurrent}
                onClick={() => setSelectedId(c.id)}
                className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors ${
                  selected
                    ? "border-accent bg-accent/10"
                    : "border-transparent hover:border-line hover:bg-panel-2/40"
                } ${isCurrent ? "opacity-50" : ""}`}
              >
                <MgDot color={mgColor(mgName(c.muscleGroupId))} />
                <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                <span className="shrink-0 text-xs text-muted">{isCurrent ? "current" : c.exerciseType}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {error && <p className="text-xs text-bad">{error}</p>}

      {selectedId != null && (
        <div className="flex flex-col gap-2 border-t border-line pt-3 sm:flex-row">
          <button type="button" onClick={() => commit("day")} disabled={pending} className="btn-primary py-2 disabled:opacity-50">
            {pending ? "…" : "Swap just today"}
          </button>
          <button
            type="button"
            onClick={() => commit("meso")}
            disabled={pending}
            className="min-h-11 rounded-md border border-line px-3 py-2 font-semibold text-muted hover:text-text disabled:opacity-50 sm:min-h-0"
          >
            Swap rest of meso
          </button>
        </div>
      )}
    </div>
  );
}
