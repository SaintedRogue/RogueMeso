# Insights Screen — Design Spec

**Date:** 2026-06-10
**Status:** Approved (design), pending implementation plan
**Author:** brainstormed with Claude

## Summary

A new, dedicated **Insights** screen that turns RogueMeso's already-logged training
data into visible analytics. Three sections, top to bottom:

1. **Weekly volume per muscle** (hero) — sets logged each week of a mesocycle, plotted
   against the progression engine's MEV / MRV landmarks.
2. **Exercise history** — estimated 1RM over time for a chosen exercise, across all blocks.
3. **Personal records** — best estimated 1RM per exercise, with new PRs flagged.

Read-only feature: **no schema changes, no Server Actions, no mutations.**

## Goals

- Make logged data legible without leaving the app or exporting it.
- Tie volume analytics directly to the training model: reuse `MEV_SETS` / `MRV_SETS`
  from `src/lib/progression.ts` as reference lines so analytics and the engine never drift.
- Stay within existing architectural seams (new page + pure feature module + nav line).

## Non-goals

- No editing/mutation of training data from this screen.
- No bodyweight, joint-pain, or YouTube surfacing (separate "dormant fields" track).
- No empirical progression tuning (separate, more complex track).
- No CSV/JSON export (separate track).

## Placement

Dedicated route, chosen over contextual embedding for isolation and testability.
Context widgets (e.g. volume on the mesocycle page, PR toast on the workout screen) can
be grafted on later **without rework**, because all logic lives in `insights.ts`.

## Architecture

Follows the established page pattern verbatim (see `src/app/(app)/exercises/page.tsx`):
async Server Component → `requireUser()` → user-scoped queries → render. Auto-protected
by `src/proxy.ts`. No new auth surface.

### Files

| File | Role |
|---|---|
| `src/app/(app)/insights/page.tsx` | Server Component. Reads `?meso=<key>` (volume scope) and `?ex=<id>` (history). Fetches data, lays out three sections, renders empty states. |
| `src/lib/features/insights.ts` | **Pure** analytics module. DB access via `@/lib/prisma`, every query scoped by `userId`. Exports the functions below. |
| `src/lib/nav.ts` | Add one `NavLink`: `{ href: "/insights", label: "Insights", shortLabel: "Insights", icon: "▲" }`, positioned between Exercises and Templates. `Nav` + `BottomBar` consume it automatically. |
| `src/components/charts/VolumeChart.tsx` | Client leaf: grouped weekly bars per muscle + MEV/MRV reference lines. |
| `src/components/charts/HistoryChart.tsx` | Client leaf: est-1RM line over time. |
| (PRs render as a server-side list — no chart component needed.) |

### `insights.ts` surface

```ts
// Epley estimate. Pure, no I/O.
export function estimated1RM(weight: number, reps: number): number;

// Per-mesocycle. Completed sets grouped by muscleGroup × week.
export async function weeklyVolumeByMuscle(mesoId: number): Promise<
  { muscleGroup: string; color: string; perWeek: number[] }[]
>;

// All-time, one exercise. Ordered points of est-1RM over time.
export async function exerciseHistory(userId: number, exerciseId: number): Promise<
  { date: Date; oneRm: number; weight: number; reps: number }[]
>;

// All-time. Best est-1RM per exercise, newest-best flagged.
export async function personalRecords(userId: number): Promise<
  { exercise: string; weight: number; reps: number; oneRm: number; date: Date; isNew: boolean }[]
>;
```

MEV/MRV landmarks are **imported from `progression.ts`** (`MEV_SETS`, `MRV_SETS`), never
re-declared.

## Data flow & semantics

### Correctness linchpin: completed sets only

`ExerciseSet.status` runs `pendingWeight → pending → complete → skipped`, and **targets
are populated before training**. Therefore every analytics query filters
`status: "complete"`. Counting other statuses would let *planned* future sets inflate
volume and let a target weight masquerade as a PR. Non-negotiable across all three
sections.

### Volume (hero, per-mesocycle)

- Scope: a single mesocycle via `?meso=<key>`; defaults to the active meso
  (reuse/extend `getActiveMeso`). Ownership enforced by `userId` filter.
- Compute: count `ExerciseSet` rows with `status="complete"`, grouped by
  `DayExercise.muscleGroup` and `MesoDay.week`.
- Render: grouped bars per muscle across weeks, with horizontal MEV (2) and MRV (5)
  reference lines. Muscle-weeks under MEV get a warning accent.
- Muscle-group colors reuse `mgColor` from `src/lib/format.ts`.

### Exercise history (all-time)

- Scope: one exercise via `?ex=<id>`, across all the user's mesocycles.
- Compute: for each completed set of that exercise (owned by the user), `estimated1RM`
  via **Epley**: `weight × (1 + reps / 30)`. Ordered by `finishedAt` (fallback to set/day order).
- Render: line chart; a single point renders as a dot with no line.
- Exercise picker: a `<select>`/link list of exercises the user has logged.

### Personal records (all-time)

- Compute: per exercise (over the user's completed sets), the max `estimated1RM` and the
  set that produced it.
- "NEW" flag: best set's `finishedAt` within the last 14 days. (Window is a tunable
  constant in `insights.ts`.)
- Render: server-side list, newest-PR rows accented.

## Rendering / dependency decision

A chart library will be added (explicit user choice, accepted despite the codebase's
otherwise minimal dependency tree).

- **Primary pick: Recharts** — composable, Tailwind-friendly, widely used.
- **Compatibility gate (must verify before adopting):** AGENTS.md warns this is a
  modified **Next.js 16 / React 19** environment and mandates reading
  `node_modules/next/dist/docs/` before writing code. Before committing to Recharts,
  confirm its React 19 peer compatibility against the installed versions.
- **Fallback if incompatible:** `visx` (lower-level, React-19-safe) or hand-rolled inline
  SVG. The data layer is identical either way — chart components are thin client leaves
  over the pure `insights.ts` functions, fed serialized data from the server page.

Charts are `"use client"` leaves; all data fetching and computation stays server-side.

## Error / edge handling

- No logged sets (new user) → each section shows an empty state matching the existing
  "No matches." pattern.
- Single history data point → dot, no line.
- Mesocycle with no completed sets yet → volume section shows zeroed bars + empty hint.
- Ownership: every query filtered by `me.id`, identical to `getMesocycle`'s check. A
  `?meso`/`?ex` referencing another user's data resolves to empty, never leaks.

## Testing

`insights.ts` functions are pure/deterministic and unit-testable with fixture sets:

- `estimated1RM` math (Epley).
- Skipped/pending/pendingWeight sets excluded from every aggregate.
- Weekly bucketing groups by the correct `week`.
- PR selection picks the true max est-1RM and flags the new-PR window correctly.

No test runner is currently installed; adding one (e.g. `vitest`) is a prerequisite step
in the implementation plan.

## Out-of-scope follow-ons (noted, not built here)

- Context widgets (volume on meso page, PR toast on workout screen).
- Brzycki as an alternative 1RM formula / user-selectable formula.
- Muscle-group volume roll-up across an entire block vs. per-week toggle.
