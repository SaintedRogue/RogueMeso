import { describe, it, expect } from "vitest";
import {
  parseHeartRateMeasurement,
  zoneFor,
  maxHrFor,
  clockSkewMs,
  decodeHrBatch,
  sanitizeBpm,
  sanitizeBatch,
  appendSample,
  reconnectDelayMs,
  pushEvent,
  HR_MAX_BUFFER,
  HR_MAX_BATCH,
  HR_WATCH_MAX_AGE_MS,
  type HrSamplePoint,
} from "@/lib/heartRate";

/** Build a Heart Rate Measurement (0x2A37) payload from its parts. */
function measurement(opts: { flags: number; bytes: number[] }): DataView {
  return new DataView(new Uint8Array([opts.flags, ...opts.bytes]).buffer);
}

describe("parseHeartRateMeasurement", () => {
  it("reads a uint8 heart rate (flags bit0 = 0)", () => {
    expect(parseHeartRateMeasurement(measurement({ flags: 0x00, bytes: [142] }))).toEqual({
      bpm: 142,
      rrMs: [],
    });
  });

  it("reads a uint16 little-endian heart rate (flags bit0 = 1)", () => {
    // 0x0121 = 289 — absurd for a human but exercises the wire format.
    expect(parseHeartRateMeasurement(measurement({ flags: 0x01, bytes: [0x21, 0x01] }))).toEqual({
      bpm: 289,
      rrMs: [],
    });
  });

  it("reads RR-intervals (flags bit4), converting 1/1024s units to ms", () => {
    // One RR of 1024 units = exactly 1000 ms.
    const parsed = parseHeartRateMeasurement(measurement({ flags: 0x10, bytes: [60, 0x00, 0x04] }));
    expect(parsed).toEqual({ bpm: 60, rrMs: [1000] });
  });

  it("skips the energy-expended field (flags bit3) before the RR-intervals", () => {
    // flags: uint8 HR + energy expended + RR present = 0b0001_1000.
    const parsed = parseHeartRateMeasurement(
      measurement({ flags: 0x18, bytes: [72, 0xff, 0xff, 0x00, 0x02, 0x00, 0x04] }),
    );
    expect(parsed).toEqual({ bpm: 72, rrMs: [500, 1000] });
  });

  it("returns null for an empty or truncated packet", () => {
    expect(parseHeartRateMeasurement(new DataView(new ArrayBuffer(0)))).toBeNull();
    // Claims uint16 HR but only one byte follows the flags.
    expect(parseHeartRateMeasurement(measurement({ flags: 0x01, bytes: [0x21] }))).toBeNull();
  });
});

describe("maxHrFor", () => {
  const NOW = new Date("2026-07-02T12:00:00Z");

  it("uses 220 - age when a birth date is known", () => {
    expect(maxHrFor(new Date("1990-07-01T00:00:00Z"), NOW)).toBe(184); // just turned 36
  });

  it("does not count a birthday that has not happened yet this year", () => {
    expect(maxHrFor(new Date("1990-07-03T00:00:00Z"), NOW)).toBe(185); // still 35
  });

  it("falls back to 190 when the birth date is unknown", () => {
    expect(maxHrFor(null, NOW)).toBe(190);
  });

  it("clamps absurd ages into a sane band", () => {
    expect(maxHrFor(new Date("2025-01-01T00:00:00Z"), NOW)).toBeLessThanOrEqual(200);
    expect(maxHrFor(new Date("1900-01-01T00:00:00Z"), NOW)).toBeGreaterThanOrEqual(120);
  });
});

describe("zoneFor", () => {
  const MAX = 200; // easy percentages

  it("maps %max into the standard five zones", () => {
    expect(zoneFor(90, MAX)).toBe(0); // 45% — below Z1
    expect(zoneFor(110, MAX)).toBe(1); // 55%
    expect(zoneFor(130, MAX)).toBe(2); // 65%
    expect(zoneFor(150, MAX)).toBe(3); // 75%
    expect(zoneFor(170, MAX)).toBe(4); // 85%
    expect(zoneFor(190, MAX)).toBe(5); // 95%
  });

  it("treats each zone's lower bound as inclusive", () => {
    expect(zoneFor(100, MAX)).toBe(1); // exactly 50%
    expect(zoneFor(180, MAX)).toBe(5); // exactly 90%
  });
});

describe("sanitizeBpm", () => {
  it("passes plausible human readings through, rounded to an int", () => {
    expect(sanitizeBpm(64.6)).toBe(65);
    expect(sanitizeBpm(190)).toBe(190);
  });

  it("rejects junk: non-finite, zero, and off-body sensor values", () => {
    expect(sanitizeBpm(0)).toBeNull(); // strap reports 0 when off-body
    expect(sanitizeBpm(24)).toBeNull();
    expect(sanitizeBpm(251)).toBeNull();
    expect(sanitizeBpm(NaN)).toBeNull();
    expect(sanitizeBpm(Infinity)).toBeNull();
  });
});

