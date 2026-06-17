import { describe, it, expect } from "vitest";
import { nextSetData, reindex, reconcileSetCount } from "@/lib/setOps";
import { DEFAULT_REPS_TARGET } from "@/lib/progression";

const s = (id: number, position: number, status = "pendingWeight") => ({ id, position, status });

const set = (position: number, over: Partial<Parameters<typeof nextSetData>[0][number]> = {}) => ({
  position,
  repsTarget: 10,
  weightTarget: null,
  weightTargetMin: null,
  weightTargetMax: null,
  unit: "lb",
  ...over,
});

describe("nextSetData", () => {
  it("appends after the highest position, copying the last set's targets", () => {
    const out = nextSetData([set(0, { repsTarget: 8 }), set(1, { repsTarget: 12 })], "kg");
    expect(out.position).toBe(2);
    expect(out.repsTarget).toBe(12);
    expect(out.unit).toBe("lb"); // copied from the last set, not the fallback
    expect(out.setType).toBe("regular");
    expect(out.status).toBe("pendingWeight");
  });

  it("copies the weight target and its range from the last set", () => {
    const out = nextSetData([set(0, { weightTarget: 100, weightTargetMin: 95, weightTargetMax: 105 })], "lb");
    expect(out.weightTarget).toBe(100);
    expect(out.weightTargetMin).toBe(95);
    expect(out.weightTargetMax).toBe(105);
  });

  it("falls back to the default rep target and meso unit when the group is empty", () => {
    const out = nextSetData([], "kg");
    expect(out.position).toBe(0);
    expect(out.repsTarget).toBe(DEFAULT_REPS_TARGET);
    expect(out.weightTarget).toBeNull();
    expect(out.unit).toBe("kg");
  });

  it("uses the highest-position set even if the array is unordered", () => {
    const out = nextSetData([set(1, { weightTarget: 50 }), set(0)], "lb");
    expect(out.position).toBe(2);
    expect(out.weightTarget).toBe(50);
  });
});

describe("reindex", () => {
  it("returns nothing when positions are already contiguous", () => {
    expect(reindex([{ id: 1, position: 0 }, { id: 2, position: 1 }])).toEqual([]);
  });

  it("compacts the gap left by a middle removal", () => {
    expect(reindex([{ id: 1, position: 0 }, { id: 3, position: 2 }])).toEqual([{ id: 3, position: 1 }]);
  });

  it("shifts every set when the first is removed", () => {
    expect(reindex([{ id: 2, position: 1 }, { id: 3, position: 2 }])).toEqual([
      { id: 2, position: 0 },
      { id: 3, position: 1 },
    ]);
  });
});

describe("reconcileSetCount", () => {
  it("appends the shortfall when below target", () => {
    expect(reconcileSetCount([s(1, 0), s(2, 1)], 4)).toEqual({ add: 2, removeIds: [] });
  });

  it("is a no-op when already at target", () => {
    expect(reconcileSetCount([s(1, 0), s(2, 1)], 2)).toEqual({ add: 0, removeIds: [] });
  });

  it("trims trailing sets (highest position first) when above target", () => {
    expect(reconcileSetCount([s(1, 0), s(2, 1), s(3, 2), s(4, 3)], 2)).toEqual({
      add: 0,
      removeIds: [4, 3],
    });
  });

  it("never removes a logged/skipped set, even if that leaves the count above target", () => {
    // positions 2 and 3 are logged; only the unlogged tail (id 5, pos 4) can go.
    const sets = [s(1, 0), s(2, 1), s(3, 2, "complete"), s(4, 3, "skipped"), s(5, 4)];
    expect(reconcileSetCount(sets, 2)).toEqual({ add: 0, removeIds: [5, 2, 1] });
  });

  it("never drops the group below one set", () => {
    expect(reconcileSetCount([s(1, 0), s(2, 1)], 0)).toEqual({ add: 0, removeIds: [2] });
  });
});
