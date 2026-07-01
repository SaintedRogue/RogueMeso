import { prisma } from "@/lib/prisma";
import { toKg } from "@/lib/format";
import {
  pushPullOf,
  isHorizontal,
  patternLabel,
  normalizeSide,
  JOINT_LABELS,
  type Joint,
} from "@/lib/features/physicalTherapyTaxonomy";

// Physical Therapy Lens analytics. Same split as features/insights.ts:
//   1. PURE transforms (this top half) — no I/O, deterministic, unit-tested. They TRUST that
//      callers pass only COMPLETED sets with a real load; the "complete" filter + unit → kg
//      conversion live in the async Prisma wrappers at the bottom (one source of truth).
//   2. Async Prisma wrappers that fetch rows, convert to canonical kg, and feed these.
//
// This lens is ADVISORY only (mirrors the Recovery hub): nothing here mutates progression.ts.
// Every heuristic band below is a named constant so the views and the tests agree exactly.

const DAY_MS = 24 * 60 * 60 * 1000;

// ----- Tunable bands / thresholds (single source of truth, shared with the views) -----
export const ACWR = { low: 0.8, high: 1.3, spike: 1.5, minHistoryDays: 21 } as const;
export const PUSH_PULL = { low: 0.7, high: 1.3 } as const;
export const SYMMETRY_FLAG_PCT = 15;
export const SYMPTOM_DEFAULTS = { minSessions: 3, windowDays: 28 } as const;

// ----- Row shape the pure transforms consume -----
/** One completed, loaded set, already normalized to canonical kilograms. */
export type PtSet = {
  date: Date; // the set's finishedAt (used for day/week bucketing)
  exercise: string;
  pattern: string | null; // MovementPattern key, or null = Unclassified
  joints: Joint[];
  side: string | null; // "left" | "right" | "bilateral" | null(=bilateral)
  weightKg: number;
  reps: number;
};

/** One symptom (pain) report, at the exercise-in-session grain. */
export type PtPain = { date: Date; region: string; score: number; exercise: string };

/** One week's readiness + training load, for the recovery-vs-load overlay. */
export type WeeklyLoad = { week: string; volume: number; readiness: number | null };

// ===== Volume load & aggregation =====

/** Volume load of a single set = load(kg) × reps. Negative/NaN inputs are the caller's problem. */
export function volumeLoad(weightKg: number, reps: number): number {
  return weightKg * reps;
}

/** ISO-8601 week key ("2026-W27"). UTC-based so it never drifts with the server timezone. */
export function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // to the Thursday of this ISO week
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((date.getTime() - firstThursday.getTime()) / DAY_MS - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7,
    );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const vl = (s: PtSet) => volumeLoad(s.weightKg, s.reps);

/** Total volume load per ISO week, ascending by week key. Weeks with no sets are omitted. */
export function weeklyVolumeLoad(sets: PtSet[]): { week: string; volume: number }[] {
  const byWeek = new Map<string, number>();
  for (const s of sets) byWeek.set(isoWeek(s.date), (byWeek.get(isoWeek(s.date)) ?? 0) + vl(s));
  return [...byWeek.entries()].map(([week, volume]) => ({ week, volume })).sort((a, b) => a.week.localeCompare(b.week));
}

// ===== Movement-pattern balance =====

export type PatternBucket = { pattern: string; label: string; sets: number; volume: number };

/** Sets + volume load grouped by movement pattern (null → "Unclassified"), sorted by volume desc. */
export function movementPatternBalance(sets: PtSet[]): PatternBucket[] {
  const byPattern = new Map<string, { sets: number; volume: number }>();
  for (const s of sets) {
    const key = s.pattern ?? "unclassified";
    const cur = byPattern.get(key) ?? { sets: 0, volume: 0 };
    cur.sets += 1;
    cur.volume += vl(s);
    byPattern.set(key, cur);
  }
  return [...byPattern.entries()]
    .map(([pattern, v]) => ({ pattern, label: pattern === "unclassified" ? "Unclassified" : patternLabel(pattern), ...v }))
    .sort((a, b) => b.volume - a.volume || a.label.localeCompare(b.label));
}

// ===== Push : pull ratio =====

export type RatioResult = {
  pushSets: number;
  pullSets: number;
  pushVolume: number;
  pullVolume: number;
  ratioBySets: number | null; // push ÷ pull; null when there is no pull to divide by
  ratioByVolume: number | null;
  ready: boolean; // both sides have at least one set → a ratio is meaningful
  flag: boolean; // outside the balanced band (or all of one side with none of the other)
};

