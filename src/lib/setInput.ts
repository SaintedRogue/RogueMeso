// Server-side validation for logged set values. The client (SetLogger) already rejects
// empty/non-numeric input, so anything failing here is a buggy or hostile payload — the
// caller should refuse the write rather than repair it. Bounds are deliberately generous
// (weight is in the user's display unit, lb or kg): they exist to keep junk like 1e999
// out of analytics, PR detection, and community posts, not to police training claims.

/** Heaviest loggable weight in either unit. */
const WEIGHT_CAP = 5000;
/** Most reps a single set can record. */
const REPS_CAP = 1000;

/**
 * Validate a weight/reps pair for logSet. Either value may be null (a partial log leaves
 * the set pendingWeight). Returns the pair unchanged when valid, or null when the payload
 * must be rejected: non-finite or negative values, weight above the cap, fractional reps
 * (the column is an Int), or reps above the cap.
 */
export function normalizeSetInput(
  weight: number | null,
  reps: number | null,
): { weight: number | null; reps: number | null } | null {
  if (weight != null && (!Number.isFinite(weight) || weight < 0 || weight > WEIGHT_CAP)) return null;
  if (reps != null && (!Number.isInteger(reps) || reps < 0 || reps > REPS_CAP)) return null;
  return { weight, reps };
}
