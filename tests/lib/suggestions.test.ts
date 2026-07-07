import { describe, it, expect } from "vitest";
import { suggestedReps, setRampPreview } from "@/lib/progression";
import {
  buildSetSuggestions,
  buildBodyweightSeeds,
  buildBodyweightOnlySeeds,
  isBodyweightType,
  isPureBodyweightType,
} from "@/lib/suggestions";

describe("setRampPreview", () => {
  it("emphasize ramps +1 set/week from MEV toward the MRV cap, with a deload last week", () => {
    expect(setRampPreview("emphasize", 5)).toEqual([2, 3, 4, 5, 1]);
  });

  it("grow adds a set every other week", () => {
    expect(setRampPreview("grow", 5)).toEqual([2, 2, 3, 3, 1]);
  });

  it("maintain holds steady until the deload", () => {
    expect(setRampPreview("maintain", 5)).toEqual([2, 2, 2, 2, 1]);
  });
});

describe("suggestedReps", () => {
  it("adds the RIR drop as reps at the same load (RIR 2→1 → +1 rep)", () => {
    expect(suggestedReps(13, 2, 1)).toBe(14);
  });

  it("adds the full drop when RIR falls by more than one", () => {
    expect(suggestedReps(10, 3, 1)).toBe(12);
  });

  it("adds nothing when target RIR holds flat", () => {
    expect(suggestedReps(13, 1, 1)).toBe(13);
  });

  it("never reduces reps when last week was already harder", () => {
    expect(suggestedReps(13, 0, 2)).toBe(13);
  });

  it("repeats last week's reps on a deload (null RIR on either side)", () => {
    expect(suggestedReps(13, 1, null)).toBe(13);
    expect(suggestedReps(13, null, 1)).toBe(13);
  });
});

