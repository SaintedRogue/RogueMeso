# Insights Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated, read-only **Insights** screen that visualizes logged training data — weekly volume per muscle (vs. the engine's MEV/MRV landmarks), exercise est-1RM history, and personal records.

**Architecture:** New auto-protected App Router page (`/insights`) following the existing server-component pattern (`requireUser()` → user-scoped queries → render). All analytics math lives in one feature module split into **pure transforms** (unit-tested) and **thin async Prisma wrappers** that feed them. Charts are `"use client"` leaf components over Recharts. No schema changes, no Server Actions, no mutations.

**Tech Stack:** Next.js 16 (App Router, async Server Components), React 19, Prisma 6 / Postgres, Tailwind v4, Recharts 3 (new dep), Vitest (new dev dep).

---

## File Structure

| File | Responsibility |
|---|---|
| `vitest.config.ts` (create) | Test runner config + `@/` alias. |
| `package.json` (modify) | Add `test` scripts + `vitest`, `recharts` deps. |
| `src/lib/features/insights.ts` (create) | Pure transforms (`estimated1RM`, `weeklyVolume`, `buildHistory`, `personalRecords`) + async Prisma wrappers (`getInsightsMeso`, `getVolumeData`, `getExerciseHistory`, `getPersonalRecords`, `getLoggedExercises`). |
| `src/lib/features/insights.test.ts` (create) | Unit tests for the pure transforms. |
| `src/components/charts/VolumeChart.tsx` (create) | Client leaf — grouped weekly bars per muscle + MEV/MRV reference lines. |
| `src/components/charts/HistoryChart.tsx` (create) | Client leaf — est-1RM line over time. |
| `src/app/(app)/insights/page.tsx` (create) | Server Component — fetches data, lays out 3 sections, empty states, scope selectors. |
| `src/lib/nav.ts` (modify) | Add the `/insights` nav link. |

**Boundary rationale:** Pure transforms are separated from Prisma I/O so they unit-test with plain fixtures (no DB). The completed-sets-only filter lives exclusively in the async wrappers (single source of truth in the `where` clause); pure functions trust their inputs.

---

## Task 1: Add the Vitest test runner

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Vitest**

Run: `npm install -D vitest`
Expected: installs without peer-dependency errors; `vitest` appears under `devDependencies`.

- [ ] **Step 2: Create the Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Mirror the tsconfig "@/*" -> "src/*" path alias so tests import the same way app code does.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Add test scripts**

In `package.json`, add to the `"scripts"` object (after `"db:admin"`):

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 4: Verify the runner works (no tests yet)**

