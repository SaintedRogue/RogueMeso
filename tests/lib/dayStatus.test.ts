import { describe, it, expect } from "vitest";
import { rolledUpDayStatus } from "@/lib/dayStatus";

const done = { status: "complete" };
const skip = { status: "skipped" };
const open = { status: "pendingWeight" };

describe("rolledUpDayStatus", () => {
  // Finishing is explicit (the Complete-session button). Logging the last set must NOT
  // auto-promote the day; it stays "partial" so the user can still make edits.
  it("does not auto-promote to complete when every set is done but the day wasn't completed", () => {
    const exercises = [{ sets: [done, done] }, { sets: [done, skip] }];
    expect(rolledUpDayStatus(exercises, "partial")).toBe("partial");
    expect(rolledUpDayStatus(exercises, "pending")).toBe("partial");
  });

  // Sticky: once explicitly completed, re-editing a still-finished set keeps it complete.
  it("preserves complete when the day was already complete and every set is still done", () => {
    const exercises = [{ sets: [done, done] }, { sets: [done, skip] }];
    expect(rolledUpDayStatus(exercises, "complete")).toBe("complete");
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
