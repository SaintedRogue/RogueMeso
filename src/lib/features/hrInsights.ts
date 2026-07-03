// Pure math for the session heart-rate chart + strain summaries. Mirrors the house
// pattern (insights.ts, recovery.ts): everything here is clock-free and unit-tested;
// the page fetches HrSample rows and the chart component just renders these results.

import { zoneFor } from "@/lib/heartRate";

/** One chart point: epoch ms + bpm (HrSample rows mapped server-side). */
export type HrPoint = { ts: number; bpm: number };

/** Consecutive-sample gaps beyond this stop accruing zone time (paused/dropped capture). */
const GAP_CAP_SECONDS = 10;

/** Post-set window in which the recovery drop is measured. */
const RECOVERY_WINDOW_MS = 90_000;
/** A set needs at least this many post-set samples for its drop to be trustworthy. */
const RECOVERY_MIN_SAMPLES = 10;

/**
 * Bucket-average a raw ~1 Hz session (thousands of rows) down to a chart-friendly series.
 * Buckets are equal slices of the time range; each contributes one point at its mean
 * timestamp/bpm, so shape survives while the DOM node count stays flat.
 */
export function downsampleHr(points: HrPoint[], targetCount = 360): HrPoint[] {
  if (points.length <= targetCount) return points;
  const first = points[0].ts;
  // +1 so the final timestamp falls inside the last bucket instead of spilling into
  // bucket targetCount+1 (an inclusive range has span+1 representable instants).
  const span = points[points.length - 1].ts - first + 1;
  const bucketMs = Math.max(1, Math.ceil(span / targetCount));
  const out: HrPoint[] = [];
  let bucket: HrPoint[] = [];
  let bucketEnd = first + bucketMs;
  const flushBucket = () => {
    if (bucket.length === 0) return;
    const ts = Math.round(bucket.reduce((s, q) => s + q.ts, 0) / bucket.length);
    const bpm = Math.round(bucket.reduce((s, q) => s + q.bpm, 0) / bucket.length);
    out.push({ ts, bpm });
    bucket = [];
  };
  for (const q of points) {
    while (q.ts >= bucketEnd) {
      flushBucket();
      bucketEnd += bucketMs;
    }
    bucket.push(q);
  }
  flushBucket();
  return out;
}

/**
 * Collapse samples to one per second, max bpm winning. The recorder and the live BLE
 * pill may both capture the same session (spec §6) — same sensor, so duplicates are
 * redundancy, not conflict; merging at read time means no write-time coordination.
 */
export function mergePerSecond(points: HrPoint[]): HrPoint[] {
  const bySecond = new Map<number, number>();
  for (const p of points) {
    const sec = Math.floor(p.ts / 1000) * 1000;
    const prev = bySecond.get(sec);
    if (prev == null || p.bpm > prev) bySecond.set(sec, p.bpm);
  }
  return [...bySecond.entries()].sort((a, b) => a[0] - b[0]).map(([ts, bpm]) => ({ ts, bpm }));
}

export type HrSessionStats = {
  avgBpm: number;
  maxBpm: number;
  /** Seconds spent in each zone, index 0 (below Z1) through 5. Time-weighted, gap-capped. */
  zoneSeconds: number[];
  totalSeconds: number;
};

/** Summarize a session's raw samples. Null when there's nothing meaningful (< 2 points). */
export function hrSessionStats(points: HrPoint[], maxHr: number): HrSessionStats | null {
  if (points.length < 2) return null;
  const zoneSeconds = [0, 0, 0, 0, 0, 0];
  let bpmSum = 0;
  let maxBpm = 0;
  for (let i = 0; i < points.length; i++) {
    bpmSum += points[i].bpm;
    if (points[i].bpm > maxBpm) maxBpm = points[i].bpm;
    // Each sample owns the time until the next one (capped), the last a nominal second.
    const dt = i < points.length - 1 ? Math.min(GAP_CAP_SECONDS, (points[i + 1].ts - points[i].ts) / 1000) : 1;
    zoneSeconds[zoneFor(points[i].bpm, maxHr)] += dt;
  }
  const totalSeconds = Math.round(zoneSeconds.reduce((s, z) => s + z, 0));
  return {
    avgBpm: Math.round(bpmSum / points.length),
    maxBpm,
    zoneSeconds: zoneSeconds.map((z) => Math.round(z)),
    totalSeconds,
  };
}

/**
 * Average drop from heart rate at set time to the minimum reached within the next 90s —
 * the "how well do I recover between sets" number. Sets with too few post-set samples
 * are skipped rather than diluting the average; null when no set qualifies.
 */
export function setRecoveryDrop(points: HrPoint[], setTimes: number[], windowMs = RECOVERY_WINDOW_MS): number | null {
  const drops: number[] = [];
  for (const setTs of setTimes) {
    // Baseline: the last reading at or before the set (a set is logged right after the work).
    let baseline: number | null = null;
    for (const q of points) {
      if (q.ts > setTs) break;
      baseline = q.bpm;
    }
    if (baseline == null) continue;
    const window = points.filter((q) => q.ts > setTs && q.ts <= setTs + windowMs);
    if (window.length < RECOVERY_MIN_SAMPLES) continue;
    const minAfter = Math.min(...window.map((q) => q.bpm));
    drops.push(Math.max(0, baseline - minAfter));
  }
  if (drops.length === 0) return null;
  return Math.round(drops.reduce((s, d) => s + d, 0) / drops.length);
}
