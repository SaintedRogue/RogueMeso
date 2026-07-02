import { describe, it, expect } from "vitest";
import { normalizeSetInput } from "@/lib/setInput";

// Server-side guard for logSet: the client validates the common cases, but the action
// must reject what a buggy or hostile client could send. weight is a Float in the user's
// display unit; reps is an Int. Both are independently nullable (partial logs).
describe("normalizeSetInput", () => {
  it("accepts a normal weight × reps pair", () => {
    expect(normalizeSetInput(135, 8)).toEqual({ weight: 135, reps: 8 });
  });

  it("accepts nulls (partial log leaves the set pendingWeight)", () => {
    expect(normalizeSetInput(null, null)).toEqual({ weight: null, reps: null });
    expect(normalizeSetInput(135, null)).toEqual({ weight: 135, reps: null });
    expect(normalizeSetInput(null, 8)).toEqual({ weight: null, reps: 8 });
  });

  it("accepts weight 0 (bodyweight-only, no added load) and reps 0 (failed set)", () => {
    expect(normalizeSetInput(0, 0)).toEqual({ weight: 0, reps: 0 });
  });

  it("accepts fractional weight (plates come in 2.5s and 1.25s)", () => {
    expect(normalizeSetInput(102.5, 5)).toEqual({ weight: 102.5, reps: 5 });
  });

  it("rejects non-finite weight (NaN, Infinity)", () => {
    expect(normalizeSetInput(Number.NaN, 8)).toBeNull();
    expect(normalizeSetInput(Number.POSITIVE_INFINITY, 8)).toBeNull();
  });

  it("rejects negative weight (assist load is stored positive)", () => {
    expect(normalizeSetInput(-45, 8)).toBeNull();
  });

  it("rejects absurd weight above the cap", () => {
    expect(normalizeSetInput(5001, 8)).toBeNull();
    expect(normalizeSetInput(5000, 8)).toEqual({ weight: 5000, reps: 8 });
  });

  it("rejects fractional reps (schema column is Int — would throw at the DB today)", () => {
    expect(normalizeSetInput(135, 8.5)).toBeNull();
  });

  it("rejects non-finite or negative reps", () => {
    expect(normalizeSetInput(135, Number.NaN)).toBeNull();
    expect(normalizeSetInput(135, -1)).toBeNull();
  });

  it("rejects absurd reps above the cap", () => {
    expect(normalizeSetInput(135, 1001)).toBeNull();
    expect(normalizeSetInput(135, 1000)).toEqual({ weight: 135, reps: 1000 });
  });
});
