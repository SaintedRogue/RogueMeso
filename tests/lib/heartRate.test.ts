import { describe, it, expect } from "vitest";
import {
  parseHeartRateMeasurement,
  zoneFor,
  maxHrFor,
  sanitizeBpm,
  sanitizeBatch,
  appendSample,
  HR_MAX_BUFFER,
  HR_MAX_BATCH,
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
