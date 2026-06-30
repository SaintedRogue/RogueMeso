import { describe, it, expect } from "vitest";
import { pickTopSet, summarizeExercise, type SummarySet } from "@/lib/shareSummary";

const set = (weight: number | null, reps: number | null, status = "complete"): SummarySet => ({
  weight,
  reps,
  status,
});

describe("pickTopSet", () => {
  it("returns null when nothing is logged", () => {
    expect(pickTopSet([set(null, null, "pendingWeight"), set(135, 10, "skipped")])).toBeNull();
  });

  it("ignores pending and skipped sets, considering only logged ones", () => {
    const top = pickTopSet([set(225, 5), set(315, 1, "skipped"), set(135, 12, "pendingWeight")]);
    expect(top).toEqual(set(225, 5));
  });

  it("picks the heaviest logged set", () => {
    const top = pickTopSet([set(135, 10), set(185, 6), set(155, 8)]);
    expect(top).toEqual(set(185, 6));
  });

  it("breaks weight ties by the higher rep count", () => {
    const top = pickTopSet([set(185, 6), set(185, 8), set(185, 5)]);
    expect(top).toEqual(set(185, 8));
  });

  it("ranks bodyweight sets (null weight) by reps", () => {
    const top = pickTopSet([set(null, 12), set(null, 20), set(null, 8)]);
    expect(top).toEqual(set(null, 20));
  });
});

describe("summarizeExercise", () => {
  const ex = (sets: SummarySet[]) => ({
    exercise: { name: "Bench Press" },
    muscleGroup: { name: "Chest" },
    sets,
  });

  it("counts logged sets against the planned total", () => {
    const s = summarizeExercise(ex([set(135, 10), set(135, 9), set(null, null, "pendingWeight")]), "lb", 2);
    expect(s.loggedCount).toBe(2);
    expect(s.plannedCount).toBe(3);
  });

  it("treats skipped sets as resolved (counted) but never the top set", () => {
    const s = summarizeExercise(ex([set(135, 10), set(null, null, "skipped")]), "lb", 2);
    expect(s.loggedCount).toBe(2); // both sets are resolved
    expect(s.topSet).toEqual(set(135, 10));
  });

  it("formats the top set as 'weight × reps' with the unit for a loaded lift", () => {
    const s = summarizeExercise(ex([set(135, 10), set(185, 6)]), "lb", 2);
    expect(s.detail).toBe("185 lb × 6");
  });

  it("formats a bodyweight top set as reps only", () => {
    const s = summarizeExercise(ex([set(null, 12), set(null, 15)]), "lb", 2);
    expect(s.detail).toBe("15 reps");
  });

  it("shows the RIR target instead of a top set when nothing is logged yet", () => {
    const s = summarizeExercise(ex([set(null, null, "pendingWeight"), set(null, null, "pendingWeight")]), "lb", 2);
    expect(s.topSet).toBeNull();
    expect(s.detail).toBe("target 2 RIR");
  });

  it("labels a deload (null RIR target) as 'deload' when nothing is logged", () => {
    const s = summarizeExercise(ex([set(null, null, "pendingWeight")]), "lb", null);
    expect(s.detail).toBe("deload");
  });
});
