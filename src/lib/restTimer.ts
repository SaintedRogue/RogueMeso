// Pure logic for the between-sets rest timer (see docs/superpowers/specs/2026-07-01-rest-timer-design.md).
// The timer is a stored end-timestamp, never a ticking counter, so it survives navigation
// and refresh for free. Everything stateful (context, localStorage, vibrate/chime) lives
// in RestTimerProvider; this module stays unit-testable.

/** A running timer: when it ends, and which exercise started it (shown on the pill). */
export type RestTimerState = { endsAt: number; exerciseName: string };

// Rest by equipment demand: heavy compounds recover slowest, bodyweight/assistance work
// fastest. Keys are compact()-normalized so the Prisma enum identifier ("smithMachine")
// and the @map value ("smith-machine") match interchangeably, mirroring suggestions.ts.
const REST_SECONDS: Record<string, number> = {
  barbell: 180,
  smithmachine: 180,
  machine: 120,
  dumbbell: 120,
  cable: 120,
  freemotion: 120,
  kettlebell: 120,
  bodyweightonly: 90,
  bodyweightloadable: 90,
  machineassistance: 90,
};

/** Middle-of-the-road fallback for unknown/missing exercise types. */
const DEFAULT_REST_SECONDS = 120;

const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Seconds of rest suggested after a set of the given exercise type. */
export function restDurationFor(type: string | null | undefined): number {
  if (!type) return DEFAULT_REST_SECONDS;
  return REST_SECONDS[compact(type)] ?? DEFAULT_REST_SECONDS;
}

/** Whole seconds left, rounded up (a timer is "done" only at a true 0), clamped at 0. */
export function remainingSeconds(state: RestTimerState, now: number): number {
  return Math.max(0, Math.ceil((state.endsAt - now) / 1000));
}

/**
 * Rehydrate a timer from its localStorage JSON. Anything unusable — missing, corrupt,
 * wrong shape, or already expired while the user was away — is discarded as null.
 */
export function restoreTimer(raw: string | null, now: number): RestTimerState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<RestTimerState>;
    if (typeof v.endsAt !== "number" || typeof v.exerciseName !== "string") return null;
    const state = { endsAt: v.endsAt, exerciseName: v.exerciseName };
    return remainingSeconds(state, now) > 0 ? state : null;
  } catch {
    return null;
  }
}

/**
 * Apply a +/-30s style adjustment. Returns null when the result would have nothing left
 * to count — the caller ends the timer quietly (no done alert), same as skip.
 */
export function adjustEndsAt(state: RestTimerState, deltaSeconds: number, now: number): RestTimerState | null {
  const adjusted = { ...state, endsAt: state.endsAt + deltaSeconds * 1000 };
  return remainingSeconds(adjusted, now) > 0 ? adjusted : null;
}

/** "M:SS" countdown display. */
export function fmtCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
