import { describe, it, expect } from "vitest";
import { downsampleHr, hrSessionStats, mergePerSecond, setRecoveryDrop, type HrPoint } from "@/lib/features/hrInsights";

/** 1 Hz series builder: seconds → epoch ms. */
const p = (sec: number, bpm: number): HrPoint => ({ ts: sec * 1000, bpm });

describe("downsampleHr", () => {
  it("returns short series unchanged", () => {
    const pts = [p(0, 100), p(1, 101), p(2, 102)];
    expect(downsampleHr(pts, 10)).toEqual(pts);
  });

  it("reduces a long series to at most the target, averaging within buckets", () => {
    const pts = Array.from({ length: 1000 }, (_, i) => p(i, 100 + (i % 3)));
    const out = downsampleHr(pts, 100);
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.length).toBeGreaterThan(80);
    // Chronological and inside the original time range.
    expect(out[0].ts).toBeGreaterThanOrEqual(pts[0].ts);
    expect(out[out.length - 1].ts).toBeLessThanOrEqual(pts[pts.length - 1].ts);
    for (const q of out) expect(q.bpm).toBeGreaterThanOrEqual(100);
  });
});

describe("hrSessionStats", () => {
  const MAX = 200;

  it("computes avg/max and time-weighted zone seconds", () => {
    // 10 samples at 120 (60% = Z2), then 5 at 185 (92.5% = Z5), 1 Hz.
    const pts = [
      ...Array.from({ length: 10 }, (_, i) => p(i, 120)),
      ...Array.from({ length: 5 }, (_, i) => p(10 + i, 185)),
    ];
    const stats = hrSessionStats(pts, MAX);
    expect(stats).not.toBeNull();
    expect(stats!.maxBpm).toBe(185);
    expect(stats!.avgBpm).toBe(142); // (120·10 + 185·5) / 15 rounded
    expect(stats!.zoneSeconds[2]).toBe(10);
    expect(stats!.zoneSeconds[5]).toBe(5);
    expect(stats!.totalSeconds).toBe(15);
  });

  it("counts per-minute backfill samples at full weight (60s gaps are normal cadence)", () => {
    const stats = hrSessionStats([p(0, 120), p(60, 120)], MAX);
    expect(stats!.totalSeconds).toBe(61); // 60s owned by the first sample + 1s for the last
    expect(stats!.zoneSeconds[2]).toBe(61);
  });

  it("caps gaps beyond minute cadence so a paused capture cannot inflate zone time", () => {
    const stats = hrSessionStats([p(0, 120), p(600, 120)], MAX);
    // A 10-minute hole counts as the 75s cap + 1s for the final sample.
    expect(stats!.totalSeconds).toBe(76);
    expect(stats!.zoneSeconds[2]).toBe(76);
  });

  it("returns null when there is nothing meaningful to summarize", () => {
    expect(hrSessionStats([], MAX)).toBeNull();
    expect(hrSessionStats([p(0, 120)], MAX)).toBeNull();
  });
});

describe("mergePerSecond", () => {
  it("collapses same-second samples from two sources into one, keeping the max bpm", () => {
    // Recorder at 1000ms and BLE pill at 1400ms captured the same heartbeat second.
    const merged = mergePerSecond([
      { ts: 1000, bpm: 120 },
      { ts: 1400, bpm: 122 },
      { ts: 2100, bpm: 125 },
    ]);
    expect(merged).toEqual([
      { ts: 1000, bpm: 122 },
      { ts: 2000, bpm: 125 },
    ]);
  });

  it("sorts unordered input chronologically", () => {
    const merged = mergePerSecond([
      { ts: 5000, bpm: 110 },
      { ts: 1000, bpm: 100 },
    ]);
    expect(merged.map((p) => p.ts)).toEqual([1000, 5000]);
  });

  it("passes an already-clean series through unchanged", () => {
    const pts = [
      { ts: 0, bpm: 100 },
      { ts: 1000, bpm: 101 },
    ];
    expect(mergePerSecond(pts)).toEqual(pts);
  });
});

describe("setRecoveryDrop", () => {
  // HR holds 150 until the set at t=10s, then decays 1 bpm/s to a floor of 116.
  const decay = Array.from({ length: 121 }, (_, t) => p(t, t <= 10 ? 150 : Math.max(116, 150 - (t - 10))));

  it("measures the average drop from set time to the post-set minimum", () => {
    expect(setRecoveryDrop(decay, [10_000])).toBe(34); // 150 → 116
  });

  it("skips sets without enough post-set samples and returns null when none qualify", () => {
    // A set 5s before capture ends has almost no recovery window to measure.
    expect(setRecoveryDrop(decay, [115_000])).toBeNull();
    expect(setRecoveryDrop(decay, [])).toBeNull();
    // Mixed: the unusable set must not dilute the usable one.
    expect(setRecoveryDrop(decay, [10_000, 115_000])).toBe(34);
  });

  it("never reports a negative drop when HR climbs after a set", () => {
    const climb = Array.from({ length: 121 }, (_, t) => p(t, 100 + t));
    expect(setRecoveryDrop(climb, [10_000])).toBe(0);
  });
});
