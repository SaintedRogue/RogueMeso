"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { MgDot } from "@/components/ui";
import { mgColor } from "@/lib/format";
import { getTemplateExercises, type TemplateExercise } from "@/lib/templateActions";

/** One slot's client state. Carries the exercise name for display; only ids are serialized
 *  to TemplateSlotInput at save time. `exerciseId` null = an intentional empty slot. */
export type BuilderSlot = {
  muscleGroupId: number;
  exerciseId: number | null;
  exerciseName: string | null;
};

type Props = {
  slot: BuilderSlot;
  muscleGroups: { id: number; name: string }[];
  onChange: (slot: BuilderSlot) => void;
  onRemove: () => void;
};

/**
 * One exercise line in the template builder: a muscle-group select plus an expandable
 * exercise picker. Collapsed, it shows the chosen exercise (or "empty slot"); expanded, it
 * mirrors SwapPanel — a debounced search over the catalog scoped to the slot's muscle group.
 * Changing the muscle group clears the exercise, since it belonged to the old group.
 */
export function TemplateSlotPicker({ slot, muscleGroups, onChange, onRemove }: Props) {
  const [open, setOpen] = useState(slot.exerciseId == null);
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<TemplateExercise[] | null>(null);
  const [, startFetch] = useTransition();

  const mgName = (gid: number) => muscleGroups.find((m) => m.id === gid)?.name ?? "";

  // Load candidates for the chosen group + search (debounced); ignore stale responses.
  useEffect(() => {
    if (!open) return;
    let active = true;
    const t = setTimeout(() => {
      setCandidates(null);
      startFetch(async () => {
        try {
          const rows = await getTemplateExercises(slot.muscleGroupId, search);
          if (active) setCandidates(rows);
        } catch {
          if (active) setCandidates([]);
        }
      });
    }, 200);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [open, slot.muscleGroupId, search]);

  const pick = (c: TemplateExercise) => {
    onChange({ muscleGroupId: slot.muscleGroupId, exerciseId: c.id, exerciseName: c.name });
    setOpen(false);
  };

  return (
    <div className="rounded-md border border-line bg-panel/40">
      <div className="flex items-center gap-2 px-2.5 py-2">
        <select
          className="input py-1.5 sm:max-w-[9rem]"
          value={slot.muscleGroupId}
          onChange={(e) => {
            // New group → the old exercise no longer applies; clear it and open the picker.
            onChange({ muscleGroupId: Number(e.target.value), exerciseId: null, exerciseName: null });
            setSearch("");
            setOpen(true);
          }}
          aria-label="Muscle group"
        >
          {muscleGroups.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-panel-2/40"
          aria-expanded={open}
        >
          <MgDot color={mgColor(mgName(slot.muscleGroupId))} />
          <span className={`min-w-0 flex-1 truncate ${slot.exerciseName ? "" : "italic text-muted"}`}>
            {slot.exerciseName ?? "empty slot — pick an exercise"}
          </span>
          <ChevronDown aria-hidden size={15} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded-md p-1.5 text-muted hover:text-bad"
          aria-label="Remove slot"
        >
          <X aria-hidden size={16} />
        </button>
      </div>

      {open && (
        <div className="space-y-2 border-t border-line px-2.5 py-2">
          <div className="relative">
            <Search aria-hidden size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              className="input w-full py-1.5 pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${mgName(slot.muscleGroupId)} exercises…`}
              aria-label="Search exercises"
            />
          </div>

          <ul className="max-h-56 space-y-1 overflow-y-auto" role="listbox" aria-label="Exercise options">
            <li>
              {/* Leave the slot unfilled on purpose — generation drops empty slots. */}
              <button
                type="button"
                role="option"
                aria-selected={slot.exerciseId == null}
                onClick={() => {
                  onChange({ muscleGroupId: slot.muscleGroupId, exerciseId: null, exerciseName: null });
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors ${
                  slot.exerciseId == null ? "border-accent bg-accent/10" : "border-transparent hover:border-line hover:bg-panel-2/40"
                }`}
              >
                <span className="min-w-0 flex-1 truncate italic text-muted">Leave empty</span>
              </button>
            </li>
            {candidates === null && <li className="px-1 py-2 text-muted">Loading…</li>}
            {candidates?.length === 0 && <li className="px-1 py-2 text-muted">No exercises found.</li>}
            {candidates?.map((c) => {
              const selected = c.id === slot.exerciseId;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => pick(c)}
                    className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors ${
                      selected ? "border-accent bg-accent/10" : "border-transparent hover:border-line hover:bg-panel-2/40"
                    }`}
                  >
                    <MgDot color={mgColor(mgName(c.muscleGroupId))} />
                    <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                    <span className="shrink-0 text-xs text-muted">{c.exerciseType}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