describe("buildSetSuggestions", () => {
  const cur = (id: number, position: number, over: Partial<{ weight: number | null; reps: number | null; status: string }> = {}) => ({
    id,
    position,
    weight: null as number | null,
    reps: null as number | null,
    status: "pendingWeight",
    ...over,
  });
  const prev = (position: number, weight: number, reps: number, status = "complete") => ({
    id: 900 + position,
    position,
    weight,
    reps,
    status,
  });

  it("suggests last week's weight with RIR-bumped reps, keyed by current set id", () => {
    const current = [{ exercise: { id: 7 }, sets: [cur(1, 0), cur(2, 1)] }];
    const previous = [{ exercise: { id: 7 }, sets: [prev(0, 45, 13), prev(1, 45, 12)] }];
    expect(buildSetSuggestions(current, previous, 2, 1)).toEqual({
      1: { weight: 45, reps: 14 },
      2: { weight: 45, reps: 13 },
    });
  });

  it("matches exercises by id, not position (handles a reordered day)", () => {
    const current = [
      { exercise: { id: 2 }, sets: [cur(1, 0)] },
      { exercise: { id: 7 }, sets: [cur(2, 0)] },
    ];
    const previous = [
      { exercise: { id: 7 }, sets: [prev(0, 100, 8)] },
      { exercise: { id: 2 }, sets: [prev(0, 50, 10)] },
    ];
    expect(buildSetSuggestions(current, previous, 2, 1)).toEqual({
      1: { weight: 50, reps: 11 },
      2: { weight: 100, reps: 9 },
    });
  });

  it("skips sets the user already engaged with (logged, skipped, or weight entered)", () => {
    const current = [
      {
        exercise: { id: 7 },
        sets: [cur(1, 0, { status: "complete", weight: 50, reps: 12 }), cur(2, 1, { weight: 40 }), cur(3, 2)],
      },
    ];
    const previous = [{ exercise: { id: 7 }, sets: [prev(0, 45, 13), prev(1, 45, 13), prev(2, 45, 13)] }];
    expect(buildSetSuggestions(current, previous, 2, 1)).toEqual({ 3: { weight: 45, reps: 14 } });
  });

  it("skips when last week's matching set was not completed or is missing", () => {
    const current = [{ exercise: { id: 7 }, sets: [cur(1, 0), cur(2, 1)] }];
    const previous = [{ exercise: { id: 7 }, sets: [prev(0, 45, 13, "skipped")] }];
    expect(buildSetSuggestions(current, previous, 2, 1)).toEqual({});
  });

  it("matches repeated occurrences of the same exercise by order, not last-writer-wins", () => {
    const current = [
      { exercise: { id: 7 }, sets: [cur(1, 0)] },
      { exercise: { id: 7 }, sets: [cur(2, 0)] },
    ];
    const previous = [
      { exercise: { id: 7 }, sets: [prev(0, 45, 13)] }, // first occurrence
      { exercise: { id: 7 }, sets: [prev(0, 95, 8)] }, // second occurrence
    ];
    expect(buildSetSuggestions(current, previous, 2, 1)).toEqual({
      1: { weight: 45, reps: 14 },
      2: { weight: 95, reps: 9 },
    });
  });

  it("produces nothing when the exercise didn't appear last week", () => {
    const current = [{ exercise: { id: 7 }, sets: [cur(1, 0)] }];
    const previous = [{ exercise: { id: 9 }, sets: [prev(0, 45, 13)] }];
    expect(buildSetSuggestions(current, previous, 2, 1)).toEqual({});
  });

  it("seeds a set added this week (3 vs last week's 2) from last week's final completed set", () => {
    const current = [{ exercise: { id: 7 }, sets: [cur(1, 0), cur(2, 1), cur(3, 2)] }];
    const previous = [{ exercise: { id: 7 }, sets: [prev(0, 45, 13), prev(1, 50, 11)] }];
    expect(buildSetSuggestions(current, previous, 2, 1)).toEqual({
      1: { weight: 45, reps: 14 },
      2: { weight: 50, reps: 12 },
      3: { weight: 50, reps: 12 }, // no position 2 last week → inherits the final set (position 1)
    });
  });

  it("the extra-set fallback uses last week's last COMPLETED set, skipping a trailing skip", () => {
    const current = [{ exercise: { id: 7 }, sets: [cur(1, 0), cur(2, 1), cur(3, 2)] }];
    // Last week: set 1 completed, set 2 skipped. The added set 3 should inherit set 1, not the skip.
    const previous = [{ exercise: { id: 7 }, sets: [prev(0, 45, 13), prev(1, 55, 10, "skipped")] }];
    expect(buildSetSuggestions(current, previous, 2, 1)).toEqual({
      1: { weight: 45, reps: 14 }, // position match, completed
      // set 2 (position 1) matches last week's skipped set → still no suggestion
      3: { weight: 45, reps: 14 }, // position 2 absent → falls back to last completed (position 0)
    });
  });
});

describe("isBodyweightType", () => {
  it("matches all three bodyweight variants regardless of casing or punctuation", () => {
    // Robust to whether Prisma surfaces the @map value or the enum identifier.
    expect(isBodyweightType("bodyweight-only")).toBe(true);
    expect(isBodyweightType("bodyweightOnly")).toBe(true);
    expect(isBodyweightType("bodyweight-loadable")).toBe(true);
    expect(isBodyweightType("bodyweightLoadable")).toBe(true);
    expect(isBodyweightType("machine-assistance")).toBe(true);
    expect(isBodyweightType("machineAssistance")).toBe(true);
  });

  it("rejects loaded equipment and empty values", () => {
    expect(isBodyweightType("barbell")).toBe(false);
    expect(isBodyweightType("dumbbell")).toBe(false);
    expect(isBodyweightType("machine")).toBe(false);
    expect(isBodyweightType(null)).toBe(false);
    expect(isBodyweightType(undefined)).toBe(false);
  });
});

