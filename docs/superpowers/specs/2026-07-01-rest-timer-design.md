# Rest Timer — Design

Auto-starting rest countdown between sets, shown as a floating pill. Client-only; no
schema or server changes.

## Decisions (user-approved)

- **Start:** auto-starts when a set is logged (or re-logged). Logging the next set
  replaces the running timer.
- **Duration:** per exercise type, from a pure mapping (no user configuration in v1):
  | ExerciseType | Rest |
  |---|---|
  | barbell, smithMachine | 3:00 |
  | machine, dumbbell, cable, freemotion, kettlebell | 2:00 |
  | bodyweightOnly, bodyweightLoadable, machineAssistance | 1:30 |
- **UI:** floating pill fixed above the mobile bottom bar (bottom-right on desktop),
  showing `M:SS`. Tap to expand: **+30s / −30s / skip** and a per-device mute toggle.
  **−30s** that would drop remaining time below zero ends the timer (same as skip,
  without the done alert).
- **Done alert:** at zero the pill pulses accent, fires `navigator.vibrate` and a short
  Web Audio chime (both suppressed by mute), then auto-dismisses after ~10s.
- **Persistence:** state is `{ endsAt, exerciseName }` (timestamp, not a counter) in
  React context + `localStorage` — survives route changes and refresh. A timer that
  expired while away is discarded silently on restore.

## Architecture

- `src/lib/restTimer.ts` — pure, unit-tested: `restDurationFor(type)`, remaining-time
  math, expired/restore rules, `M:SS` formatting.
- `src/components/RestTimerProvider.tsx` — `"use client"` context mounted once in
  `src/app/(app)/layout.tsx`; owns state, localStorage sync, tick, vibrate/chime.
- `src/components/RestTimerPill.tsx` — the floating pill + expanded controls.
- `src/components/ExerciseSets.tsx` / `SetLogger.tsx` — on the existing `onLogged`
  success path, call `startRest(exerciseType, exerciseName)` (type threaded through
  existing props; no new data fetching).

Rejected alternatives: server-persisted timer (needless round-trips), inline per-set
timer state (dies on navigation).

## Error handling

- `navigator.vibrate` / `AudioContext` are feature-detected; absence is silent.
- Corrupt/missing localStorage payloads are discarded, never thrown.
- The timer must never block or delay set logging — it reacts to the success path only.

## Testing

TDD on the pure module (`tests/lib/restTimer.test.ts`): duration mapping incl. unknown
type fallback (2:00), remaining-time/expiry math, restore rules, formatting. Provider
and pill follow the codebase convention of untested client leaves.
