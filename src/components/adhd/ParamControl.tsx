"use client";

// The one new reusable primitive ADHD Mode needs: a tunable control rendered from a
// ParamDef. Numeric params get a slider + number input pair (fast to nudge, precise to
// type) with a live readout; booleans/selects render natively. The form field carries
// `def.key` as its name so saveHabitConfig can read it back.
import { useState } from "react";
import type { ParamDef } from "@/lib/features/adhdMode";

export function ParamControl({ def, defaultValue }: { def: ParamDef; defaultValue: number | boolean | string }) {
  if (def.type === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name={def.key} defaultChecked={Boolean(defaultValue)} className="h-4 w-4 accent-accent" />
        <span className="font-medium text-muted">{def.label}</span>
      </label>
    );
  }

  if (def.type === "select") {
    return (
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-muted">{def.label}</span>
        <select name={def.key} defaultValue={String(defaultValue)} className="input">
          {def.options?.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
        {def.hint && <span className="mt-1 block text-xs text-muted">{def.hint}</span>}
      </label>
    );
  }

  return <NumericControl def={def} defaultValue={Number(defaultValue)} />;
}

function NumericControl({ def, defaultValue }: { def: ParamDef; defaultValue: number }) {
  const [value, setValue] = useState<number>(defaultValue);
  const step = def.step ?? 1;
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-sm font-medium text-muted">
        <span>{def.label}</span>
        <span className="num text-text">
          {value}
          {def.unit ? ` ${def.unit}` : ""}
        </span>
      </span>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={def.min}
          max={def.max}
          step={step}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          aria-label={def.label}
          className="h-2 flex-1 cursor-pointer accent-accent"
        />
        <input
          type="number"
          name={def.key}
          min={def.min}
          max={def.max}
          step={step}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          inputMode="numeric"
          className="input w-20 text-center"
        />
      </div>
      {def.hint && <span className="mt-1 block text-xs text-muted">{def.hint}</span>}
    </label>
  );
}