describe("buildBodyweightSeeds", () => {
  const cur = (id: number, position: number, over: Partial<{ weight: number | null; reps: number | null; status: string }> = {}) => ({
    id,
    position,
    weight: null as number | null,
    reps: null as number | null,
    status: "pendingWeight",
    ...over,
  });

  it("seeds every unlogged set of a bodyweight exercise with its last logged weight (weight only, no reps)", () => {
    const current = [{ exercise: { id: 7, exerciseType: "bodyweight-loadable" }, sets: [cur(1, 0), cur(2, 1)] }];
    expect(buildBodyweightSeeds(current, { 7: 25 })).toEqual({
      1: { weight: 25 },
      2: { weight: 25 },
    });
  });

  it("ignores non-bodyweight exercises entirely", () => {
    const current = [{ exercise: { id: 7, exerciseType: "barbell" }, sets: [cur(1, 0)] }];
    expect(buildBodyweightSeeds(current, { 7: 135 })).toEqual({});
  });

  it("skips an exercise with no last logged weight", () => {
    const current = [{ exercise: { id: 7, exerciseType: "bodyweight-only" }, sets: [cur(1, 0)] }];
    expect(buildBodyweightSeeds(current, {})).toEqual({});
  });

  it("seeds only sets the user hasn't engaged with (logged, skipped, or weight entered)", () => {
    const current = [
      {
        exercise: { id: 7, exerciseType: "machine-assistance" },
        sets: [cur(1, 0, { status: "complete", weight: 30 }), cur(2, 1, { weight: 20 }), cur(3, 2, { status: "skipped" }), cur(4, 3)],
      },
    ];
    expect(buildBodyweightSeeds(current, { 7: 25 })).toEqual({ 4: { weight: 25 } });
  });

  it("seeds a zero added-load (a logged weight of 0 is a real value, not 'missing')", () => {
    const current = [{ exercise: { id: 7, exerciseType: "bodyweight-only" }, sets: [cur(1, 0)] }];
    expect(buildBodyweightSeeds(current, { 7: 0 })).toEqual({ 1: { weight: 0 } });
  });
});

describe("isPureBodyweightType", () => {
  it("matches only bodyweightOnly (the load IS the lifter), regardless of casing/punctuation", () => {
    expect(isPureBodyweightType("bodyweight-only")).toBe(true);
    expect(isPureBodyweightType("bodyweightOnly")).toBe(true);
  });

  it("rejects loadable/assist (their weight field is an added load) and loaded/empty", () => {
    expect(isPureBodyweightType("bodyweight-loadable")).toBe(false);
    expect(isPureBodyweightType("bodyweightLoadable")).toBe(false);
    expect(isPureBodyweightType("machine-assistance")).toBe(false);
    expect(isPureBodyweightType("barbell")).toBe(false);
    expect(isPureBodyweightType(null)).toBe(false);
    expect(isPureBodyweightType(undefined)).toBe(false);
  });
});

describe("buildBodyweightOnlySeeds", () => {
  const cur = (id: number, position: number, over: Partial<{ weight: number | null; reps: number | null; status: string }> = {}) => ({
    id,
    position,
    weight: null as number | null,
    reps: null as number | null,
    status: "pendingWeight",
    ...over,
  });

  it("seeds every unlogged set of a bodyweightOnly exercise with the given body weight", () => {
    const current = [{ exercise: { id: 7, exerciseType: "bodyweight-only" }, sets: [cur(1, 0), cur(2, 1)] }];
    expect(buildBodyweightOnlySeeds(current, 181)).toEqual({ 1: 181, 2: 181 });
  });

  it("ignores loadable/assist and loaded exercises (weight there is an added load)", () => {
    const current = [
      { exercise: { id: 7, exerciseType: "bodyweight-loadable" }, sets: [cur(1, 0)] },
      { exercise: { id: 8, exerciseType: "machine-assistance" }, sets: [cur(2, 0)] },
      { exercise: { id: 9, exerciseType: "barbell" }, sets: [cur(3, 0)] },
    ];
    expect(buildBodyweightOnlySeeds(current, 181)).toEqual({});
  });

  it("seeds nothing when body weight is unknown (no weigh-in yet)", () => {
    const current = [{ exercise: { id: 7, exerciseType: "bodyweight-only" }, sets: [cur(1, 0)] }];
    expect(buildBodyweightOnlySeeds(current, null)).toEqual({});
  });

  it("seeds only sets the user hasn't engaged with (logged, skipped, or weight entered)", () => {
    const current = [
      {
        exercise: { id: 7, exerciseType: "bodyweight-only" },
        sets: [cur(1, 0, { status: "complete", weight: 181 }), cur(2, 1, { weight: 175 }), cur(3, 2, { status: "skipped" }), cur(4, 3)],
      },
    ];
    expect(buildBodyweightOnlySeeds(current, 181)).toEqual({ 4: 181 });
  });
});
