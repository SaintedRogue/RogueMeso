import { describe, it, expect } from "vitest";
import {
  volumeLoad,
  isoWeek,
  weeklyVolumeLoad,
  movementPatternBalance,
  pushPullRatio,
  acwr,
  acwrByPattern,
  symmetryIndex,
  symmetryByExercise,
  recoveryVsLoad,
  symptomFlags,
  loadProgression,
  jointLoad,
  type PtSet,
} from "@/lib/features/physicalTherapy";
import type { Joint } from "@/lib/features/physicalTherapyTaxonomy";

// Compact PtSet builder with sensible defaults; override only what a test cares about.
function set(p: Partial<PtSet> & { date: Date }): PtSet {
  return {
    exercise: "Bench Press",
    pattern: "horizontal-push",
    joints: ["shoulder", "elbow"] as Joint[],
    side: null,
    weightKg: 100,
    reps: 5,
    ...p,
  };
}
const d = (iso: string) => new Date(iso);
const daysBefore = (ref: Date, n: number) => new Date(ref.getTime() - n * 24 * 60 * 60 * 1000);

describe("volumeLoad", () => {
  it("is load × reps", () => {
    expect(volumeLoad(100, 5)).toBe(500);
    expect(volumeLoad(0, 5)).toBe(0);
  });
});

describe("isoWeek", () => {
  it("formats as YYYY-Www and puts Jan 4 in week 01", () => {
    expect(isoWeek(d("2026-01-04T00:00:00Z"))).toBe("2026-W01");
    expect(isoWeek(d("2026-06-30T00:00:00Z"))).toMatch(/^\d{4}-W\d{2}$/);
  });
  it("groups a Mon–Sun span into one week and rolls to the next on Monday", () => {
    const mon = d("2026-06-29T00:00:00Z"); // Monday
    const sun = d("2026-07-05T12:00:00Z"); // Sunday same ISO week
    const nextMon = d("2026-07-06T00:00:00Z");
    expect(isoWeek(mon)).toBe(isoWeek(sun));
    expect(isoWeek(mon)).not.toBe(isoWeek(nextMon));
  });
});

describe("weeklyVolumeLoad", () => {
  it("sums volume load per ISO week, ascending, omitting empty weeks", () => {
    const rows = weeklyVolumeLoad([
      set({ date: d("2026-06-29T00:00:00Z"), weightKg: 100, reps: 5 }), // 500
      set({ date: d("2026-07-01T00:00:00Z"), weightKg: 100, reps: 5 }), // 500 same week
      set({ date: d("2026-07-06T00:00:00Z"), weightKg: 50, reps: 10 }), // 500 next week
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].volume).toBe(1000);
    expect(rows[1].volume).toBe(500);
    expect(rows[0].week < rows[1].week).toBe(true);
  });
  it("returns [] for no sets", () => {
    expect(weeklyVolumeLoad([])).toEqual([]);
  });
});

describe("movementPatternBalance", () => {
  it("aggregates sets + volume per pattern and buckets null as Unclassified", () => {
    const res = movementPatternBalance([
      set({ date: d("2026-06-01"), pattern: "horizontal-push", weightKg: 100, reps: 5 }), // 500
      set({ date: d("2026-06-01"), pattern: "horizontal-push", weightKg: 100, reps: 5 }), // 500
      set({ date: d("2026-06-01"), pattern: "squat", weightKg: 200, reps: 5 }), // 1000
      set({ date: d("2026-06-01"), pattern: null, weightKg: 10, reps: 10 }), // 100
    ]);
    const push = res.find((r) => r.pattern === "horizontal-push")!;
    expect(push.sets).toBe(2);
    expect(push.volume).toBe(1000);
    expect(res.find((r) => r.pattern === "unclassified")!.label).toBe("Unclassified");
    // sorted by volume desc: squat (1000) or push (1000) first, unclassified (100) last
    expect(res[res.length - 1].pattern).toBe("unclassified");
  });
  it("handles no sets", () => {
    expect(movementPatternBalance([])).toEqual([]);
  });
});

