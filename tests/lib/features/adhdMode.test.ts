import { describe, it, expect } from "vitest";
import {
  hhmmToMin,
  minToHhmm,
  isDue,
  dueIndices,
  isAwake,
  isQuietHours,
  wakingSpanMin,
  getDefaultParams,
  mergeParams,
  coerceParamValue,
  getLocalDateStr,
  getLocalMinuteOfDay,
  type ReminderContext,
} from "@/lib/features/adhdMode";
import { findHabit } from "@/lib/features/adhdModeRegistry";

describe("HHMM ↔ minutes", () => {
  it("converts HHMM to minutes since midnight", () => {
    expect(hhmmToMin(0)).toBe(0);
    expect(hhmmToMin(600)).toBe(360);
    expect(hhmmToMin(2230)).toBe(1350);
    expect(hhmmToMin(2359)).toBe(1439);
  });
  it("converts minutes back to HHMM and round-trips", () => {
    expect(minToHhmm(0)).toBe(0);
    expect(minToHhmm(360)).toBe(600);
    expect(minToHhmm(1350)).toBe(2230);
    for (const hhmm of [0, 600, 745, 1015, 1350, 2359]) {
      expect(minToHhmm(hhmmToMin(hhmm))).toBe(hhmm);
    }
  });
  it("wraps minutes across the day boundary", () => {
    expect(minToHhmm(1440)).toBe(0); // exactly midnight
    expect(minToHhmm(-30)).toBe(2330); // 30 min before midnight
    expect(minToHhmm(1470)).toBe(30); // 00:30 next day
  });
});

describe("isDue / dueIndices", () => {
  it("is due exactly at the fire minute", () => {
    expect(isDue(745, hhmmToMin(745), 5)).toBe(true);
  });
  it("is due within the catch-up window after the fire time", () => {
    expect(isDue(745, hhmmToMin(745) + 4, 5)).toBe(true);
    expect(isDue(745, hhmmToMin(745) + 6, 5)).toBe(false); // past the window
  });
  it("is not due before the fire time", () => {
    expect(isDue(745, hhmmToMin(745) - 1, 5)).toBe(false);
  });
  it("returns the indices of all due fire times", () => {
    const fires = [700, 1000, 1300];
    // At 10:02 only the 10:00 reminder is due; 07:00 is past the catch-up window (stale),
    // and 13:00 hasn't arrived yet.
    expect(dueIndices(fires, hhmmToMin(1000) + 2, 5)).toEqual([1]);
    expect(dueIndices(fires, hhmmToMin(659), 5)).toEqual([]);
    // Right at 07:00, the first reminder fires.
    expect(dueIndices(fires, hhmmToMin(700), 5)).toEqual([0]);
  });
});

describe("awake / quiet hours", () => {
  it("treats the [wake, bed) window as awake for a normal day", () => {
    expect(isAwake(hhmmToMin(600), 600, 2230)).toBe(true); // exactly wake
    expect(isAwake(hhmmToMin(1200), 600, 2230)).toBe(true);
    expect(isAwake(hhmmToMin(2230), 600, 2230)).toBe(false); // exactly bed = quiet
    expect(isAwake(hhmmToMin(300), 600, 2230)).toBe(false); // 03:00
    expect(isQuietHours(hhmmToMin(300), 600, 2230)).toBe(true);
  });
  it("handles a past-midnight bedtime by wrapping", () => {
    // wake 06:00, bed 00:30 → awake spans midnight
    expect(isAwake(hhmmToMin(2300), 600, 30)).toBe(true);
    expect(isAwake(hhmmToMin(15), 600, 30)).toBe(true); // 00:15 still awake
    expect(isAwake(hhmmToMin(45), 600, 30)).toBe(false); // 00:45 asleep
  });
});

describe("wakingSpanMin", () => {
  it("computes a same-day span", () => {
    expect(wakingSpanMin(600, 2230)).toBe(16 * 60 + 30);
  });
  it("computes a past-midnight span", () => {
    expect(wakingSpanMin(600, 30)).toBe(18 * 60 + 30);
  });
});

