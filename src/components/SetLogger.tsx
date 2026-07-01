"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { logSet, skipSet, clearSet } from "@/lib/actions";
import { SetMenu } from "@/components/SetMenu";
import { toast } from "@/components/Toaster";
import { fmtWeight } from "@/lib/format";

type Scope = "day" | "meso";

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
  /** Weight + reps are controlled by the parent so a logged set can pre-fill the next one. */
  weight: string;
  reps: string;
  onWeightChange: (value: string) => void;
  onRepsChange: (value: string) => void;
  /** True while the shown weight/reps are an unconfirmed "last week" suggestion (render shaded). */
  suggested: boolean;
  /** Called after a successful log so the parent can carry weight + reps onto the next set. */
  onLogged: () => void;
  /** Add a set to this group; "meso" also extends the same exercise's later occurrences. */
  onAdd: (scope: Scope) => void | Promise<void>;
  /** Whether this set may be deleted (false when it's the group's only set). */
  canRemove: boolean;
  /** Delete this set; "meso" also trims the same exercise's later occurrences. */
  onRemove: (scope: Scope) => void | Promise<void>;
  /** Physical Therapy Lens: show the Left/Both/Right control and persist the choice on log. */
  physicalTherapyLens?: boolean;
  side?: string;
  onSideChange?: (value: string) => void;
};

const SIDE_OPTIONS: { value: string; label: string }[] = [
  { value: "left", label: "L" },
  { value: "bilateral", label: "Both" },
  { value: "right", label: "R" },
];

export function SetLogger({
  set,
  targetRir,
  unit,
  weight,
  reps,
  suggested,
  onWeightChange,
  onRepsChange,
  onLogged,
  onAdd,
  canRemove,
  onRemove,
  physicalTherapyLens = false,
  side = "bilateral",
  onSideChange,
}: Props) {
  const [flash, setFlash] = useState(false);
  const [pending, start] = useTransition();
  const done = set.status === "complete";
  const skipped = set.status === "skipped";
  // Shade an unconfirmed suggestion so it reads as a target, not a logged value.
  const ghost = suggested && !done ? "italic text-muted" : "";

  const submit = () => {
    // Same validation as before — now we tell the user WHY a tap did nothing instead of
    // silently bailing. Empty vs. non-numeric ("10 lbs") get distinct guidance.
    if (weight.trim() === "" || reps.trim() === "") {
      toast("Enter a weight and reps to log this set.", "error");
      return;
    }
    const w = Number(weight);
    const r = Number(reps);
    if (Number.isNaN(w) || Number.isNaN(r)) {
      toast("Weight and reps must be numbers — e.g. 135 and 8.", "error");
      return;
    }
    setFlash(true); // immediate, cosmetic — fine to fire before the round-trip
    setTimeout(() => setFlash(false), 900);
    start(async () => {
      try {
        await logSet(set.id, w, r, physicalTherapyLens ? side : undefined);
        // Confirm what was recorded so the entry is unambiguous (the row also turns green),
        // and carry the effort onto the next set — both only after the log actually lands.
        toast(`${done ? "Updated" : "Logged"} ${fmtWeight(w, unit)} × ${r} reps`);
        onLogged();
      } catch {
        toast("Couldn't save that set — try again.", "error");
      }
    });
  };

  // Structural set actions (add/remove, each with day/meso scope) live in this popover menu,
  // two taps deep, so nothing destructive sits inline where it could be hit while logging.
  const menu = <SetMenu setNumber={set.position + 1} canRemove={canRemove} onAdd={onAdd} onRemove={onRemove} />;

  if (skipped) {
    return (
      <div className="grid grid-cols-[2rem_1fr_auto_auto] items-center gap-3 px-3 py-2 text-sm opacity-60">
        <span className="num text-muted">{set.position + 1}</span>
        <span className="italic text-muted">skipped</span>
        <button onClick={() => start(() => clearSet(set.id))} className="text-xs text-muted hover:text-text">
          undo
        </button>
        {menu}
      </div>
    );
  }

  return (
    <div>
    <div
      className={`grid grid-cols-[2rem_1fr_1fr_auto] items-center gap-2 px-3 pt-2 text-sm sm:grid-cols-[2rem_1fr_1fr_3.2rem_auto] ${
        physicalTherapyLens ? "pb-1" : "pb-2"
      } ${
        done ? "bg-good/5" : ""
      } ${flash ? "flash-good" : ""}`}
    >
      <span className={`num flex justify-center ${done ? "text-good" : "text-muted"}`}>
        {done ? <Check aria-hidden size={16} strokeWidth={2.5} /> : set.position + 1}
      </span>
      <input
        className={`input num py-1 ${ghost}`}
        inputMode="decimal"
        value={weight}
        onChange={(e) => onWeightChange(e.target.value)}
        placeholder={set.weightTarget ? fmtWeight(set.weightTarget, unit) : unit}
        aria-label="weight"
      />
      <input
        className={`input num py-1 ${ghost}`}
        inputMode="numeric"
        value={reps}
        onChange={(e) => onRepsChange(e.target.value)}
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
            done
              ? "min-h-11 rounded-md border border-line font-semibold text-muted hover:text-text sm:min-h-0"
              : "btn-primary"
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
        {menu}
      </div>
    </div>
      {physicalTherapyLens && (
        <div className="grid grid-cols-[2rem_1fr_1fr_auto] items-center gap-2 px-3 pb-2 text-xs text-muted sm:grid-cols-[2rem_1fr_1fr_3.2rem_auto]">
          <span aria-hidden />
          <div className="col-span-2 flex flex-wrap items-center gap-2">
            <span className="text-muted">Side</span>
            {SIDE_OPTIONS.map((o) => {
              const on = side === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onSideChange?.(o.value)}
                  className={`rounded-full border px-2 py-0.5 font-medium transition-colors ${
                    on ? "border-accent bg-accent/10 text-text" : "border-line text-muted hover:text-text"
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