describe("pushPullRatio", () => {
  const p = (pattern: string) => set({ date: d("2026-06-01"), pattern, weightKg: 100, reps: 5 });
  it("computes a balanced overall ratio and flags nothing in-band", () => {
    const { overall } = pushPullRatio([
      p("horizontal-push"),
      p("vertical-push"),
      p("horizontal-pull"),
      p("vertical-pull"),
    ]);
    expect(overall.ratioBySets).toBe(1);
    expect(overall.ready).toBe(true);
    expect(overall.flag).toBe(false);
  });
  it("flags an out-of-band ratio (too much push)", () => {
    const { overall } = pushPullRatio([p("horizontal-push"), p("horizontal-push"), p("horizontal-pull")]);
    expect(overall.ratioBySets).toBe(2); // > 1.3
    expect(overall.flag).toBe(true);
  });
  it("flags a one-sided ratio (push with no pull) and reports null", () => {
    const { overall } = pushPullRatio([p("horizontal-push"), p("vertical-push")]);
    expect(overall.ratioBySets).toBeNull();
    expect(overall.ready).toBe(false);
    expect(overall.flag).toBe(true);
  });
  it("does not flag when there is no push/pull work at all", () => {
    const { overall } = pushPullRatio([p("squat"), p("hinge")]);
    expect(overall.flag).toBe(false);
    expect(overall.ratioBySets).toBeNull();
  });
  it("computes the horizontal-only sub-ratio independently", () => {
    const { horizontal } = pushPullRatio([
      p("horizontal-push"),
      p("horizontal-pull"),
      p("vertical-push"), // ignored by horizontal
      p("vertical-push"),
    ]);
    expect(horizontal.pushSets).toBe(1);
    expect(horizontal.pullSets).toBe(1);
    expect(horizontal.ratioBySets).toBe(1);
    expect(horizontal.flag).toBe(false);
  });
});

describe("acwr", () => {
  const asOf = d("2026-06-30T00:00:00Z");
  it("returns need-more-data (ready=false) with too little history", () => {
    const res = acwr([set({ date: daysBefore(asOf, 3), weightKg: 100, reps: 10 })], asOf);
    expect(res.ready).toBe(false);
  });
  it("computes acute/chronic and an in-band ratio with enough history", () => {
    const res = acwr(
      [
        set({ date: daysBefore(asOf, 1), weightKg: 100, reps: 10 }), // 1000 acute+chronic
        set({ date: daysBefore(asOf, 10), weightKg: 100, reps: 10 }), // chronic
        set({ date: daysBefore(asOf, 20), weightKg: 100, reps: 10 }), // chronic
        set({ date: daysBefore(asOf, 22), weightKg: 100, reps: 10 }), // chronic, extends history ≥21d
      ],
      asOf,
    );
    expect(res.acute).toBe(1000);
    expect(res.chronic).toBe(1000); // 4000 / 4
    expect(res.ratio).toBe(1);
    expect(res.ready).toBe(true);
    expect(res.inBand).toBe(true);
    expect(res.spike).toBe(false);
  });
  it("flags a spike when acute far exceeds chronic", () => {
    const res = acwr(
      [
        set({ date: daysBefore(asOf, 1), weightKg: 100, reps: 10 }),
        set({ date: daysBefore(asOf, 1), weightKg: 100, reps: 10 }),
        set({ date: daysBefore(asOf, 2), weightKg: 100, reps: 10 }),
        set({ date: daysBefore(asOf, 3), weightKg: 100, reps: 10 }), // acute = 4000
        set({ date: daysBefore(asOf, 25), weightKg: 40, reps: 10 }), // 400 chronic-only, history ≥21d
      ],
      asOf,
    );
    // chronic28 = 4000 + 400 = 4400 → chronic 1100; ratio ≈ 3.64
    expect(res.ratio! > 1.5).toBe(true);
    expect(res.spike).toBe(true);
    expect(res.ready).toBe(true);
  });
  it("returns ratio=null when the chronic window is empty (divide-by-zero guard)", () => {
    const res = acwr([set({ date: daysBefore(asOf, 40), weightKg: 100, reps: 10 })], asOf);
    expect(res.chronic).toBe(0);
    expect(res.ratio).toBeNull();
    expect(res.inBand).toBe(false);
    expect(res.spike).toBe(false);
  });
  it("handles no data", () => {
    const res = acwr([], asOf);
    expect(res.acute).toBe(0);
    expect(res.ratio).toBeNull();
    expect(res.ready).toBe(false);
  });
});

