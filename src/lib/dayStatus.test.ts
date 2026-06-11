import { describe, it, expect } from "vitest";
import { rolledUpDayStatus } from "@/lib/dayStatus";

const done = { status: "complete" };
const skip = { status: "skipped" };
const open = { status: "pendingWeight" };

describe("rolledUpDayStatus", () => {
  it("is complete when every exercise's sets are all done or skipped", () => {
    const exercises = [{ sets: [done, done] }, { sets: [done, skip] }];
    expect(rolledUpDayStatus(exercises, "partial")).toBe("complete");
  });

  it("is partial when some work is logged but not all", () => {
    const exercises = [{ sets: [done, open] }, { sets: [open, open] }];
    expect(rolledUpDayStatus(exercises, "pending")).toBe("partial");
  });

  it("an exercise with zero sets blocks completion", () => {
    const exercises = [{ sets: [done] }, { sets: [] }];
    expect(rolledUpDayStatus(exercises, "partial")).toBe("partial");
  });

  // Regression: swapping the only logged exercise on a finished day clears its sets, and the
  // day must drop back rather than stay falsely "complete".
  it("demotes a previously-complete day to pending once all sets are cleared", () => {
    const exercises = [{ sets: [open, open] }];
    expect(rolledUpDayStatus(exercises, "complete")).toBe("pending");
  });

  it("preserves an 'up next' day (ready/current) when nothing is logged", () => {
    const exercises = [{ sets: [open, open] }];
    expect(rolledUpDayStatus(exercises, "ready")).toBe("ready");
    expect(rolledUpDayStatus(exercises, "current")).toBe("current");
  });

  it("treats a day with no exercises as not complete", () => {
    expect(rolledUpDayStatus([], "ready")).toBe("ready");
    expect(rolledUpDayStatus([], "complete")).toBe("pending");
  });
});
