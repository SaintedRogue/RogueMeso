import { describe, it, expect } from "vitest";
import {
  effectiveLoadKg,
  buildExportPayload,
  renderExportDocument,
  type RawExport,
} from "@/lib/export";

// A minimal one-meso fixture: imperial user, one logged set in lb, plus a weigh-in
// and a readiness entry. Enough to exercise denormalization, kg-normalization, and
// the empty-vs-populated branches without a database.
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
          exercises: [
            {
              position: 0,
              jointPain: null,
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
    {
      date: new Date("2026-06-01T00:00:00Z"),
      weightKg: 74.8,
      bodyFatPct: 0.22,
      localMinutes: 420,
      note: "morning",
    },
  ],
  readinessEntries: [
    { date: new Date("2026-06-01T00:00:00Z"), sleepHours: 7.5, soreness: 2, energy: 4, score: 78, note: null },
  ],
};

const NOW = new Date("2026-06-30T15:00:00Z");

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

describe("buildExportPayload", () => {
  it("denormalizes exercise + muscle names and normalizes weights to kg", () => {
    const out = buildExportPayload(baseRaw, NOW);
    const set = out.mesocycles[0].days[0].exercises[0].sets[0];
    expect(out.mesocycles[0].days[0].exercises[0].name).toBe("Bench Press");
    expect(out.mesocycles[0].days[0].exercises[0].muscle).toBe("Chest");
    // 100 lb → 45.359 kg
    expect(set.weightKg).toBeCloseTo(45.36, 2);
    expect(set.reps).toBe(8);
    expect(set.rir).toBe(2);
  });

  it("presents week/day as 1-based and normalizes session bodyweight to kg", () => {
    const day = buildExportPayload(baseRaw, NOW).mesocycles[0].days[0];
    expect(day.week).toBe(1);
    expect(day.day).toBe(1);
    // 165 lb → 74.84 kg
    expect(day.bodyweightKg).toBeCloseTo(74.84, 2);
  });

  it("carries profile + weigh-ins + readiness, and declares kg + export time", () => {
    const out = buildExportPayload(baseRaw, NOW);
    expect(out.units.weight).toBe("kg");
    expect(out.exportedAt).toBe(NOW.toISOString());
    expect(out.profile.sex).toBe("F");
    expect(out.profile.birthDate).toBe("1990-05-01");
    expect(out.weighIns[0]).toMatchObject({ date: "2026-06-01", weightKg: 74.8 });
    expect(out.readiness[0]).toMatchObject({ date: "2026-06-01", sleepHours: 7.5, score: 78 });
  });

  it("never leaks sensitive fields onto the profile", () => {
    const profile = buildExportPayload(baseRaw, NOW).profile as Record<string, unknown>;
    expect(profile.passwordHash).toBeUndefined();
    expect(profile.sessionVersion).toBeUndefined();
    expect(profile.email).toBe("ada@example.com"); // email is intentionally kept (identifies the export)
  });

  it("handles an account with no training/body/recovery data", () => {
    const empty: RawExport = { ...baseRaw, mesocycles: [], weightEntries: [], readinessEntries: [] };
    const out = buildExportPayload(empty, NOW);
    expect(out.mesocycles).toEqual([]);
    expect(out.weighIns).toEqual([]);
    expect(out.readiness).toEqual([]);
  });
});

describe("renderExportDocument", () => {
  it("contains a readable summary and a fenced JSON block that round-trips to the payload", () => {
    const payload = buildExportPayload(baseRaw, NOW);
    const doc = renderExportDocument(payload, "lb");
    // Readable summary references the meso by name.
    expect(doc).toContain("Push/Pull");
    // A fenced ```json block holds the lossless payload.
    const match = doc.match(/```json\n([\s\S]*?)\n```/);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]);
    expect(parsed).toEqual(payload);
  });
});