function ratioOf(sets: PtSet[], predicate: (s: PtSet) => boolean): RatioResult {
  let pushSets = 0,
    pullSets = 0,
    pushVolume = 0,
    pullVolume = 0;
  for (const s of sets) {
    if (!predicate(s)) continue;
    const side = pushPullOf(s.pattern);
    if (side === "push") {
      pushSets += 1;
      pushVolume += vl(s);
    } else if (side === "pull") {
      pullSets += 1;
      pullVolume += vl(s);
    }
  }
  const ratioBySets = pullSets > 0 ? pushSets / pullSets : null;
  const ratioByVolume = pullVolume > 0 ? pushVolume / pullVolume : null;
  const total = pushSets + pullSets;
  const ready = pushSets > 0 && pullSets > 0;
  // No push/pull work at all → nothing to say. One side present but not the other → imbalanced.
  // Both present → flag when either ratio leaves the balanced band.
  const outOfBand = (r: number | null) => r !== null && (r < PUSH_PULL.low || r > PUSH_PULL.high);
  const flag =
    total === 0 ? false : !ready ? true : outOfBand(ratioBySets) || outOfBand(ratioByVolume);
  return { pushSets, pullSets, pushVolume, pullVolume, ratioBySets, ratioByVolume, ready, flag };
}

/** Overall push:pull and the horizontal-only sub-ratio (shoulder-health relevant). */
export function pushPullRatio(sets: PtSet[]): { overall: RatioResult; horizontal: RatioResult } {
  return {
    overall: ratioOf(sets, () => true),
    horizontal: ratioOf(sets, (s) => isHorizontal(s.pattern)),
  };
}

// ===== Acute : Chronic Workload Ratio =====

export type AcwrResult = {
  acute: number; // trailing 7-day volume load
  chronic: number; // trailing 28-day volume load ÷ 4 (weekly average)
  ratio: number | null; // acute ÷ chronic; null when chronic is 0
  ready: boolean; // ≥ ACWR.minHistoryDays of history before asOf
  inBand: boolean; // ratio within [low, high]
  spike: boolean; // ratio > spike threshold
};

/**
 * ACWR for a set of completed sets as of `asOf`. acute = Σ volume load in the trailing 7 days;
 * chronic = (Σ volume load in the trailing 28 days) ÷ 4. Needs ≥ ~3 weeks of history before it
 * is trustworthy — `ready` is false until then so the view shows a "need more data" state.
 */
export function acwr(sets: PtSet[], asOf: Date): AcwrResult {
  const asOfMs = asOf.getTime();
  let acute = 0,
    chronic28 = 0,
    earliest = Infinity;
  for (const s of sets) {
    const t = s.date.getTime();
    if (t > asOfMs) continue; // ignore anything logged after the reference instant
    earliest = Math.min(earliest, t);
    const age = asOfMs - t;
    if (age < 7 * DAY_MS) acute += vl(s);
    if (age < 28 * DAY_MS) chronic28 += vl(s);
  }
  const chronic = chronic28 / 4;
  const ratio = chronic > 0 ? acute / chronic : null;
  const historyDays = earliest === Infinity ? 0 : (asOfMs - earliest) / DAY_MS;
  const ready = historyDays >= ACWR.minHistoryDays;
  return {
    acute,
    chronic,
    ratio,
    ready,
    inBand: ratio !== null && ratio >= ACWR.low && ratio <= ACWR.high,
    spike: ratio !== null && ratio > ACWR.spike,
  };
}

