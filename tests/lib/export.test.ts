import { describe, it, expect } from "vitest";
import {
  effectiveLoadKg,
  buildExportPayload,
  renderMarkdown,
  ALL_DOMAINS,
  type RawExport,
} from "@/lib/export";

// Two weigh-ins / readiness check-ins straddling a date boundary, and one finished training
// day — enough to exercise denormalization, kg-normalization, domain selection and the
// date filter without a database.
const baseRaw: RawExport = {
  user: {
    name: "Ada",
    email: "ada@example.com",
    unit: "lb",
    heightCm: 180,
    birthDate: new Date("1990-05-01T00:00:00Z"),
    bodySex: "F",
    activityLevel: "moderate",
    goalWeightKg: 70,
    createdAt: new Date("2026-01-01T12:00:00Z"),
  },
  mesocycles: [
    {
      name: "Push/Pull",
      status: "current",
      unit: "lb",
      daysPerWeek: 2,
      weeksCount: 4,
      nutritionGoal: "cut",
      goalWeightKg: 72,
      startedAt: new Date("2026-06-01T00:00:00Z"),
      finishedAt: null,
      days: [
        {
          week: 0,
          position: 0,
          label: "Upper",
          status: "complete",
          bodyweight: 165,
          bodyweightUnit: "lb",
          notes: "felt strong",
          finishedAt: new Date("2026-06-01T18:00:00Z"),
          exercises: [
            {
              position: 0,
              jointPain: null,
              painScore: null,
              painLocations: null,
              painTiming: null,
              rangeOfMotion: null,
              qualityTags: null,
              ptNote: null,
              status: "complete",
              exercise: { name: "Bench Press", exerciseType: "barbell" },
              muscleGroup: { name: "Chest" },
              sets: [
                {
                  position: 0,
                  weight: 100, // lb
                  weightTarget: 100,
                  weightTargetMin: null,
                  weightTargetMax: null,
                  reps: 8,
                  repsTarget: 8,
                  rir: 2,
                  bodyweight: null,
                  unit: "lb",
                  side: null,
                  setType: "regular",
                  status: "complete",
                  finishedAt: new Date("2026-06-01T18:00:00Z"),
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  weightEntries: [
    { date: new Date("2026-05-01T00:00:00Z"), weightKg: 75.2, bodyFatPct: null, localMinutes: 420, note: null },
    { date: new Date("2026-06-01T00:00:00Z"), weightKg: 74.8, bodyFatPct: 0.22, localMinutes: 420, note: "morning" },
  ],
  readinessEntries: [
    { date: new Date("2026-05-01T00:00:00Z"), sleepHours: 6, soreness: 3, energy: 3, score: 60, note: null },
    { date: new Date("2026-06-01T00:00:00Z"), sleepHours: 7.5, soreness: 2, energy: 4, score: 78, note: null },
  ],
};

const NOW = new Date("2026-06-30T15:00:00Z");
const opts = (over: Partial<{ domains: typeof ALL_DOMAINS; from: Date | null }> = {}) => ({
  domains: ALL_DOMAINS,
  from: null,
  ...over,
});

describe("effectiveLoadKg", () => {
  it("uses the bar weight for a standard weighted set", () => {
    expect(effectiveLoadKg({ weightKg: 100, bodyweightKg: null }, "barbell")).toBe(100);
  });
  it("uses bodyweight for a bodyweight-only exercise", () => {
    expect(effectiveLoadKg({ weightKg: null, bodyweightKg: 80 }, "bodyweightOnly")).toBe(80);
  });
  it("adds bodyweight and added load for a bodyweight-loadable exercise", () => {
    expect(effectiveLoadKg({ weightKg: 20, bodyweightKg: 80 }, "bodyweightLoadable")).toBe(100);
  });
  it("returns null when a weighted set has no logged weight", () => {
    expect(effectiveLoadKg({ weightKg: null, bodyweightKg: null }, "machine")).toBeNull();
  });
  it("falls back to added load alone when a loadable set has no bodyweight captured", () => {
    expect(effectiveLoadKg({ weightKg: 20, bodyweightKg: null }, "bodyweightLoadable")).toBe(20);
  });
  it("reports no number for a bodyweight-only set with no bodyweight captured", () => {
    expect(effectiveLoadKg({ weightKg: null, bodyweightKg: null }, "bodyweightOnly")).toBeNull();
  });
});

describe("buildExportPayload — shaping", () => {
  it("denormalizes exercise + muscle names and normalizes weights to kg", () => {
    const out = buildExportPayload(baseRaw, NOW, opts());
    const set = out.mesocycles![0].days[0].exercises[0].sets[0];
    expect(out.mesocycles![0].days[0].exercises[0].name).toBe("Bench Press");
    expect(out.mesocycles![0].days[0].exercises[0].muscle).toBe("Chest");
    expect(set.weightKg).toBeCloseTo(45.36, 2); // 100 lb → 45.36 kg
    expect(set.reps).toBe(8);
    expect(set.rir).toBe(2);
  });

  it("presents week/day as 1-based and normalizes session bodyweight to kg", () => {
    const day = buildExportPayload(baseRaw, NOW, opts()).mesocycles![0].days[0];
    expect(day.week).toBe(1);
    expect(day.day).toBe(1);
    expect(day.bodyweightKg).toBeCloseTo(74.84, 2); // 165 lb → 74.84 kg
  });

  it("carries profile + weigh-ins + readiness, and declares kg + export time", () => {
    const out = buildExportPayload(baseRaw, NOW, opts());
    expect(out.units.weight).toBe("kg");
    expect(out.exportedAt).toBe(NOW.toISOString());
    expect(out.profile.sex).toBe("F");
    expect(out.profile.birthDate).toBe("1990-05-01");
    expect(out.weighIns![1]).toMatchObject({ date: "2026-06-01", weightKg: 74.8 });
    expect(out.readiness![1]).toMatchObject({ date: "2026-06-01", sleepHours: 7.5, score: 78 });
  });

  it("never leaks sensitive fields onto the profile", () => {
    const profile = buildExportPayload(baseRaw, NOW, opts()).profile as Record<string, unknown>;
    expect(profile.passwordHash).toBeUndefined();
    expect(profile.sessionVersion).toBeUndefined();
    expect(profile.email).toBe("ada@example.com"); // email intentionally kept (identifies the export)
  });
});

describe("buildExportPayload — domain selection", () => {
  it("omits the training section entirely when training is deselected", () => {
    const out = buildExportPayload(baseRaw, NOW, opts({ domains: { training: false, body: true, recovery: true } }));
    expect(out.mesocycles).toBeUndefined();
    expect(out.weighIns).toBeDefined();
    expect(out.readiness).toBeDefined();
  });

  it("omits body and recovery when only training is selected", () => {
    const out = buildExportPayload(baseRaw, NOW, opts({ domains: { training: true, body: false, recovery: false } }));
    expect(out.mesocycles).toBeDefined();
    expect(out.weighIns).toBeUndefined();
    expect(out.readiness).toBeUndefined();
  });
});

describe("buildExportPayload — date filter", () => {
  it("keeps only records on/after `from`", () => {
    const out = buildExportPayload(baseRaw, NOW, opts({ from: new Date("2026-05-15T00:00:00Z") }));
    expect(out.filteredFrom).toBe("2026-05-15");
    expect(out.weighIns!.map((w) => w.date)).toEqual(["2026-06-01"]);
    expect(out.readiness!.map((r) => r.date)).toEqual(["2026-06-01"]);
    // The June session survives (finished after `from`).
    expect(out.mesocycles![0].days).toHaveLength(1);
  });

  it("drops mesocycles whose every session predates `from`", () => {
    const out = buildExportPayload(baseRaw, NOW, opts({ from: new Date("2026-07-01T00:00:00Z") }));
    expect(out.mesocycles).toEqual([]);
    expect(out.weighIns).toEqual([]);
    expect(out.readiness).toEqual([]);
  });
});

describe("renderMarkdown", () => {
  it("is a clean summary with no embedded JSON block", () => {
    const md = renderMarkdown(buildExportPayload(baseRaw, NOW, opts()), "lb");
    expect(md).toContain("Push/Pull");
    expect(md).toContain("Weigh-ins");
    expect(md).not.toContain("```json");
  });

  it("only renders sections that are present in the payload", () => {
    const payload = buildExportPayload(baseRaw, NOW, opts({ domains: { training: true, body: false, recovery: false } }));
    const md = renderMarkdown(payload, "lb");
    expect(md).toContain("Training");
    expect(md).not.toContain("Weigh-ins");
    expect(md).not.toContain("readiness");
  });
});

describe("buildExportPayload — Physical Therapy Lens fields", () => {
  // A raw variant whose one exercise carries symptom/quality capture and a per-set side.
  const withPt: RawExport = {
    ...baseRaw,
    mesocycles: [
      {
        ...baseRaw.mesocycles[0],
        days: [
          {
            ...baseRaw.mesocycles[0].days[0],
            exercises: [
              {
                ...baseRaw.mesocycles[0].days[0].exercises[0],
                painScore: 4,
                painLocations: '["shoulder"]',
                painTiming: "after",
                rangeOfMotion: "partial",
                qualityTags: '["grinder","cut-rom"]',
                ptNote: "elbow cranky on close grip",
                sets: [{ ...baseRaw.mesocycles[0].days[0].exercises[0].sets[0], side: "left" }],
              },
            ],
          },
        ],
      },
    ],
  };

  it("carries side onto the exported set and symptom fields onto the exercise (training domain)", () => {
    const ex = buildExportPayload(withPt, NOW, opts()).mesocycles![0].days[0].exercises[0];
    expect(ex.sets[0].side).toBe("left");
    expect(ex.painScore).toBe(4);
    expect(ex.painLocations).toEqual(["shoulder"]);
    expect(ex.painTiming).toBe("after");
    expect(ex.rangeOfMotion).toBe("partial");
    expect(ex.qualityTags).toEqual(["grinder", "cut-rom"]);
    expect(ex.ptNote).toBe("elbow cranky on close grip");
  });

  it("tolerates missing/legacy capture (nulls → empty arrays, null side)", () => {
    const ex = buildExportPayload(baseRaw, NOW, opts()).mesocycles![0].days[0].exercises[0];
    expect(ex.painScore).toBeNull();
    expect(ex.painLocations).toEqual([]);
    expect(ex.qualityTags).toEqual([]);
    expect(ex.sets[0].side).toBeNull();
  });

  it("gates symptom data behind the training domain (omitted when training is deselected)", () => {
    const out = buildExportPayload(withPt, NOW, opts({ domains: { training: false, body: true, recovery: true } }));
    expect(out.mesocycles).toBeUndefined();
  });

  it("surfaces symptoms in the Markdown summary only when captured", () => {
    expect(renderMarkdown(buildExportPayload(withPt, NOW, opts()), "lb")).toContain("Symptoms & movement notes");
    expect(renderMarkdown(buildExportPayload(baseRaw, NOW, opts()), "lb")).not.toContain("Symptoms & movement notes");
  });
});