describe("acwrByPattern", () => {
  it("computes ACWR per non-null pattern", () => {
    const asOf = d("2026-06-30T00:00:00Z");
    const rows = acwrByPattern(
      [
        set({ date: daysBefore(asOf, 1), pattern: "squat", weightKg: 100, reps: 5 }),
        set({ date: daysBefore(asOf, 1), pattern: "hinge", weightKg: 100, reps: 5 }),
        set({ date: daysBefore(asOf, 1), pattern: null, weightKg: 100, reps: 5 }), // excluded
      ],
      asOf,
    );
    expect(rows.map((r) => r.pattern).sort()).toEqual(["hinge", "squat"]);
  });
});

describe("symmetryIndex", () => {
  it("computes (strong − weak) / strong × 100 and flags beyond threshold", () => {
    const r = symmetryIndex(100, 80);
    expect(r.index).toBe(20);
    expect(r.strong).toBe("left");
    expect(r.flag).toBe(true);
  });
  it("does not flag a small asymmetry, and treats 15% as the inclusive boundary (not flagged)", () => {
    expect(symmetryIndex(100, 90).flag).toBe(false); // 10%
    expect(symmetryIndex(100, 85).index).toBe(15);
    expect(symmetryIndex(100, 85).flag).toBe(false); // strictly > 15 flags
  });
  it("returns null index when a side is missing (one-sided data)", () => {
    const r = symmetryIndex(100, null);
    expect(r.index).toBeNull();
    expect(r.flag).toBe(false);
  });
  it("guards divide-by-zero (non-positive load)", () => {
    expect(symmetryIndex(0, 0).index).toBeNull();
    expect(symmetryIndex(100, 0).index).toBeNull();
  });
  it("identifies the stronger side when it is the right", () => {
    const r = symmetryIndex(80, 100);
    expect(r.strong).toBe("right");
    expect(r.index).toBe(20);
  });
});

describe("symmetryByExercise", () => {
  it("uses each side's heaviest set and ignores bilateral sets", () => {
    const rows = symmetryByExercise([
      set({ date: d("2026-06-01"), exercise: "Split Squat", side: "left", weightKg: 40 }),
      set({ date: d("2026-06-01"), exercise: "Split Squat", side: "left", weightKg: 50 }), // heaviest left
      set({ date: d("2026-06-01"), exercise: "Split Squat", side: "right", weightKg: 45 }),
      set({ date: d("2026-06-01"), exercise: "Split Squat", side: "bilateral", weightKg: 999 }), // ignored
    ]);
    const r = rows.find((x) => x.exercise === "Split Squat")!.result;
    expect(r.left).toBe(50);
    expect(r.right).toBe(45);
    expect(r.index).toBe(10);
  });
  it("returns null index for one-sided-only exercises", () => {
    const rows = symmetryByExercise([
      set({ date: d("2026-06-01"), exercise: "Single-Leg Calf", side: "left", weightKg: 40 }),
    ]);
    expect(rows[0].result.index).toBeNull();
  });
});

describe("recoveryVsLoad", () => {
  it("flags load rising while readiness falls over the window", () => {
    const res = recoveryVsLoad([
      { week: "2026-W20", volume: 100, readiness: 80 },
      { week: "2026-W21", volume: 120, readiness: 70 },
      { week: "2026-W22", volume: 140, readiness: 60 },
    ]);
    expect(res.ready).toBe(true);
    expect(res.flag).toBe(true);
    expect(res.volumeChange).toBe(40);
    expect(res.readinessChange).toBe(-20);
  });
  it("does not flag when readiness is not falling", () => {
    const res = recoveryVsLoad([
      { week: "2026-W21", volume: 100, readiness: 60 },
      { week: "2026-W22", volume: 140, readiness: 70 },
    ]);
    expect(res.flag).toBe(false);
  });
  it("needs at least two readiness weeks", () => {
    const res = recoveryVsLoad([
      { week: "2026-W21", volume: 100, readiness: null },
      { week: "2026-W22", volume: 140, readiness: 70 },
    ]);
    expect(res.ready).toBe(false);
    expect(res.flag).toBe(false);
  });
});

