import { describe, it, expect } from "vitest";
import {
  estimateRMR,
  estimateTrainingEnergyDaily,
  estimateNEAT,
  maintenanceEstimate,
  goalRateKgPerWeek,
  goalAdjustedTarget,
  macroTargets,
  plausibleEntries,
  amPmBreakdown,
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

import {
  ewma,
  weeklyRateKg,
  measuredMaintenance,
  adaptiveMaintenance,
  confidenceLabel,
  ageFromBirthDate,
} from "@/lib/features/bodyTuning";

describe("ewma", () => {
  it("smooths a series with the given alpha", () => {
    expect(ewma([80, 81, 79], 0.5)).toEqual([80, 80.5, 79.75]);
  });
});

describe("weeklyRateKg", () => {
  it("converts a smoothed span to kg/week", () => {
    expect(weeklyRateKg([80, 79.75], 14)).toBeCloseTo(-0.125, 3);
  });
  it("is zero without enough points", () => {
    expect(weeklyRateKg([80], 7)).toBe(0);
  });
});

describe("measuredMaintenance", () => {
  it("infers maintenance from the gap between target and observed rate", () => {
    // 2500 + (-0.4 - -0.2)*7700/7 = 2500 - 220
    expect(measuredMaintenance(2500, -0.4, -0.2)).toBe(2280);
  });
});

describe("adaptiveMaintenance", () => {
  it("returns the formula estimate before enough weeks", () => {
    expect(adaptiveMaintenance(2500, 2800, 2)).toBe(2500);
  });
  it("blends a damped fraction at the ramp start", () => {
    // confidence 1/6, blend 1/12, 2500 + (1/12)*300 = 2525
    expect(adaptiveMaintenance(2500, 2800, 3)).toBe(2525);
  });
  it("reaches full (damped) blend once ramped", () => {
    expect(adaptiveMaintenance(2500, 2800, 9)).toBe(2650);
  });
});

describe("confidenceLabel", () => {
  it("ramps formula -> personalizing -> personalized", () => {
    expect(confidenceLabel(2)).toBe("formula");
    expect(confidenceLabel(5)).toBe("personalizing");
    expect(confidenceLabel(9)).toBe("personalized");
  });
});

describe("ageFromBirthDate", () => {
  it("does not count an unreached birthday", () => {
    expect(ageFromBirthDate(new Date("1996-07-01"), new Date("2026-06-10"))).toBe(29);
  });
});

describe("plausibleEntries", () => {
  const d = (iso: string, weightKg: number) => ({ date: new Date(`${iso}T00:00:00Z`), weightKg });

  it("keeps real loss across multi-day gaps (allowance scales with elapsed days)", () => {
    // Regression: a ~7lb loss over a 16-day gap must NOT be discarded. Previously the flat
    // 2.5kg ceiling dropped every entry after the first, collapsing the trend to one point.
    const rows = [
      d("2026-06-10", 117.93),
      d("2026-06-26", 114.76),
      d("2026-06-28", 115.21),
      d("2026-06-29", 114.94),
      d("2026-06-30", 113.85),
    ];
    expect(plausibleEntries(rows).map((r) => r.weightKg)).toEqual([117.93, 114.76, 115.21, 114.94, 113.85]);
  });

  it("rejects a single implausible same-day-scale jump (data-entry typo)", () => {
    const rows = [d("2026-06-10", 115), d("2026-06-11", 200), d("2026-06-12", 116)];
    // 200 is +85kg in one day (way past 2.5kg/day); 116 is then compared to the last KEPT (115).
    expect(plausibleEntries(rows).map((r) => r.weightKg)).toEqual([115, 116]);
  });

  it("returns the input unchanged for zero or one entry", () => {
    expect(plausibleEntries([])).toEqual([]);
    expect(plausibleEntries([d("2026-06-10", 115)]).map((r) => r.weightKg)).toEqual([115]);
  });
});

describe("amPmBreakdown", () => {
  const e = (localMinutes: number | null, weightKg: number) => ({ localMinutes, weightKg });

  it("buckets by noon (before noon AM, noon and after PM) and averages each bucket", () => {
    const out = amPmBreakdown([
      e(7 * 60, 100), // 07:00 AM
      e(8 * 60, 102), // 08:00 AM
      e(20 * 60, 99), // 20:00 PM
    ]);
    expect(out.am.count).toBe(2);
    expect(out.am.avgKg).toBeCloseTo(101, 5);
    expect(out.pm.count).toBe(1);
    expect(out.pm.avgKg).toBeCloseTo(99, 5);
  });

  it("treats exactly noon (720) as PM and 719 as AM", () => {
    const out = amPmBreakdown([e(719, 80), e(720, 90)]);
    expect(out.am.count).toBe(1);
    expect(out.pm.count).toBe(1);
  });

  it("ignores entries with no captured time", () => {
    const out = amPmBreakdown([e(null, 80), e(null, 90), e(8 * 60, 100)]);
    expect(out.am.count).toBe(1);
    expect(out.pm.count).toBe(0);
    expect(out.pm.avgKg).toBeNull();
  });

  it("reports empty buckets as count 0 with a null average", () => {
    const out = amPmBreakdown([]);
    expect(out).toEqual({ am: { count: 0, avgKg: null }, pm: { count: 0, avgKg: null } });
  });
});
