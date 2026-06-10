import { describe, it, expect } from "vitest";
import {
  estimateRMR,
  estimateTrainingEnergyDaily,
  estimateNEAT,
  maintenanceEstimate,
  goalRateKgPerWeek,
  goalAdjustedTarget,
  macroTargets,
  type Profile,
} from "@/lib/features/bodyTuning";

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

describe("estimateTrainingEnergyDaily", () => {
  it("converts weekly sets to a daily training-energy average", () => {
    // 60 sets * 3 min = 180 min = 3 h; (5-1)*80*3 = 960 kcal/week; /7
    expect(estimateTrainingEnergyDaily(60, 80)).toBeCloseTo(137.14, 2);
  });
  it("is zero with no logged sets", () => {
    expect(estimateTrainingEnergyDaily(0, 80)).toBe(0);
  });
});

describe("estimateNEAT", () => {
  it("returns the increment above RMR for the activity level", () => {
    expect(estimateNEAT(2000, "sedentary")).toBeCloseTo(400, 5);
    expect(estimateNEAT(2000, "moderate")).toBeCloseTo(1000, 5);
  });
});

describe("maintenanceEstimate", () => {
  it("sums RMR + NEAT + daily training energy", () => {
    // RMR 1989.226 + NEAT 397.845 + training 137.143
    expect(maintenanceEstimate(male80, 60)).toBeCloseTo(2524.21, 1);
  });
});

describe("goalRateKgPerWeek", () => {
  it("derives signed kg/week from goal and bodyweight", () => {
    expect(goalRateKgPerWeek("cut", 80)).toBeCloseTo(-0.4, 5);
    expect(goalRateKgPerWeek("bulk", 80)).toBeCloseTo(0.24, 5);
    expect(goalRateKgPerWeek("maintain", 80)).toBe(0);
  });
  it("honors a signed override", () => {
    expect(goalRateKgPerWeek("cut", 80, -0.0075)).toBeCloseTo(-0.6, 5);
  });
});

describe("goalAdjustedTarget", () => {
  it("applies a deficit for a cut", () => {
    // 2524.21 - (0.4*7700/7=440) = 2084
    expect(goalAdjustedTarget(2524.21, "cut", male80)).toBe(2084);
  });
  it("applies a surplus for a bulk", () => {
    // 2524.21 + (0.24*5500/7=188.57) = 2712.78 -> 2713
    expect(goalAdjustedTarget(2524.21, "bulk", male80)).toBe(2713);
  });
  it("never prescribes below the resting-metabolism floor", () => {
    // huge override deficit clamps to round(RMR*1.0)=1989
    expect(goalAdjustedTarget(2524.21, "cut", male80, -0.05)).toBe(1989);
  });
});

describe("macroTargets", () => {
  it("sets protein first, a fat floor, carbs as remainder", () => {
    // protein 2.6*80=208g (832 kcal); fat max(0.8*80*9=576, 0.2*2084=416.8)=576 (64g); carbs 676/4=169
    expect(macroTargets(2084, male80, "cut")).toEqual({
      kcal: 2084,
      proteinG: 208,
      fatG: 64,
      carbG: 169,
    });
  });
});