describe("param defaults / merge / coerce", () => {
  const habit = findHabit("hydration")!;
  it("derives defaults from the param defs", () => {
    expect(getDefaultParams(habit)).toEqual({ remindersPerDay: 6, mlPerReminder: 350 });
  });
  it("merges user overrides over defaults", () => {
    expect(mergeParams(habit, { remindersPerDay: 10 })).toEqual({ remindersPerDay: 10, mlPerReminder: 350 });
  });
  it("ignores null overrides", () => {
    expect(mergeParams(habit, null)).toEqual({ remindersPerDay: 6, mlPerReminder: 350 });
  });
  it("coerces raw values to the param's type", () => {
    expect(coerceParamValue(habit.params[0], "10")).toBe(10);
    const boolDef = { key: "x", label: "x", type: "boolean" as const, default: false };
    expect(coerceParamValue(boolDef, "on")).toBe(true);
    expect(coerceParamValue(boolDef, "false")).toBe(false);
  });
});

describe("timezone resolution", () => {
  // 2026-06-10T02:30:00Z → 2026-06-09 22:30 in New York (EDT, UTC-4).
  const utc = new Date("2026-06-10T02:30:00Z");
  it("resolves the local calendar date across a UTC midnight", () => {
    expect(getLocalDateStr(utc, "America/New_York")).toBe("2026-06-09");
    expect(getLocalDateStr(utc, "UTC")).toBe("2026-06-10");
  });
  it("resolves the local minute-of-day", () => {
    expect(getLocalMinuteOfDay(utc, "America/New_York")).toBe(22 * 60 + 30);
    expect(getLocalMinuteOfDay(utc, "UTC")).toBe(2 * 60 + 30);
  });
});

describe("registry: hydration fire times", () => {
  const ctx: ReminderContext = {
    schedule: { wakeHHMM: 600, bedtimeHHMM: 2200, workoutHHMM: null, mealsPerDay: 3 },
    params: { remindersPerDay: 4, mlPerReminder: 350 },
    macros: null,
    userName: null,
  };
  it("spreads N reminders centered across the waking window", () => {
    const fires = findHabit("hydration")!.computeFireTimes(ctx);
    // span 06:00→22:00 = 960 min, 4 slots → centers at 120, 360, 600, 840 min after wake
    expect(fires).toEqual([800, 1200, 1600, 2000]);
  });
  it("never schedules into quiet hours", () => {
    const fires = findHabit("hydration")!.computeFireTimes(ctx);
    for (const f of fires) expect(isQuietHours(hhmmToMin(f), 600, 2200)).toBe(false);
  });
});

describe("registry: caffeine fire times", () => {
  const habit = findHabit("caffeine")!;
  it("emits a pre-workout dose AND a cutoff on a training day", () => {
    const ctx: ReminderContext = {
      schedule: { wakeHHMM: 600, bedtimeHHMM: 2230, workoutHHMM: 1700, mealsPerDay: 3 },
      params: { preWorkoutOffsetMin: 45, cutoffBeforeBedMin: 480 },
      macros: null,
      userName: null,
    };
    // pre = 17:00 − 45m = 16:15; cutoff = 22:30 − 8h = 14:30
    expect(habit.computeFireTimes(ctx)).toEqual([1615, 1430]);
  });
  it("emits only the cutoff on a rest day", () => {
    const ctx: ReminderContext = {
      schedule: { wakeHHMM: 600, bedtimeHHMM: 2230, workoutHHMM: null, mealsPerDay: 3 },
      params: { preWorkoutOffsetMin: 45, cutoffBeforeBedMin: 480 },
      macros: null,
      userName: null,
    };
    expect(habit.computeFireTimes(ctx)).toEqual([1430]);
  });
  it("labels the pre-workout vs cutoff payloads distinctly", () => {
    const ctx: ReminderContext = {
      schedule: { wakeHHMM: 600, bedtimeHHMM: 2230, workoutHHMM: 1700, mealsPerDay: 3 },
      params: { preWorkoutOffsetMin: 45, cutoffBeforeBedMin: 480 },
      macros: null,
      userName: null,
    };
    expect(habit.buildPayload(ctx, 0).tag).toBe("caffeine-pre");
    expect(habit.buildPayload(ctx, 1).tag).toBe("caffeine-cutoff");
  });
});

