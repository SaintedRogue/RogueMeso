"use client";

import { EQUIPMENT_CLASSES } from "@/lib/equipment";

type Props = {
  /** Currently preferred equipment buckets (equipClass values). */
  selected: ReadonlySet<string>;
  onToggle: (value: string) => void;
};

/**
 * A row of toggle chips for soft equipment preference. Selecting buckets floats matching
 * exercises to the top of the picker list — nothing is hidden — so it shares the picker's
 * collapsed footprint and needs no "clear" affordance (toggling all off is the empty state).
 */
export function EquipmentPreference({ selected, onToggle }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Prefer equipment">
      {EQUIPMENT_CLASSES.map((eq) => {
        const on = selected.has(eq.value);
        return (
          <button
            key={eq.value}
            type="button"
            onClick={() => onToggle(eq.value)}
            aria-pressed={on}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              on ? "border-accent bg-accent/10 text-text" : "border-line text-muted hover:text-text"
            }`}
          >
            {eq.label}
          </button>
        );
      })}
    </div>
  );
}
