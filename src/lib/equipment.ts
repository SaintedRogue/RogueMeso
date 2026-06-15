// Equipment-preference helpers for the exercise pickers. Equipment lives on the catalog as
// the `exerciseType` enum (9 values); equipClass() folds those onto 6 coarse buckets, which
// are what we surface as preference chips. The preference is *soft*: it reorders the candidate
// list (preferred float to the top) but never hides anything.

import { equipClass } from "@/lib/exerciseMatch";

/** Coarse equipment buckets shown as preference chips, in display order. Each `value` matches
 *  equipClass() output so a candidate's exerciseType can be bucketed for sorting. */
export const EQUIPMENT_CLASSES = [
  { value: "barbell", label: "Barbell" },
  { value: "dumbbell", label: "Dumbbell" },
  { value: "cable", label: "Cable" },
  { value: "machine", label: "Machine" },
  { value: "smith", label: "Smith" },
  { value: "bodyweight", label: "Bodyweight" },
  { value: "kettlebell", label: "Kettlebell" },
] as const;

/**
 * Stable-sort so exercises whose equipment is in `preferred` float to the top, preserving the
 * original (catalog) order within each partition. An empty preference returns the list as-is,
 * so toggling all chips off is a clean no-op.
 */
export function sortByEquipmentPreference<T extends { exerciseType: string }>(
  list: T[],
  preferred: ReadonlySet<string>,
): T[] {
  if (preferred.size === 0) return list;
  const wanted = list.filter((e) => preferred.has(equipClass(e.exerciseType)));
  const rest = list.filter((e) => !preferred.has(equipClass(e.exerciseType)));
  return [...wanted, ...rest];
}
