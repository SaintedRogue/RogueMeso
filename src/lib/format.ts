// Display helpers: muscle-group colors, status styling, set formatting.

// The RIR schedule is owned by the progression engine; re-exported here so view
// code has one import for display helpers and the planned/shown RIR can't drift.
export { rirForWeek } from "@/lib/progression";

export const MG_COLORS: Record<string, string> = {
  Chest: "#f87171",
  Back: "#60a5fa",
  Triceps: "#fbbf24",
  Biceps: "#34d399",
  Shoulders: "#a78bfa",
  Quads: "#fb923c",
  Glutes: "#f472b6",
  Hamstrings: "#22d3ee",
  Calves: "#94a3b8",
  Traps: "#c084fc",
  Forearms: "#4ade80",
  Abs: "#facc15",
};

export function mgColor(name: string): string {
  return MG_COLORS[name] ?? "#ff6a2b";
}

export const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  complete: { label: "Complete", color: "var(--color-good)" }, // green = done
  ready: { label: "Ready", color: "var(--color-accent)" }, // orange = up next
  current: { label: "Current", color: "var(--color-accent)" },
  started: { label: "In progress", color: "var(--color-info)" }, // blue = in progress
  partial: { label: "Partial", color: "var(--color-info)" },
  pending: { label: "Pending", color: "var(--color-muted)" },
  pendingWeight: { label: "Enter weight", color: "var(--color-muted)" },
  skipped: { label: "Skipped", color: "var(--color-bad)" },
  archived: { label: "Archived", color: "var(--color-muted)" },
};

export function statusStyle(s: string) {
  return STATUS_STYLE[s] ?? { label: s, color: "var(--color-muted)" };
}

export function fmtWeight(w: number | null | undefined, unit = "lb"): string {
  if (w == null) return "—";
  return `${Number.isInteger(w) ? w : w.toFixed(1)} ${unit}`;
}

export const LB_PER_KG = 2.2046226218;

/** Convert a weight entered in the user's unit to canonical kilograms. */
export function toKg(value: number, unit: string): number {
  return unit === "kg" ? value : value / LB_PER_KG;
}

/** Convert canonical kilograms to the user's display unit. */
export function fromKg(kg: number, unit: string): number {
  return unit === "kg" ? kg : kg * LB_PER_KG;
}

export const CM_PER_IN = 2.54;
const IN_PER_FT = 12;

/**
 * Height is stored canonically in cm; imperial users enter feet + inches. These
 * mirror toKg/fromKg as the input-boundary conversion so the metric formulas in
 * lib/features/bodyTuning.ts never see anything but cm.
 */
export function cmToFtIn(cm: number): { ft: number; in: number } {
  const totalIn = Math.round(cm / CM_PER_IN);
  return { ft: Math.floor(totalIn / IN_PER_FT), in: totalIn % IN_PER_FT };
}

/** Feet + inches to cm. Tolerates blank/NaN parts (treated as 0). */
export function ftInToCm(ft: number, inches: number): number {
  const f = Number.isFinite(ft) ? ft : 0;
  const i = Number.isFinite(inches) ? inches : 0;
  return (f * IN_PER_FT + i) * CM_PER_IN;
}