describe("sanitizeBatch", () => {
  const NOW = 1_750_000_000_000;
  const ok = (at: number, bpm = 120) => ({ at, bpm });

  it("keeps plausible samples and rounds bpm", () => {
    expect(sanitizeBatch([{ at: NOW - 1000, bpm: 132.4 }], NOW)).toEqual([{ at: NOW - 1000, bpm: 132 }]);
  });

  it("drops junk bpm, non-finite timestamps, and stale/future readings", () => {
    const batch = [
      ok(NOW - 1000, 0), // off-body
      { at: NaN, bpm: 120 },
      ok(NOW - 7 * 60 * 60 * 1000), // >6h old — not from this session
      ok(NOW + 10 * 60 * 1000), // clock from the future
      ok(NOW - 2000), // the one keeper
    ];
    expect(sanitizeBatch(batch, NOW)).toEqual([{ at: NOW - 2000, bpm: 120 }]);
  });

  it("caps a batch at HR_MAX_BATCH rows, keeping the newest", () => {
    const batch = Array.from({ length: HR_MAX_BATCH + 20 }, (_, i) => ok(NOW - i * 1000));
    const rows = sanitizeBatch(batch, NOW);
    expect(rows).toHaveLength(HR_MAX_BATCH);
    expect(rows.some((r) => r.at === NOW)).toBe(true); // newest survived
  });

  it("accepts day-old watch samples under the wider watch gate, still bounding at it", () => {
    const batch = [
      ok(NOW - 20 * 60 * 60 * 1000), // yesterday morning, drained tonight — keep
      ok(NOW - 27 * 60 * 60 * 1000), // beyond even the watch gate — drop
    ];
    expect(sanitizeBatch(batch, NOW, HR_WATCH_MAX_AGE_MS)).toEqual([
      { at: NOW - 20 * 60 * 60 * 1000, bpm: 120 },
    ]);
    // The default (browser live-capture) gate is unchanged by the new parameter.
    expect(sanitizeBatch(batch, NOW)).toEqual([]);
  });
});

describe("clockSkewMs", () => {
  const SERVER_NOW = 1_750_000_000_000;

  it("trusts clocks that agree within 5s", () => {
    expect(clockSkewMs(SERVER_NOW - 3000, SERVER_NOW)).toBe(0);
    expect(clockSkewMs(SERVER_NOW + 4999, SERVER_NOW)).toBe(0);
  });

  it("returns the correction when the watch clock drifts", () => {
    expect(clockSkewMs(SERVER_NOW - 60_000, SERVER_NOW)).toBe(60_000); // watch behind → shift forward
    expect(clockSkewMs(SERVER_NOW + 30_000, SERVER_NOW)).toBe(-30_000); // watch ahead → shift back
  });

  it("treats a missing/junk watch clock as no correction", () => {
    expect(clockSkewMs(NaN, SERVER_NOW)).toBe(0);
    expect(clockSkewMs(undefined, SERVER_NOW)).toBe(0);
  });
});

describe("decodeHrBatch", () => {
  const T0 = 1_750_000_000_000;

  it("expands [secondsSinceT0, bpm] pairs into timestamped samples", () => {
    expect(decodeHrBatch(T0, [[0, 102], [1, 104], [2, 101]], 0)).toEqual([
      { at: T0, bpm: 102 },
      { at: T0 + 1000, bpm: 104 },
      { at: T0 + 2000, bpm: 101 },
    ]);
  });

  it("applies the clock-skew correction to every sample", () => {
    expect(decodeHrBatch(T0, [[0, 100]], 60_000)).toEqual([{ at: T0 + 60_000, bpm: 100 }]);
  });

  it("drops malformed pairs instead of crashing on them", () => {
    const junk = [[0, 100], "nope", [1], [NaN, 90], [2, 95]] as unknown as [number, number][];
    expect(decodeHrBatch(T0, junk, 0)).toEqual([
      { at: T0, bpm: 100 },
      { at: T0 + 2000, bpm: 95 },
    ]);
  });

  it("returns empty for a non-array payload", () => {
    expect(decodeHrBatch(T0, "junk" as unknown as [number, number][], 0)).toEqual([]);
  });
});

describe("reconnectDelayMs", () => {
  it("backs off exponentially from 1s and caps at 15s", () => {
    expect(reconnectDelayMs(0)).toBe(1000);
    expect(reconnectDelayMs(1)).toBe(2000);
    expect(reconnectDelayMs(2)).toBe(4000);
    expect(reconnectDelayMs(3)).toBe(8000);
    expect(reconnectDelayMs(4)).toBe(15000);
    expect(reconnectDelayMs(9)).toBe(15000);
  });
});

describe("pushEvent", () => {
  it("appends and returns a new array (store-snapshot friendly)", () => {
    const a: { at: number; step: string }[] = [];
    const b = pushEvent(a, { at: 1, step: "x" });
    expect(a).toHaveLength(0);
    expect(b.map((e) => e.step)).toEqual(["x"]);
  });

  it("drops the oldest beyond the cap", () => {
    let list: { at: number; step: string }[] = [];
    for (let i = 0; i < 60; i++) list = pushEvent(list, { at: i, step: `e${i}` }, 50);
    expect(list).toHaveLength(50);
    expect(list[0].step).toBe("e10");
    expect(list[49].step).toBe("e59");
  });
});

describe("appendSample", () => {
  const sample = (at: number): HrSamplePoint => ({ at, bpm: 120 });

  it("appends in arrival order", () => {
    const buf = appendSample(appendSample([], sample(1000)), sample(2000));
    expect(buf.map((s) => s.at)).toEqual([1000, 2000]);
  });

  it("drops the oldest samples once the buffer cap is hit (bounded memory)", () => {
    let buf: HrSamplePoint[] = [];
    for (let i = 0; i < HR_MAX_BUFFER + 5; i++) buf = appendSample(buf, sample(i));
    expect(buf).toHaveLength(HR_MAX_BUFFER);
    expect(buf[0].at).toBe(5); // the 5 oldest fell off
  });
});
