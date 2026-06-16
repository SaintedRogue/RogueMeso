import { describe, it, expect } from "vitest";
import { suggestedReps, setRampPreview } from "@/lib/progression";
import { buildSetSuggestions } from "@/lib/suggestions";

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
});