describe("registry: full catalog", () => {
  const trainingDay: ReminderContext = {
    schedule: { wakeHHMM: 600, bedtimeHHMM: 2230, workoutHHMM: 1700, mealsPerDay: 3 },
    params: {},
    macros: { kcal: 2400, proteinG: 180, fatG: 70, carbG: 250 },
    userName: "Sam",
  };
  const restDay: ReminderContext = { ...trainingDay, schedule: { ...trainingDay.schedule, workoutHHMM: null } };

  it("workout fires leadMin before the session, only on training days", () => {
    const h = findHabit("workout")!;
    expect(h.computeFireTimes({ ...trainingDay, params: { leadMin: 10 } })).toEqual([1650]);
    expect(h.computeFireTimes(restDay)).toEqual([]);
  });

  it("pre-workout meal carb-skews from Body Tuning macros", () => {
    const h = findHabit("preWorkoutMeal")!;
    expect(h.computeFireTimes({ ...trainingDay, params: { minutesBefore: 180 } })).toEqual([1400]);
    const body = h.buildPayload({ ...trainingDay, params: { minutesBefore: 180 } }, 0).body;
    expect(body).toContain("75g carbs"); // 250 * 0.3
    expect(body).toContain("60g protein"); // 180 / 3 meals
  });

  it("meal timing spreads mealsPerDay reminders with per-meal protein", () => {
    const h = findHabit("mealTiming")!;
    const fires = h.computeFireTimes(trainingDay);
    expect(fires).toHaveLength(3);
    expect(h.buildPayload(trainingDay, 0).body).toContain("60g protein");
  });

  it("post-workout protein fires after the session", () => {
    const h = findHabit("postWorkoutProtein")!;
    expect(h.computeFireTimes({ ...trainingDay, params: { afterMin: 30 } })).toEqual([1730]);
  });

  it("creatine fires a fixed offset after wake every day", () => {
    const h = findHabit("creatine")!;
    expect(h.computeFireTimes({ ...restDay, params: { minutesAfterWake: 60, doseG: 5 } })).toEqual([700]);
    expect(h.buildPayload({ ...restDay, params: { doseG: 5 } }, 0).body).toContain("5g");
  });

  it("sleep wind-down fires before bed", () => {
    const h = findHabit("sleep")!;
    expect(h.computeFireTimes({ ...trainingDay, params: { windDownMin: 30 } })).toEqual([2200]);
  });

  it("deload nudge only fires in the final programmed week", () => {
    const h = findHabit("deload")!;
    const finalWeek = { ...restDay, training: { currentWeek: 3, weeksCount: 4 } };
    const midBlock = { ...restDay, training: { currentWeek: 1, weeksCount: 4 } };
    expect(h.computeFireTimes(finalWeek)).toEqual([900]); // wake 600 + 180 = 09:00
    expect(h.computeFireTimes(midBlock)).toEqual([]);
    expect(h.computeFireTimes(restDay)).toEqual([]); // no training context → silent
  });

  it("off-by-default extras are flagged so the engine stays quiet until opted in", () => {
    for (const key of ["deload", "electrolytes", "magnesium", "morningSunlight", "adhdMedication", "weighIn"]) {
      expect(findHabit(key)!.defaultEnabled).toBe(false);
    }
    for (const key of ["workout", "caffeine", "hydration", "mealTiming", "creatine", "sleep"]) {
      expect(findHabit(key)!.defaultEnabled).toBe(true);
    }
  });

  it("payloads degrade gracefully when Body Tuning macros are missing", () => {
    const noMacros = { ...trainingDay, macros: null };
    expect(findHabit("mealTiming")!.buildPayload(noMacros, 0).body).not.toContain("protein g");
    expect(findHabit("preWorkoutMeal")!.buildPayload({ ...noMacros, params: { minutesBefore: 180 } }, 0).body).toContain("3h");
  });
});
