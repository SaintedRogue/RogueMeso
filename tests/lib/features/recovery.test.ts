import { describe, it, expect } from "vitest";
import {
  sleepNormalised,
  sorenessNormalised,
  energyNormalised,
  computeReadinessScore,
  readinessLabel,
  selectRoutineCategory,
  shouldSuggestSleepExtension,
  groupRoutinesByCategory,
  type RecoveryCategory,
} from "@/lib/features/recovery";

describe("sleepNormalised", () => {
  it("floors at or below the floor hours", () => {
    expect(sleepNormalised(5)).toBe(0);
    expect(sleepNormalised(3)).toBe(0);
  });
  it("is full at or above the ceiling hours", () => {
    expect(sleepNormalised(9)).toBe(1);
    expect(sleepNormalised(12)).toBe(1);
  });
  it("interpolates linearly between floor and ceiling", () => {
    // (8 - 5) / (9 - 5) = 0.75
    expect(sleepNormalised(8)).toBeCloseTo(0.75, 5);
  });
});

describe("sorenessNormalised", () => {
  it("rewards no soreness and penalizes high soreness (inverted)", () => {
    expect(sorenessNormalised(1)).toBe(1);
    expect(sorenessNormalised(5)).toBe(0);
    expect(sorenessNormalised(3)).toBeCloseTo(0.5, 5);
  });
});

describe("energyNormalised", () => {
  it("maps the 1..5 scale to 0..1", () => {
    expect(energyNormalised(1)).toBe(0);
    expect(energyNormalised(5)).toBe(1);
    expect(energyNormalised(3)).toBeCloseTo(0.5, 5);
  });
});

describe("computeReadinessScore", () => {
  it("is 100 for perfect inputs", () => {
    expect(computeReadinessScore(9, 1, 5)).toBe(100);
  });
  it("is 0 for worst inputs", () => {
    expect(computeReadinessScore(5, 5, 1)).toBe(0);
  });
  it("matches the worked example (8h / soreness 3 / energy 3 → 61)", () => {
    // 0.75*0.45 + 0.5*0.30 + 0.5*0.25 = 0.6125 → 61
    expect(computeReadinessScore(8, 3, 3)).toBe(61);
  });
  it("clamps to [0, 100]", () => {
    const s = computeReadinessScore(24, 1, 5);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });
});

describe("readinessLabel", () => {
  it("bands the score into Ready / Moderate / Low", () => {
    expect(readinessLabel(85)).toEqual({ label: "Ready", color: "good" });
    expect(readinessLabel(80)).toEqual({ label: "Ready", color: "good" });
    expect(readinessLabel(70)).toEqual({ label: "Moderate", color: "warn" });
    expect(readinessLabel(60)).toEqual({ label: "Moderate", color: "warn" });
    expect(readinessLabel(45)).toEqual({ label: "Low", color: "bad" });
    expect(readinessLabel(0)).toEqual({ label: "Low", color: "bad" });
  });
});

describe("selectRoutineCategory", () => {
  it("prefers mobility on a deload week", () => {
    expect(selectRoutineCategory(true, false)).toBe("mobility");
    expect(selectRoutineCategory(true, true)).toBe("mobility");
  });
  it("uses foam rolling on a training day", () => {
    expect(selectRoutineCategory(false, true)).toBe("foam_rolling");
  });
  it("uses active recovery on an off day", () => {
    expect(selectRoutineCategory(false, false)).toBe("active_recovery");
  });
});

describe("shouldSuggestSleepExtension", () => {
  it("nudges below the 8h target", () => {
    expect(shouldSuggestSleepExtension(7)).toBe(true);
    expect(shouldSuggestSleepExtension(6)).toBe(true);
  });
  it("does not nudge at or above target", () => {
    expect(shouldSuggestSleepExtension(8)).toBe(false);
    expect(shouldSuggestSleepExtension(9)).toBe(false);
  });
});

describe("groupRoutinesByCategory", () => {
  const r = (id: number, category: RecoveryCategory) => ({ id, category });
  const sample = [
    r(1, "mobility"),
    r(2, "active_recovery"),
    r(3, "foam_rolling"),
    r(4, "active_recovery"),
  ];

  it("groups by category and drops empty categories", () => {
    const groups = groupRoutinesByCategory([r(1, "mobility"), r(2, "mobility")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBe("mobility");
    expect(groups[0].routines.map((x) => x.id)).toEqual([1, 2]);
  });

  it("uses the stable default order when nothing is suggested", () => {
    const groups = groupRoutinesByCategory(sample);
    expect(groups.map((g) => g.category)).toEqual(["active_recovery", "foam_rolling", "mobility"]);
  });

  it("floats the suggested category to the front", () => {
    const groups = groupRoutinesByCategory(sample, "mobility");
    expect(groups.map((g) => g.category)).toEqual(["mobility", "active_recovery", "foam_rolling"]);
  });

  it("keeps every routine across the groups", () => {
    const groups = groupRoutinesByCategory(sample, "foam_rolling");
    const total = groups.reduce((n, g) => n + g.routines.length, 0);
    expect(total).toBe(sample.length);
  });
});
