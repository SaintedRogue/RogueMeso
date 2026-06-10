import { describe, it, expect } from "vitest";
import {
  estimated1RM,
  weeklyVolume,
  buildHistory,
  personalRecords,
} from "@/lib/features/insights";

describe("estimated1RM (Epley)", () => {
  it("returns the weight unchanged for a single rep", () => {
    expect(estimated1RM(200, 1)).toBe(200);
    expect(estimated1RM(200, 0)).toBe(200);
  });
  it("applies Epley for multi-rep sets", () => {
    // 100 * (1 + 10/30) = 133.33...
    expect(estimated1RM(100, 10)).toBeCloseTo(133.333, 2);
  });
});

describe("weeklyVolume", () => {
  it("buckets completed-set rows by muscle group and week", () => {
    const rows = [
      { muscleGroup: "Chest", week: 0 },
      { muscleGroup: "Chest", week: 0 },
      { muscleGroup: "Chest", week: 1 },
      { muscleGroup: "Back", week: 1 },
    ];
    const result = weeklyVolume(rows, 3);
    expect(result).toEqual([
      { muscleGroup: "Back", perWeek: [0, 1, 0] },
      { muscleGroup: "Chest", perWeek: [2, 1, 0] },
    ]);
  });
  it("ignores rows whose week is outside the meso length", () => {
    const rows = [
      { muscleGroup: "Chest", week: 0 },
      { muscleGroup: "Chest", week: 5 },
    ];
    expect(weeklyVolume(rows, 2)).toEqual([{ muscleGroup: "Chest", perWeek: [1, 0] }]);
  });
});

describe("buildHistory", () => {
  it("computes rounded est-1RM and sorts by date ascending", () => {
    const rows = [
      { date: new Date("2026-05-02"), weight: 100, reps: 10 }, // 1RM 133 -> 133
      { date: new Date("2026-05-01"), weight: 100, reps: 1 }, // 1RM 100
    ];
    const result = buildHistory(rows);
    expect(result.map((r) => r.oneRm)).toEqual([100, 133]);
    expect(result[0].date.getTime()).toBeLessThan(result[1].date.getTime());
  });
});

describe("personalRecords", () => {
  const now = new Date("2026-06-10T00:00:00Z");
  it("keeps the best est-1RM per exercise, sorted desc", () => {
    const rows = [
      { exercise: "Bench", weight: 100, reps: 5, date: new Date("2026-06-01") }, // ~117
      { exercise: "Bench", weight: 120, reps: 5, date: new Date("2026-06-08") }, // ~140 (best)
      { exercise: "Row", weight: 200, reps: 1, date: new Date("2026-01-01") }, // 200
    ];
    const result = personalRecords(rows, now);
    expect(result.map((r) => r.exercise)).toEqual(["Row", "Bench"]);
    expect(result.find((r) => r.exercise === "Bench")!.weight).toBe(120);
  });
  it("flags a PR as new only within the window", () => {
    const rows = [
      { exercise: "Bench", weight: 100, reps: 5, date: new Date("2026-06-08") }, // 2 days ago
      { exercise: "Row", weight: 100, reps: 5, date: new Date("2026-01-01") }, // long ago
    ];
    const result = personalRecords(rows, now, 14);
    expect(result.find((r) => r.exercise === "Bench")!.isNew).toBe(true);
    expect(result.find((r) => r.exercise === "Row")!.isNew).toBe(false);
  });
});
