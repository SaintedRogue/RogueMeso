"use client";

import { useState, useTransition } from "react";
import { Check, EllipsisVertical, X } from "lucide-react";
import { logSet, skipSet, clearSet } from "@/lib/actions";
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
  /** Weight is controlled by the parent so a logged set can pre-fill the next one. */
  weight: string;
  onWeightChange: (value: string) => void;
  /** Called with the logged weight after a successful log, to carry it down. */
  onLogged: (weight: string) => void;
  /** Add a set to this group; "meso" also extends the same exercise's later occurrences. */
  onAdd: (scope: Scope) => void | Promise<void>;
  /** Whether this set may be deleted (false when it's the group's only set). */
  canRemove: boolean;
  /** Delete this set; "meso" also trims the same exercise's later occurrences. */
  onRemove: (scope: Scope) => void | Promise<void>;
};

// The ⋮ menu's inline states: closed, the action list, then a scope choice for the picked
// action. Structural changes (add/remove) live here — two deliberate taps deep — so the row
// itself carries no destructive control that could be hit by accident while logging.
type Menu = "closed" | "root" | "add" | "remove";

export function SetLogger({
  set,
  targetRir,
  unit,
  weight,
  onWeightChange,
  onLogged,
  onAdd,
  canRemove,
  onRemove,
}: Props) {
  const [reps, setReps] = useState(set.reps?.toString() ?? "");
  const [flash, setFlash] = useState(false);
  const [menu, setMenu] = useState<Menu>("closed");
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
    onLogged(weight);
  };

  // Run a structural action, then collapse the menu. (On a "remove this day" the row then
  // unmounts after revalidation, so the collapse is just a no-op in that case.)
  const run = (fn: (scope: Scope) => void | Promise<void>, scope: Scope) =>
    start(async () => {
      await fn(scope);
      setMenu("closed");
    });

  const menuButton = (
    <button
      onClick={() => setMenu("root")}
      disabled={pending}
      title="Set options"
      aria-label={`Options for set ${set.position + 1}`}
      aria-haspopup="menu"
      className="flex min-h-11 min-w-10 items-center justify-center text-muted hover:text-text disabled:opacity-50 sm:min-h-0 sm:min-w-0 sm:px-1 sm:py-1"
    >
      <EllipsisVertical aria-hidden size={16} strokeWidth={2.25} />
    </button>
  );

  if (menu !== "closed") {
    return (
      <div className="grid grid-cols-[2rem_1fr_auto] items-center gap-2 px-3 py-2 text-sm" role="menu">
        <span className="num text-muted">{set.position + 1}</span>
        <span className="flex flex-wrap items-center gap-1.5">
          {menu === "root" && (
            <>
              <button
                onClick={() => setMenu("add")}
                className="rounded-md border border-line px-2 py-1 text-xs font-medium hover:border-accent hover:text-accent"
              >
                Add set
              </button>
              {canRemove && (
                <button
                  onClick={() => setMenu("remove")}
                  className="rounded-md border border-line px-2 py-1 text-xs font-medium hover:border-bad hover:text-bad"
                >
                  Remove set
                </button>
              )}
            </>
          )}
          {menu === "add" && (
            <>
              <span className="text-muted">Add to</span>
              <button
                onClick={() => run(onAdd, "day")}
                disabled={pending}
                className="rounded-md border border-line px-2 py-1 text-xs font-medium hover:border-accent hover:text-accent disabled:opacity-50"
              >
                This day
              </button>
              <button
                onClick={() => run(onAdd, "meso")}
                disabled={pending}
                className="rounded-md border border-line px-2 py-1 text-xs font-medium hover:border-accent hover:text-accent disabled:opacity-50"
              >
                Rest of meso
              </button>
            </>
          )}
          {menu === "remove" && (
            <>
              <span className="text-muted">Remove from</span>
              <button
                onClick={() => run(onRemove, "day")}
                disabled={pending}
                className="rounded-md border border-line px-2 py-1 text-xs font-medium hover:border-bad hover:text-bad disabled:opacity-50"
              >
                This day
              </button>
              <button
                onClick={() => run(onRemove, "meso")}
                disabled={pending}
                className="rounded-md border border-line px-2 py-1 text-xs font-medium hover:border-bad hover:text-bad disabled:opacity-50"
              >
                Rest of meso
              </button>
            </>
          )}
        </span>
        <button
          onClick={() => setMenu(menu === "root" ? "closed" : "root")}
          disabled={pending}
          className="text-xs text-muted hover:text-text"
        >
          {menu === "root" ? "close" : "back"}
        </button>
      </div>
    );
  }

  if (skipped) {
    return (
      <div className="grid grid-cols-[2rem_1fr_auto_auto] items-center gap-3 px-3 py-2 text-sm opacity-60">
        <span className="num text-muted">{set.position + 1}</span>
        <span className="italic text-muted">skipped</span>
        <button onClick={() => start(() => clearSet(set.id))} className="text-xs text-muted hover:text-text">
          undo
        </button>
        {menuButton}
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
        onChange={(e) => onWeightChange(e.target.value)}
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
        {menuButton}
      </div>
    </div>
  );
}
