import type { MgPriority } from "@prisma/client";

/**
 * The volume priorities, ordered lowest → highest, with UI labels and an explainer blurb.
 * Single source of truth for the dropdowns (TemplateBuilder, MesoPriorities), the
 * "How volume works" explainer, and server-side validation — so adding or renaming a
 * priority is a one-line change, not several.
 */
export const PRIORITY_META: { value: MgPriority; label: string; blurb: string }[] = [
  { value: "maintain", label: "Maintain", blurb: "Hold volume steady — enough to keep what you've built." },
  { value: "grow", label: "Grow", blurb: "Add sets gradually as the block progresses." },
  { value: "emphasize", label: "Emphasize", blurb: "Add sets aggressively, toward your max recoverable volume." },
];

/** Valid priority values, for enum-guarding server action input. */
export const PRIORITIES: MgPriority[] = PRIORITY_META.map((p) => p.value);
