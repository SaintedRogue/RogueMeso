import { describe, it, expect } from "vitest";
import { projectedWeight } from "@/components/DateWeightEstimator";

describe("projectedWeight", () => {
  it("extrapolates along the trend rate", () => {
    // 251 lb, losing 1.8/wk, 4 weeks out → 251 - 7.2 = 243.8
    expect(projectedWeight(251, -1.8, 4)).toBeCloseTo(243.8, 5);
  });

  it("returns the current weight at zero weeks", () => {
    expect(projectedWeight(251, -1.8, 0)).toBe(251);
  });

  it("projects flat when the trend is flat", () => {
    expect(projectedWeight(200, 0, 10)).toBe(200);
  });

  it("rounds to one decimal", () => {
    expect(projectedWeight(250, -1.111, 3)).toBe(246.7); // 250 - 3.333 = 246.667 → 246.7
  });
});