describe("symptomFlags", () => {
  const asOf = d("2026-06-30T00:00:00Z");
  it("flags a region recurring across ≥ minSessions distinct sessions", () => {
    const flags = symptomFlags(
      [
        { date: daysBefore(asOf, 1), region: "knee", score: 3, exercise: "Squat" },
        { date: daysBefore(asOf, 8), region: "knee", score: 3, exercise: "Squat" },
        { date: daysBefore(asOf, 15), region: "knee", score: 3, exercise: "Lunge" },
      ],
      asOf,
      { minSessions: 3 },
    );
    expect(flags.some((f) => f.region === "knee" && f.kind === "recurring")).toBe(true);
  });
  it("flags a rising pain-score trend for a region", () => {
    const flags = symptomFlags(
      [
        { date: daysBefore(asOf, 10), region: "shoulder", score: 3, exercise: "Bench" },
        { date: daysBefore(asOf, 2), region: "shoulder", score: 6, exercise: "Bench" },
      ],
      asOf,
    );
    const rising = flags.find((f) => f.region === "shoulder" && f.kind === "rising")!;
    expect(rising.scoreChange).toBe(3);
  });
  it("excludes entries outside the rolling window", () => {
    const flags = symptomFlags(
      [
        { date: daysBefore(asOf, 100), region: "knee", score: 5, exercise: "Squat" },
        { date: daysBefore(asOf, 90), region: "knee", score: 5, exercise: "Squat" },
        { date: daysBefore(asOf, 80), region: "knee", score: 5, exercise: "Squat" },
      ],
      asOf,
      { minSessions: 3, windowDays: 28 },
    );
    expect(flags).toEqual([]);
  });
  it("does not flag a single data point", () => {
    const flags = symptomFlags([{ date: daysBefore(asOf, 1), region: "hip", score: 8, exercise: "Deadlift" }], asOf);
    expect(flags).toEqual([]);
  });
});

describe("loadProgression", () => {
  it("builds a weekly series per pattern", () => {
    const rows = loadProgression(
      [
        set({ date: d("2026-06-29T00:00:00Z"), pattern: "squat", weightKg: 100, reps: 5 }),
        set({ date: d("2026-07-06T00:00:00Z"), pattern: "squat", weightKg: 110, reps: 5 }),
      ],
      "pattern",
    );
    const squat = rows.find((r) => r.key === "squat")!;
    expect(squat.points).toHaveLength(2);
    expect(squat.points[0].volume).toBe(500);
    expect(squat.points[1].volume).toBe(550);
  });
});

describe("jointLoad", () => {
  it("attributes a set's volume to each primary joint it loads", () => {
    const rows = jointLoad([
      set({ date: d("2026-06-01"), joints: ["shoulder", "elbow"] as Joint[], weightKg: 100, reps: 5 }), // 500 each
      set({ date: d("2026-06-01"), joints: ["shoulder"] as Joint[], weightKg: 100, reps: 5 }), // 500 shoulder
    ]);
    const shoulder = rows.find((r) => r.joint === "shoulder")!;
    const elbow = rows.find((r) => r.joint === "elbow")!;
    expect(shoulder.volume).toBe(1000);
    expect(shoulder.sets).toBe(2);
    expect(elbow.volume).toBe(500);
    expect(rows[0].joint).toBe("shoulder"); // sorted by volume desc
  });
  it("handles sets with no joints", () => {
    expect(jointLoad([set({ date: d("2026-06-01"), joints: [] })])).toEqual([]);
  });
});
