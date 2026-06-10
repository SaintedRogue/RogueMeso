"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { logSet, skipSet, clearSet } from "@/lib/actions";
import { fmtWeight } from "@/lib/format";

type Props = {
  set: {
    id: number;
    position: number;
    weight: number | null;
    reps: number | null;
    weightTarget: number | null;
    repsTarget: number | null;
    status: string;
  };
  targetRir: number | null;
  unit: string;
};

export function SetLogger({ set, targetRir, unit }: Props) {
  const [weight, setWeight] = useState(set.weight?.toString() ?? "");
  const [reps, setReps] = useState(set.reps?.toString() ?? "");
  const [flash, setFlash] = useState(false);
  const [pending, start] = useTransition();
  const done = set.status === "complete";
  const skipped = set.status === "skipped";

  const submit = () => {
    const w = weight === "" ? null : Number(weight);
    const r = reps === "" ? null : Number(reps);
    if (w == null || r == null || Number.isNaN(w) || Number.isNaN(r)) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 900);
    start(() => logSet(set.id, w, r));
  };

  if (skipped) {
    return (
      <div className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 px-3 py-2 text-sm opacity-60">
        <span className="num text-muted">{set.position + 1}</span>
        <span className="italic text-muted">skipped</span>
        <button onClick={() => start(() => clearSet(set.id))} className="text-xs text-muted hover:text-text">
          undo
        </button>
      </div>
    );
  }

  return (
    <div
      className={`grid grid-cols-[2rem_1fr_1fr_auto] items-center gap-2 px-3 py-2 text-sm sm:grid-cols-[2rem_1fr_1fr_3.2rem_auto] ${
        done ? "bg-good/5" : ""
      } ${flash ? "flash-good" : ""}`}
    >
      <span className={`num flex justify-center ${done ? "text-good" : "text-muted"}`}>
        {done ? <Check aria-hidden size={16} strokeWidth={2.5} /> : set.position + 1}
      </span>
      <input
        className="input num py-1"
        inputMode="decimal"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        placeholder={set.weightTarget ? fmtWeight(set.weightTarget, unit) : unit}
        aria-label="weight"
      />
      <input
        className="input num py-1"
        inputMode="numeric"
        value={reps}
        onChange={(e) => setReps(e.target.value)}
        placeholder={set.repsTarget ? `${set.repsTarget} reps` : "reps"}
        aria-label="reps"
      />
      <span className="num hidden text-center text-xs text-muted sm:block">
        {targetRir == null ? "DL" : `${targetRir} RIR`}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={submit}
          disabled={pending}
          className={`px-2.5 py-2.5 text-xs disabled:opacity-50 sm:py-1 ${
            done ? "rounded-md border border-line font-semibold text-muted hover:text-text" : "btn-primary"
          }`}
        >
          {done ? "Update" : pending ? "…" : "Log"}
        </button>
        {!done && (
          <button
            onClick={() => start(() => skipSet(set.id))}
            disabled={pending}
            title="Skip set"
            aria-label="Skip set"
            className="flex min-h-11 min-w-10 items-center justify-center text-muted hover:text-bad sm:min-h-0 sm:min-w-0 sm:px-1 sm:py-1"
          >
            <X aria-hidden size={16} strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
}