Run: `npm test`
Expected: Vitest runs and reports `No test files found` (exit is non-zero but that's expected until Task 2). This only confirms Vitest is wired up.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest test runner"
```

---

## Task 2: Pure analytics transforms (TDD)

**Files:**
- Create: `src/lib/features/insights.ts`
- Test: `src/lib/features/insights.test.ts`

These functions are pure: no I/O, deterministic. We write the tests first.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/features/insights.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  estimated1RM,
  weeklyVolume,
  buildHistory,
  personalRecords,
} from "@/lib/features/insights";

describe("estimated1RM (Epley)", () => {
  it("returns the weight unchanged for a single rep", () => {
    expect(estimated1RM(200, 1)).toBe(200);
    expect(estimated1RM(200, 0)).toBe(200);
  });
  it("applies Epley for multi-rep sets", () => {
    // 100 * (1 + 10/30) = 133.33...
    expect(estimated1RM(100, 10)).toBeCloseTo(133.333, 2);
  });
});

describe("weeklyVolume", () => {
  it("buckets completed-set rows by muscle group and week", () => {
    const rows = [
      { muscleGroup: "Chest", week: 0 },
      { muscleGroup: "Chest", week: 0 },
      { muscleGroup: "Chest", week: 1 },
      { muscleGroup: "Back", week: 1 },
    ];
    const result = weeklyVolume(rows, 3);
    expect(result).toEqual([
      { muscleGroup: "Back", perWeek: [0, 1, 0] },
      { muscleGroup: "Chest", perWeek: [2, 1, 0] },
    ]);
  });
  it("ignores rows whose week is outside the meso length", () => {
    const rows = [
      { muscleGroup: "Chest", week: 0 },
      { muscleGroup: "Chest", week: 5 },
    ];
    expect(weeklyVolume(rows, 2)).toEqual([{ muscleGroup: "Chest", perWeek: [1, 0] }]);
  });
});

describe("buildHistory", () => {
  it("computes rounded est-1RM and sorts by date ascending", () => {
    const rows = [
      { date: new Date("2026-05-02"), weight: 100, reps: 10 }, // 1RM 133 -> 133
      { date: new Date("2026-05-01"), weight: 100, reps: 1 }, // 1RM 100
    ];
    const result = buildHistory(rows);
    expect(result.map((r) => r.oneRm)).toEqual([100, 133]);
    expect(result[0].date.getTime()).toBeLessThan(result[1].date.getTime());
  });
});

describe("personalRecords", () => {
  const now = new Date("2026-06-10T00:00:00Z");
  it("keeps the best est-1RM per exercise, sorted desc", () => {
    const rows = [
      { exercise: "Bench", weight: 100, reps: 5, date: new Date("2026-06-01") }, // ~117
      { exercise: "Bench", weight: 120, reps: 5, date: new Date("2026-06-08") }, // ~140 (best)
      { exercise: "Row", weight: 200, reps: 1, date: new Date("2026-01-01") }, // 200
    ];
    const result = personalRecords(rows, now);
    expect(result.map((r) => r.exercise)).toEqual(["Row", "Bench"]);
    expect(result.find((r) => r.exercise === "Bench")!.weight).toBe(120);
  });
  it("flags a PR as new only within the window", () => {
    const rows = [
      { exercise: "Bench", weight: 100, reps: 5, date: new Date("2026-06-08") }, // 2 days ago
      { exercise: "Row", weight: 100, reps: 5, date: new Date("2026-01-01") }, // long ago
    ];
    const result = personalRecords(rows, now, 14);
    expect(result.find((r) => r.exercise === "Bench")!.isNew).toBe(true);
    expect(result.find((r) => r.exercise === "Row")!.isNew).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `insights.ts` has no such exports (module not found / undefined functions).

- [ ] **Step 3: Implement the pure transforms**

Create `src/lib/features/insights.ts` (this file gets the async wrappers appended in Task 3):

```ts
// Insights analytics. Split in two halves:
//   1. PURE transforms below — no I/O, deterministic, unit-tested. They TRUST that
//      callers pass only completed sets; the "completed only" filter lives in the
//      async wrappers (Task 3), so it has exactly one source of truth.
//   2. Async Prisma wrappers (added in Task 3) that fetch rows and feed these.

// ----- Row shapes the pure transforms consume -----
export type VolumeRow = { muscleGroup: string; week: number };
export type HistoryRow = { date: Date; weight: number; reps: number };
export type PrRow = { exercise: string; weight: number; reps: number; date: Date };

/** Epley estimated 1RM. A true single is returned as-is (not inflated). */
export function estimated1RM(weight: number, reps: number): number {
  if (reps <= 1) return weight;
  return weight * (1 + reps / 30);
}

/** Set counts per muscle group across `weeksCount` weeks. One entry per muscle, sorted by name. */
export function weeklyVolume(
  rows: VolumeRow[],
  weeksCount: number,
): { muscleGroup: string; perWeek: number[] }[] {
  const byMg = new Map<string, number[]>();
  for (const r of rows) {
    if (r.week < 0 || r.week >= weeksCount) continue;
    let arr = byMg.get(r.muscleGroup);
    if (!arr) {
      arr = new Array(weeksCount).fill(0);
      byMg.set(r.muscleGroup, arr);
    }
    arr[r.week] += 1;
  }
  return [...byMg.entries()]
    .map(([muscleGroup, perWeek]) => ({ muscleGroup, perWeek }))
    .sort((a, b) => a.muscleGroup.localeCompare(b.muscleGroup));
}

/** Est-1RM points over time for one exercise, oldest first. */
export function buildHistory(
  rows: HistoryRow[],
): { date: Date; weight: number; reps: number; oneRm: number }[] {
  return rows
    .map((r) => ({
      date: r.date,
      weight: r.weight,
      reps: r.reps,
      oneRm: Math.round(estimated1RM(r.weight, r.reps)),
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Best est-1RM per exercise, sorted desc; `isNew` if the best set is within `windowDays`. */
export function personalRecords(
  rows: PrRow[],
  now: Date,
  windowDays = 14,
): { exercise: string; weight: number; reps: number; oneRm: number; date: Date; isNew: boolean }[] {
  const best = new Map<string, { exercise: string; weight: number; reps: number; date: Date; oneRm: number }>();
  for (const r of rows) {
    const oneRm = estimated1RM(r.weight, r.reps);
    const cur = best.get(r.exercise);
    if (!cur || oneRm > cur.oneRm) {
      best.set(r.exercise, { exercise: r.exercise, weight: r.weight, reps: r.reps, date: r.date, oneRm });
    }
  }
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  return [...best.values()]
    .map((b) => ({
      ...b,
      oneRm: Math.round(b.oneRm),
      isNew: now.getTime() - b.date.getTime() <= windowMs,
    }))
    .sort((a, b) => b.oneRm - a.oneRm);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all four describe blocks green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/insights.ts src/lib/features/insights.test.ts
git commit -m "feat: pure insights transforms (est-1RM, volume, history, PRs)"
```

---

## Task 3: Async Prisma wrappers

**Files:**
- Modify: `src/lib/features/insights.ts` (append)

These fetch completed sets scoped by ownership and feed the pure transforms. No new tests (they're thin DB glue; covered by manual verification in Task 7).

- [ ] **Step 1: Append the wrappers to `src/lib/features/insights.ts`**

Add at the top of the file (with the other imports — there are none yet, so add this as the first line):

```ts
import { prisma } from "@/lib/prisma";
```

Then append at the end of the file:

```ts
// ----- Async Prisma wrappers. "complete" filter lives here, once. -----

/** Resolve the meso to chart: by `key` (ownership-checked) or the user's most recent. */
export async function getInsightsMeso(userId: number, key?: string) {
  const select = { id: true, key: true, name: true, weeksCount: true, userId: true } as const;
  if (key) {
    const m = await prisma.mesocycle.findUnique({ where: { key }, select });
    return m && m.userId === userId ? m : null;
  }
  return prisma.mesocycle.findFirst({
    where: { userId, status: { not: "archived" } },
    orderBy: { createdAt: "desc" },
    select,
  });
}

/** Weekly set volume per muscle for one meso. */
export async function getVolumeData(mesoId: number, weeksCount: number) {
  const sets = await prisma.exerciseSet.findMany({
    where: { status: "complete", dayExercise: { day: { mesoId } } },
    select: {
      dayExercise: {
        select: {
          muscleGroup: { select: { name: true } },
          day: { select: { week: true } },
        },
      },
    },
  });
  const rows: VolumeRow[] = sets.map((s) => ({
    muscleGroup: s.dayExercise.muscleGroup.name,
    week: s.dayExercise.day.week,
  }));
  return weeklyVolume(rows, weeksCount);
}

/** Distinct exercises the user has completed at least one set of, sorted by name. */
export async function getLoggedExercises(userId: number) {
  const rows = await prisma.dayExercise.findMany({
    where: { day: { meso: { userId } }, sets: { some: { status: "complete" } } },
    select: { exerciseId: true, exercise: { select: { name: true } } },
  });
  const map = new Map<number, string>();
  for (const r of rows) map.set(r.exerciseId, r.exercise.name);
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Est-1RM history for one exercise across all the user's blocks. */
export async function getExerciseHistory(userId: number, exerciseId: number) {
  const sets = await prisma.exerciseSet.findMany({
    where: {
      status: "complete",
      weight: { not: null },
      reps: { not: null },
      finishedAt: { not: null },
      dayExercise: { exerciseId, day: { meso: { userId } } },
    },
    select: { weight: true, reps: true, finishedAt: true },
  });
  const rows: HistoryRow[] = sets.map((s) => ({
    date: s.finishedAt!,
    weight: s.weight!,
    reps: s.reps!,
  }));
  return buildHistory(rows);
}

/** Best est-1RM per exercise across all the user's completed sets. */
export async function getPersonalRecords(userId: number, now: Date) {
  const sets = await prisma.exerciseSet.findMany({
    where: {
      status: "complete",
      weight: { not: null },
      reps: { not: null },
      finishedAt: { not: null },
      dayExercise: { day: { meso: { userId } } },
    },
    select: {
      weight: true,
      reps: true,
      finishedAt: true,
      dayExercise: { select: { exercise: { select: { name: true } } } },
    },
  });
  const rows: PrRow[] = sets.map((s) => ({
    exercise: s.dayExercise.exercise.name,
    weight: s.weight!,
    reps: s.reps!,
    date: s.finishedAt!,
  }));
  return personalRecords(rows, now);
}
```

- [ ] **Step 2: Verify it type-checks and tests still pass**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; the Task 2 tests still PASS (wrappers don't touch them).

- [ ] **Step 3: Commit**

```bash
git add src/lib/features/insights.ts
git commit -m "feat: insights Prisma wrappers (volume, history, PRs, scope)"
```

---

## Task 4: Chart components (Recharts)

**Files:**
- Modify: `package.json` (add `recharts`)
- Create: `src/components/charts/VolumeChart.tsx`
- Create: `src/components/charts/HistoryChart.tsx`

- [ ] **Step 1: Install + verify Recharts React 19 compatibility**

Per `AGENTS.md`, this is a modified Next 16 / React 19 setup — verify before trusting.

Run: `npm view recharts peerDependencies.react`
Expected: includes `^19.0.0` (confirmed at plan time: Recharts 3.x). If it does NOT, STOP and fall back to `visx` or hand-rolled SVG (same data props), then adjust Steps 2-3.

Run: `npm install recharts`
Expected: installs; no `ERESOLVE` peer error against `react@19.2.4`.

- [ ] **Step 2: Create the volume chart**

Create `src/components/charts/VolumeChart.tsx`:

```tsx
"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

// One record per week: { week: "W1", Chest: 3, Back: 2, ... }. `muscleColors` maps
// each muscle series to its color. `mev`/`mrv` are the engine's volume landmarks.
export type WeekDatum = { week: string } & Record<string, number | string>;

export function VolumeChart({
  data,
  muscleColors,
  mev,
  mrv,
}: {
  data: WeekDatum[];
  muscleColors: Record<string, string>;
  mev: number;
  mrv: number;
}) {
  const muscles = Object.keys(muscleColors);
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <XAxis dataKey="week" stroke="#9ca3af" fontSize={12} tickLine={false} />
        <YAxis stroke="#9ca3af" fontSize={12} allowDecimals={false} tickLine={false} />
        <Tooltip
          contentStyle={{ background: "#0b0f14", border: "1px solid #1f2937", borderRadius: 8, fontSize: 12 }}
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <ReferenceLine y={mev} stroke="#34d399" strokeDasharray="4 4" label={{ value: "MEV", fill: "#34d399", fontSize: 11, position: "right" }} />
        <ReferenceLine y={mrv} stroke="#f87171" strokeDasharray="4 4" label={{ value: "MRV", fill: "#f87171", fontSize: 11, position: "right" }} />
        {muscles.map((m) => (
          <Bar key={m} dataKey={m} fill={muscleColors[m]} radius={[2, 2, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: Create the history chart**

Create `src/components/charts/HistoryChart.tsx`:

```tsx
"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// Pre-formatted points: { date: "5/2/2026", oneRm: 133 }. A single point renders as a dot.
export function HistoryChart({ data }: { data: { date: string; oneRm: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
        <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} tickLine={false} />
        <YAxis stroke="#9ca3af" fontSize={12} domain={["auto", "auto"]} tickLine={false} />
        <Tooltip
          contentStyle={{ background: "#0b0f14", border: "1px solid #1f2937", borderRadius: 8, fontSize: 12 }}
        />
        <Line type="monotone" dataKey="oneRm" stroke="#ff6a2b" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 4: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/components/charts/VolumeChart.tsx src/components/charts/HistoryChart.tsx
git commit -m "feat: Recharts volume + history chart components"
```

---

## Task 5: The Insights page

**Files:**
- Create: `src/app/(app)/insights/page.tsx`

- [ ] **Step 1: Create the page**

Create `src/app/(app)/insights/page.tsx`:

```tsx
import { requireUser } from "@/lib/auth";
import { getMesocycles } from "@/lib/data";
import {
  getInsightsMeso,
  getVolumeData,
  getLoggedExercises,
  getExerciseHistory,
  getPersonalRecords,
} from "@/lib/features/insights";
import { MEV_SETS, MRV_SETS } from "@/lib/progression";
import { mgColor, fmtWeight } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/ui";
import { VolumeChart, type WeekDatum } from "@/components/charts/VolumeChart";
import { HistoryChart } from "@/components/charts/HistoryChart";

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ meso?: string; ex?: string }>;
}) {
  const me = await requireUser();
  const sp = await searchParams;

  const [mesos, meso, logged, prs] = await Promise.all([
    getMesocycles(me.id),
    getInsightsMeso(me.id, sp.meso),
    getLoggedExercises(me.id),
    getPersonalRecords(me.id, new Date()),
  ]);

  // --- Volume: shape per-muscle weekly arrays into per-week records for the chart ---
  const volume = meso ? await getVolumeData(meso.id, meso.weeksCount) : [];
  const muscleColors: Record<string, string> = Object.fromEntries(
    volume.map((v) => [v.muscleGroup, mgColor(v.muscleGroup)]),
  );
  const weekData: WeekDatum[] = Array.from({ length: meso?.weeksCount ?? 0 }, (_, w) => {
    const row: WeekDatum = { week: `W${w + 1}` };
    for (const v of volume) row[v.muscleGroup] = v.perWeek[w] ?? 0;
    return row;
  });
  const hasVolume = volume.length > 0;

  // --- History: default to the first logged exercise; serialize dates for the client ---
  const exId = sp.ex ? Number(sp.ex) : logged[0]?.id;
  const historyRaw = exId ? await getExerciseHistory(me.id, exId) : [];
  const history = historyRaw.map((h) => ({ date: h.date.toLocaleDateString(), oneRm: h.oneRm }));

  return (
    <>
      <PageHeader title="Insights" subtitle="Volume, progress, and records from your logged sets" />

      {/* 1 · WEEKLY VOLUME */}
      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Weekly volume per muscle</h2>
          {mesos.length > 0 && (
            <form className="flex items-center gap-2">
              {exId && <input type="hidden" name="ex" value={exId} />}
              <select name="meso" defaultValue={meso?.key} className="input">
                {mesos.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn-primary">
                View
              </button>
            </form>
          )}
        </div>
        {hasVolume ? (
          <div className="card p-4">
            <p className="mb-3 text-xs text-muted">
              Sets per week vs. engine landmarks — MEV {MEV_SETS} (green) · MRV {MRV_SETS} (red).
            </p>
            <VolumeChart data={weekData} muscleColors={muscleColors} mev={MEV_SETS} mrv={MRV_SETS} />
          </div>
        ) : (
          <EmptyState title="No completed sets yet" hint="Log some sets in a mesocycle to see weekly volume." />
        )}
      </section>

      {/* 2 · EXERCISE HISTORY */}
      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Exercise history</h2>
          {logged.length > 0 && (
            <form className="flex items-center gap-2">
              {meso?.key && <input type="hidden" name="meso" value={meso.key} />}
              <select name="ex" defaultValue={exId} className="input">
                {logged.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn-primary">
                View
              </button>
            </form>
          )}
        </div>
        {history.length > 0 ? (
          <div className="card p-4">
            <p className="mb-3 text-xs text-muted">Estimated 1RM (Epley) per completed set, over time.</p>
            <HistoryChart data={history} />
          </div>
        ) : (
          <EmptyState title="No history yet" hint="Complete sets of an exercise to chart its estimated 1RM." />
        )}
      </section>

      {/* 3 · PERSONAL RECORDS */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Personal records</h2>
        {prs.length > 0 ? (
          <div className="card divide-y divide-line/60">
            {prs.map((pr) => (
              <div key={pr.exercise} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span aria-hidden>🏆</span>
                  <span className="text-sm">{pr.exercise}</span>
                  {pr.isNew && (
                    <span className="chip" style={{ color: "var(--color-good)", borderColor: "var(--color-good)" }}>
                      New
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted">
                  <span>
                    {fmtWeight(pr.weight, me.unit)} × {pr.reps}
                  </span>
                  <span className="text-accent">~{pr.oneRm} 1RM</span>
                  <span>{pr.date.toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No records yet" hint="Your best estimated 1RM per exercise will appear here." />
        )}
      </section>
    </>
  );
}
```

- [ ] **Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no type errors. (`getMesocycles` returns objects with `key` and `name` — both used here.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/insights/page.tsx"
git commit -m "feat: insights page with volume, history, and PR sections"
```

---

## Task 6: Add the nav link

**Files:**
- Modify: `src/lib/nav.ts`

- [ ] **Step 1: Add the Insights link**

In `src/lib/nav.ts`, add a new entry to `NAV_LINKS` between the Exercises and Templates lines:

```ts
  { href: "/insights", label: "Insights", shortLabel: "Insights", icon: "▲" },
```

The resulting array order: Workout · Mesocycles · Exercises · **Insights** · Templates · Profile. Both `Nav.tsx` (desktop) and `BottomBar.tsx` (mobile) consume `NAV_LINKS`, so no other edits are needed.

- [ ] **Step 2: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: no type errors (the new object matches the `NavLink` type).

- [ ] **Step 3: Commit**

```bash
git add src/lib/nav.ts
git commit -m "feat: add Insights to navigation"
```

---

## Task 7: Build + manual verification

**Files:** none (verification only)

- [ ] **Step 1: Full test + type-check + production build**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: tests PASS, no type errors, build succeeds with `/insights` listed in the route output.

- [ ] **Step 2: Manual smoke test**

Run: `npm run dev`, sign in, then verify:
- The sidebar (desktop) and bottom bar (mobile ≤640px) both show **Insights**.
- `/insights` renders three sections. With a meso that has completed sets: volume bars appear with MEV/MRV dashed lines; the meso `<select>` switches blocks; the exercise `<select>` switches the history line; PRs list shows best est-1RM per exercise with a "New" chip on recent ones.
- A brand-new user (no logged sets) sees three empty states, no crash.
- Switching the meso/exercise selectors preserves the other selector's value (hidden-input round-trip via the URL).

- [ ] **Step 3: Final confirmation**

Confirm the working tree is clean: `git status` shows nothing uncommitted. The feature is complete on branch `feat/insights-screen`.

---

## Self-Review Notes (author check, completed)

- **Spec coverage:** Volume/History/PRs sections → Tasks 2-5; MEV/MRV from `progression.ts` → Task 5 imports; completed-sets-only → Task 3 `where` clauses; Epley → Task 2 `estimated1RM`; 14-day window → Task 2 `personalRecords`; dedicated route + nav → Tasks 5-6; empty states → Task 5; test runner prerequisite → Task 1; Recharts compat gate → Task 4 Step 1.
- **Type consistency:** `VolumeRow`/`HistoryRow`/`PrRow` defined in Task 2 and consumed in Task 3; `WeekDatum` defined in Task 4 and imported in Task 5; pure-function names identical across Tasks 2/3/5.
- **Placeholders:** none — every code step is complete.
```
