// Display helpers: muscle-group colors, status styling, set formatting.

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

/** RIR schedule across a mesocycle: ramp from (weeks-1) RIR down, deload last week. */
export function rirForWeek(week0: number, weeksCount: number): number | null {
  if (week0 >= weeksCount - 1) return null; // deload week
  const start = Math.min(3, weeksCount - 2);
  return Math.max(0, start - week0);
}

export function fmtWeight(w: number | null | undefined, unit = "lb"): string {
  if (w == null) return "—";
  return `${Number.isInteger(w) ? w : w.toFixed(1)} ${unit}`;
}