/** ACWR computed separately per movement pattern (null patterns excluded), sorted by pattern. */
export function acwrByPattern(sets: PtSet[], asOf: Date): { pattern: string; label: string; result: AcwrResult }[] {
  const patterns = [...new Set(sets.map((s) => s.pattern).filter((p): p is string => p !== null))];
  return patterns
    .map((pattern) => ({
      pattern,
      label: patternLabel(pattern),
      result: acwr(
        sets.filter((s) => s.pattern === pattern),
        asOf,
      ),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// ===== Left / right symmetry =====

export type SymmetryResult = {
  left: number | null; // best-set load on each side (kg)
  right: number | null;
  index: number | null; // (strong − weak) / strong × 100; null unless both sides present
  strong: "left" | "right" | null;
  flag: boolean; // asymmetry beyond the threshold
};

/**
 * Symmetry index from the best-set load per side: (strong − weak) / strong × 100. Only defined
 * when BOTH sides have a positive load — otherwise `index` is null (need matched data) and there
 * is no flag. Divide-by-zero (strong load 0) is guarded the same way.
 */
export function symmetryIndex(
  leftBest: number | null,
  rightBest: number | null,
  flagPct = SYMMETRY_FLAG_PCT,
): SymmetryResult {
  if (leftBest == null || rightBest == null || leftBest <= 0 || rightBest <= 0) {
    return { left: leftBest, right: rightBest, index: null, strong: null, flag: false };
  }
  const strong = leftBest >= rightBest ? "left" : "right";
  const strongVal = Math.max(leftBest, rightBest);
  const weakVal = Math.min(leftBest, rightBest);
  const index = ((strongVal - weakVal) / strongVal) * 100;
  return { left: leftBest, right: rightBest, index, strong, flag: index > flagPct };
}

/** Per-exercise symmetry from unilateral sets (side left/right), using each side's heaviest set. */
export function symmetryByExercise(
  sets: PtSet[],
  flagPct = SYMMETRY_FLAG_PCT,
): { exercise: string; result: SymmetryResult }[] {
  const byExercise = new Map<string, { left: number | null; right: number | null }>();
  for (const s of sets) {
    const side = normalizeSide(s.side);
    if (side === "bilateral") continue; // symmetry needs a specific side
    const cur = byExercise.get(s.exercise) ?? { left: null, right: null };
    cur[side] = Math.max(cur[side] ?? 0, s.weightKg);
    byExercise.set(s.exercise, cur);
  }
  return [...byExercise.entries()]
    .map(([exercise, { left, right }]) => ({ exercise, result: symmetryIndex(left, right, flagPct) }))
    .sort((a, b) => a.exercise.localeCompare(b.exercise));
}

// ===== Recovery vs load =====

export type RecoveryVsLoad = {
  ready: boolean; // enough weeks with readiness to judge a trend
  flag: boolean; // load rising while readiness falling across the window
  volumeChange: number; // last − first over the window
  readinessChange: number;
};

/**
 * Flag the "digging a hole" pattern: over the trailing 2–3 weeks (weeks that have a readiness
 * value), weekly training volume trends UP while readiness trends DOWN. `weekly` must be ascending.
 */
export function recoveryVsLoad(weekly: WeeklyLoad[]): RecoveryVsLoad {
  const withReadiness = weekly.filter((w) => w.readiness != null);
  const window = withReadiness.slice(-3); // up to the last 3 readiness weeks
  if (window.length < 2) return { ready: false, flag: false, volumeChange: 0, readinessChange: 0 };
  const first = window[0];
  const last = window[window.length - 1];
  const volumeChange = last.volume - first.volume;
  const readinessChange = (last.readiness as number) - (first.readiness as number);
  return { ready: true, flag: volumeChange > 0 && readinessChange < 0, volumeChange, readinessChange };
}

// ===== Symptom flags =====

export type SymptomFlag = {
  region: string;
  kind: "recurring" | "rising";
  sessions: number; // distinct sessions in the window (recurring)
  scoreChange: number; // last − first score in the window (rising)
};

/**
 * Symptom flags per body region within a rolling window ending at `asOf`:
 *   (a) recurring — the region appears in ≥ minSessions distinct sessions (dates), or
 *   (b) rising — its pain score trends up (last > first, ≥ 2 points).
 * `minSessions` is configurable (default 3). A region can raise both kinds.
 */
export function symptomFlags(
  pain: PtPain[],
  asOf: Date,
  opts: { minSessions?: number; windowDays?: number } = {},
): SymptomFlag[] {
  const minSessions = opts.minSessions ?? SYMPTOM_DEFAULTS.minSessions;
  const windowDays = opts.windowDays ?? SYMPTOM_DEFAULTS.windowDays;
  const cutoff = asOf.getTime() - windowDays * DAY_MS;
  const inWindow = pain
    .filter((p) => p.date.getTime() > cutoff && p.date.getTime() <= asOf.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const byRegion = new Map<string, PtPain[]>();
  for (const p of inWindow) {
    const arr = byRegion.get(p.region) ?? [];
    arr.push(p);
    byRegion.set(p.region, arr);
  }

  const flags: SymptomFlag[] = [];
  for (const [region, entries] of byRegion) {
    const sessions = new Set(entries.map((e) => e.date.getTime())).size;
    const scoreChange = entries.length >= 2 ? entries[entries.length - 1].score - entries[0].score : 0;
    if (sessions >= minSessions) flags.push({ region, kind: "recurring", sessions, scoreChange });
    if (entries.length >= 2 && scoreChange >= 2) flags.push({ region, kind: "rising", sessions, scoreChange });
  }
  return flags.sort((a, b) => a.region.localeCompare(b.region) || a.kind.localeCompare(b.kind));
}

// ===== Load progression & joint load =====

/** Weekly volume-load series per group (exercise or pattern), for the progression chart. */
export function loadProgression(
  sets: PtSet[],
  groupBy: "exercise" | "pattern",
): { key: string; label: string; points: { week: string; volume: number }[] }[] {
  const groups = new Map<string, PtSet[]>();
  for (const s of sets) {
    const key = groupBy === "exercise" ? s.exercise : (s.pattern ?? "unclassified");
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }
  return [...groups.entries()]
    .map(([key, gsets]) => ({
      key,
      label: groupBy === "pattern" ? (key === "unclassified" ? "Unclassified" : patternLabel(key)) : key,
      points: weeklyVolumeLoad(gsets),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Cumulative volume load attributed to each primary joint (a set counts once per joint it loads). */
export function jointLoad(sets: PtSet[]): { joint: string; label: string; volume: number; sets: number }[] {
  const byJoint = new Map<string, { volume: number; sets: number }>();
  for (const s of sets) {
    for (const j of s.joints) {
      const cur = byJoint.get(j) ?? { volume: 0, sets: 0 };
      cur.volume += vl(s);
      cur.sets += 1;
      byJoint.set(j, cur);
    }
  }
  return [...byJoint.entries()]
    .map(([joint, v]) => ({ joint, label: JOINT_LABELS[joint as Joint] ?? joint, ...v }))
    .sort((a, b) => b.volume - a.volume || a.label.localeCompare(b.label));
}

// ===== Async Prisma wrappers (unit → kg conversion + "complete" filter live here, once) =====

function parseJoints(json: string | null): Joint[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? (arr as Joint[]) : [];
  } catch {
    return [];
  }
}

/** All of a user's completed, loaded sets across a meso (or all blocks) as canonical-kg PtSets. */
export async function getPtSets(userId: number, mesoId?: number): Promise<PtSet[]> {
  const rows = await prisma.exerciseSet.findMany({
    where: {
      status: "complete",
      weight: { not: null },
      reps: { not: null },
      finishedAt: { not: null },
      dayExercise: { day: { meso: { userId, ...(mesoId ? { id: mesoId } : {}) } } },
    },
    select: {
      weight: true,
      reps: true,
      unit: true,
      side: true,
      finishedAt: true,
      dayExercise: {
        select: {
          exercise: { select: { name: true, movementPattern: true, primaryJoints: true } },
          day: { select: { meso: { select: { unit: true } } } },
        },
      },
    },
  });
  return rows.map((r) => ({
    date: r.finishedAt!,
    exercise: r.dayExercise.exercise.name,
    pattern: r.dayExercise.exercise.movementPattern,
    joints: parseJoints(r.dayExercise.exercise.primaryJoints),
    side: r.side,
    weightKg: toKg(r.weight!, r.unit ?? r.dayExercise.day.meso.unit),
    reps: r.reps!,
  }));
}

/** All of a user's pain reports (exercise-in-session grain), fanned out one row per body region. */
export async function getPtPain(userId: number, mesoId?: number): Promise<PtPain[]> {
  const rows = await prisma.dayExercise.findMany({
    where: {
      painScore: { not: null },
      day: { meso: { userId, ...(mesoId ? { id: mesoId } : {}) } },
    },
    select: {
      painScore: true,
      painLocations: true,
      exercise: { select: { name: true } },
      day: { select: { finishedAt: true, meso: { select: { startedAt: true } } } },
    },
  });
  const out: PtPain[] = [];
  for (const r of rows) {
    const date = r.day.finishedAt ?? r.day.meso.startedAt;
    if (!date) continue; // undated session → can't place it on a timeline
    const regions = parseJoints(r.painLocations as string | null); // same JSON string[] parse
    const list = regions.length ? regions : ["other"];
    for (const region of list) out.push({ date, region, score: r.painScore!, exercise: r.exercise.name });
  }
  return out;
}

/** Weekly volume load overlaid with the mean readiness score for that ISO week. */
export async function getWeeklyLoadVsReadiness(userId: number, mesoId?: number): Promise<WeeklyLoad[]> {
  const [sets, readiness] = await Promise.all([
    getPtSets(userId, mesoId),
    prisma.readinessEntry.findMany({ where: { userId }, select: { date: true, score: true } }),
  ]);
  const volumeByWeek = new Map(weeklyVolumeLoad(sets).map((w) => [w.week, w.volume]));
  const readinessByWeek = new Map<string, number[]>();
  for (const r of readiness) {
    const w = isoWeek(r.date);
    const arr = readinessByWeek.get(w) ?? [];
    arr.push(r.score);
    readinessByWeek.set(w, arr);
  }
  const weeks = [...new Set([...volumeByWeek.keys(), ...readinessByWeek.keys()])].sort();
  return weeks.map((week) => {
    const scores = readinessByWeek.get(week);
    return {
      week,
      volume: volumeByWeek.get(week) ?? 0,
      readiness: scores && scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    };
  });
}
