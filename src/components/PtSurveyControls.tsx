"use client";

// Shared controls + shell for the Physical Therapy Lens check-ins (pre "Recovery Check-In" and
// post "Session Check-In"), so both surveys share one look. The controls are purely controlled;
// CheckInCard owns only the collapse state.

import { useId, useState, type ReactNode } from "react";
import { Activity, Loader2 } from "lucide-react";

/** Immutably toggle a value in a multi-select list. */
export const toggleIn = (list: string[], value: string): string[] =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

/** Collapsible card shell shared by both check-ins: header (icon + title + "logged" chip + chevron)
 *  and a body panel. `hasData` tints the icon and shows the chip. Open state is uncontrolled by
 *  default (`defaultOpen` seeds it); pass `open` + `onToggle` to control it externally (e.g. a
 *  separate "View post survey" button toggling the same panel). */
export function CheckInCard({
  title,
  hasData,
  defaultOpen = false,
  open: controlledOpen,
  onToggle,
  children,
}: {
  title: string;
  hasData: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: () => void;
  children: ReactNode;
}) {
  const panelId = useId();
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const toggle = () => (isControlled ? onToggle?.() : setInternalOpen((o) => !o));
  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-2 px-4 py-3 text-sm transition-colors hover:text-text"
      >
        <Activity aria-hidden size={16} className={hasData ? "text-accent" : "text-muted"} />
        <span className="font-medium">{title}</span>
        {hasData && (
          <span className="chip" style={{ color: "var(--color-accent)", borderColor: "var(--color-accent)" }}>
            logged
          </span>
        )}
        <span className="ml-auto text-muted">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div id={panelId} className="space-y-4 border-t border-line/60 bg-panel/40 px-4 py-4">
          {children}
        </div>
      )}
    </div>
  );
}

/** Optional free-text note field. */
export function NoteField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted">
        Note
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        placeholder={placeholder}
        className="input w-full resize-y py-1.5 text-sm"
      />
    </div>
  );
}

/** Primary "Save" button with a pending spinner. */
export function SaveButton({ pending, onClick }: { pending: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={pending}
      className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-50"
    >
      {pending && <Loader2 aria-hidden size={14} className="animate-spin" />}
      Save
    </button>
  );
}

/** 0–10 pain slider with a live readout and a "clear" affordance (null = not reported). */
export function PainSlider({
  id,
  value,
  onChange,
}: {
  id: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label htmlFor={id} className="text-xs font-medium text-muted">
          Pain
        </label>
        <span className="num text-xs">
          {value ?? "—"}
          {value != null ? "/10" : ""}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={10}
        step={1}
        value={value ?? 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--color-accent)]"
      />
      {value != null && (
        <button type="button" onClick={() => onChange(null)} className="mt-1 text-xs text-muted hover:text-text">
          clear pain
        </button>
      )}
    </div>
  );
}

/** Multi-select chip row (pain locations, quality tags). */
export function Chips<T extends string>({
  label,
  options,
  labels,
  selected,
  onToggle,
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  selected: string[];
  onToggle: (value: T) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-muted">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.includes(o);
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(o)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                on ? "border-accent bg-accent/10 text-text" : "border-line text-muted hover:text-text"
              }`}
            >
              {labels[o]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Single-select segmented control (timing, ROM). Re-tapping the active option clears it. */
export function Segmented<T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-muted">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value === o;
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? null : o)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                on ? "border-accent bg-accent/10 text-text" : "border-line text-muted hover:text-text"
              }`}
            >
              {labels[o]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
