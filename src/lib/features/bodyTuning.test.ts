import { describe, it, expect } from "vitest";
import { estimateRMR, type Profile } from "@/lib/features/bodyTuning";

const male80: Profile = {
  weightKg: 80,
  heightCm: 180,
  age: 30,
  sex: "M",
  bodyFatPct: null,
  activityLevel: "sedentary",
};

describe("estimateRMR", () => {
  it("uses Ten-Haaf when no body fat is given", () => {
    // 11.936*80 + 587.728*1.8 - 8.129*30 + 191.027 + 29.279
    expect(estimateRMR(male80)).toBeCloseTo(1989.23, 1);
  });
  it("uses Tinsley FFM for a lean user with body fat", () => {
    // FFM = 80*(1-0.12)=70.4; 25.9*70.4 + 284
    expect(estimateRMR({ ...male80, bodyFatPct: 0.12 })).toBeCloseTo(2107.36, 2);
  });
  it("falls back to Ten-Haaf when body fat is above the lean threshold", () => {
    expect(estimateRMR({ ...male80, bodyFatPct: 0.2 })).toBeCloseTo(1989.23, 1);
  });
});
