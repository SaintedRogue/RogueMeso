// ADHD Mode habit registry — the declarative catalog that drives BOTH the scheduler and
// the settings UI. Adding a reminder = appending one HabitDefinition here; no scheduler
// or UI changes needed. Client-safe: pure compute/payload functions + data only (no
// Prisma, no web-push).
//
// Each param's `default`, `citation`, and `hint` ARE the science: the user can retune any
// value, but defaults reflect the cited evidence base (mirrors bodyTuning.ts). Core habits
// default ON; the "extras" (sunlight, electrolytes, magnesium, deload, ADHD-med, weigh-in)
// default OFF so the engine stays quiet until opted into.
import {
  Coffee,
  Droplets,
  Dumbbell,
  Utensils,
  UtensilsCrossed,
  Drumstick,
  Pill,
  Tablets,
  PersonStanding,
  Footprints,
  Repeat,
  Moon,
  Sunrise,
  Zap,
  BatteryLow,
  Brain,
  Scale,
} from "lucide-react";
import { hhmmToMin, minToHhmm, wakingSpanMin, type HabitDefinition, type ReminderContext } from "./adhdMode";

// --- small local helpers (pure) ---
const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
const wake = (c: ReminderContext) => hhmmToMin(c.schedule.wakeHHMM);
const bed = (c: ReminderContext) => hhmmToMin(c.schedule.bedtimeHHMM);
/** Fire at an absolute local minute, but only if it lands within the waking window. */
const within = (c: ReminderContext, minute: number): number[] =>
  minute >= wake(c) && minute <= bed(c) ? [minToHhmm(minute)] : [];
/** `n` reminder times spread evenly across the waking window, each centered in its slot
 *  (the `+0.5` offset keeps the first/last off the wake/bed boundaries). */
const evenlySpaced = (c: ReminderContext, n: number): string[] => {
  const span = wakingSpanMin(c.schedule.wakeHHMM, c.schedule.bedtimeHHMM);
  return Array.from({ length: n }, (_, i) => minToHhmm(wake(c) + (span * (i + 0.5)) / n));
};
/** Per-meal macro split from the daily Body Tuning totals. */
const perMeal = (c: ReminderContext) => {
  const n = Math.max(1, c.schedule.mealsPerDay);
  return c.macros
    ? { protein: Math.round(c.macros.proteinG / n), carb: Math.round(c.macros.carbG / n) }
    : null;
};

export const HABIT_REGISTRY: HabitDefinition[] = [
  // ================================================================ TRAINING
  {
    key: "workout",
    label: "Workout time",
    description: "A nudge to start your session at your scheduled time.",
    icon: Dumbbell,
    group: "training",
    defaultEnabled: true,
    params: [
      {
        key: "leadMin",
        label: "Heads-up before",
        type: "minutes",
        default: 10,
        min: 0,
        max: 60,
        step: 5,
        unit: "min",
        hint: "Lead time to wrap up and get to the gym/rack.",
      },
    ],
    computeFireTimes(ctx) {
      if (ctx.schedule.workoutHHMM == null) return [];
      return within(ctx, hhmmToMin(ctx.schedule.workoutHHMM) - num(ctx.params.leadMin, 10));
    },
    buildPayload(ctx) {
      const lead = num(ctx.params.leadMin, 10);
      return {
        title: "🏋️ Workout",
        body: lead > 0 ? `Training in ${lead} min — start getting ready.` : "Time to train.",
        tag: "workout",
        actions: [{ action: "done", title: "On it" }, { action: "snooze", title: "+15m" }],
      };
    },
  },

  {
    key: "caffeine",
    label: "Caffeine timing",
    description: "A pre-workout window, plus an afternoon cutoff to protect your sleep.",
    icon: Coffee,
    group: "training",
    defaultEnabled: true,
    params: [
      {
        key: "preWorkoutOffsetMin",
        label: "Before workout",
        type: "minutes",
        default: 45,
        min: 15,
        max: 90,
        step: 5,
        unit: "min",
        citation: "PMC3737459",
        hint: "Caffeine peaks in plasma ~45–60 min after intake (ISSN 2010). 3–6 mg/kg is the ergogenic range.",
      },
      {
        key: "cutoffBeforeBedMin",
        label: "Cutoff before bed",
        type: "minutes",
        default: 480,
        min: 240,
        max: 720,
        step: 30,
        unit: "min",
        citation: "PMC3805807",
        hint: "Caffeine 6 h before bed still cut total sleep by ~1 h (Drake 2013). 8 h is a safe buffer.",
      },
    ],
    computeFireTimes(ctx) {
      const fires: number[] = [];
      if (ctx.schedule.workoutHHMM != null) {
        const pre = hhmmToMin(ctx.schedule.workoutHHMM) - num(ctx.params.preWorkoutOffsetMin, 45);
        if (pre >= wake(ctx)) fires.push(minToHhmm(pre));
      }
      const cutoff = bed(ctx) - num(ctx.params.cutoffBeforeBedMin, 480);
      if (cutoff >= wake(ctx) && cutoff < bed(ctx)) fires.push(minToHhmm(cutoff));
      return fires;
    },
    buildPayload(ctx, i) {
      const isPre = ctx.schedule.workoutHHMM != null && i === 0;
      if (isPre) {
        const min = num(ctx.params.preWorkoutOffsetMin, 45);
        return {
          title: "☕ Caffeine window",
          body: `Time for pre-workout caffeine — ~${min} min before you train.`,
          tag: "caffeine-pre",
          actions: [{ action: "done", title: "Done" }, { action: "snooze", title: "+15m" }],
        };
      }
      return {
        title: "☕ Caffeine cutoff",
        body: "Last call for caffeine today — later intake will eat into your sleep.",
        tag: "caffeine-cutoff",
        actions: [{ action: "done", title: "Got it" }],
      };
    },
  },

  {
    key: "deload",
    label: "Deload nudge",
    description: "A heads-up when you reach the final week of a training block.",
    icon: BatteryLow,
    group: "training",
    defaultEnabled: false,
    params: [],
    computeFireTimes(ctx) {
      const t = ctx.training;
      if (!t || t.currentWeek == null || t.weeksCount == null) return [];
      // Only in the final programmed week. One nudge/day (the log dedups) late morning.
      if (t.currentWeek < t.weeksCount - 1) return [];
      return within(ctx, wake(ctx) + 180);
    },
    buildPayload() {
      return {
        title: "🔋 Deload check",
        body: "You're in the last week of your block — plan a deload or your next meso.",
        tag: "deload",
        actions: [{ action: "done", title: "Noted" }],
      };
    },
  },

  // =============================================================== NUTRITION
  {
    key: "preWorkoutMeal",
    label: "Pre-workout meal",
    description: "A carb + protein meal a few hours before training (amounts from Body Tuning).",
    icon: Utensils,
    group: "nutrition",
    defaultEnabled: true,
    params: [
      {
        key: "minutesBefore",
        label: "Before workout",
        type: "minutes",
        default: 180,
        min: 60,
        max: 300,
        step: 15,
        unit: "min",
        citation: "PMC5477153",
        hint: "ISSN 2017: a carb + protein meal 2–4 h pre-exercise optimizes fuel availability.",
      },
    ],
    computeFireTimes(ctx) {
      if (ctx.schedule.workoutHHMM == null) return [];
      const fire = hhmmToMin(ctx.schedule.workoutHHMM) - num(ctx.params.minutesBefore, 180);
      return fire >= wake(ctx) ? [minToHhmm(fire)] : [];
    },
    buildPayload(ctx) {
      const hours = Math.round(num(ctx.params.minutesBefore, 180) / 60);
      const pm = perMeal(ctx);
      // Pre-workout meal is carb-skewed: ~30% of the day's carbs here.
      const carbs = ctx.macros ? Math.round(ctx.macros.carbG * 0.3) : null;
      return {
        title: "🍽️ Pre-workout meal",
        body:
          pm && carbs != null
            ? `Fuel up: ~${carbs}g carbs + ${pm.protein}g protein, ~${hours}h before you lift.`
            : `Eat a carb + protein meal ~${hours}h before training.`,
        tag: "preworkout-meal",
        actions: [{ action: "done", title: "Eating" }, { action: "snooze", title: "+30m" }],
      };
    },
  },

  {
    key: "mealTiming",
    label: "Meal timing",
    description: "Evenly spaced meals across your day, with per-meal protein from Body Tuning.",
    icon: UtensilsCrossed,
    group: "nutrition",
    defaultEnabled: true,
    params: [],
    computeFireTimes(ctx) {
      return evenlySpaced(ctx, Math.max(1, ctx.schedule.mealsPerDay));
    },
    buildPayload(ctx, i) {
      const n = Math.max(1, ctx.schedule.mealsPerDay);
      const pm = perMeal(ctx);
      return {
        title: "🍴 Meal time",
        body: pm
          ? `Meal ${i + 1} of ${n}: aim ~${pm.protein}g protein${pm.carb ? `, ~${pm.carb}g carbs` : ""}.`
          : `Meal ${i + 1} of ${n} — get a solid protein source in.`,
        tag: `meal-${i}`,
        actions: [{ action: "done", title: "Eating" }, { action: "snooze", title: "+30m" }],
      };
    },
  },

  {
    key: "postWorkoutProtein",
    label: "Post-workout protein",
    description: "A protein nudge in the recovery window after you train.",
    icon: Drumstick,
    group: "nutrition",
    defaultEnabled: true,
    params: [
      {
        key: "afterMin",
        label: "After workout",
        type: "minutes",
        default: 30,
        min: 0,
        max: 120,
        step: 10,
        unit: "min",
        citation: "PMC5828430",
        hint: "Total daily protein matters most, but ~0.4 g/kg within a couple hours post helps (Morton 2018).",
      },
    ],
    computeFireTimes(ctx) {
      if (ctx.schedule.workoutHHMM == null) return [];
      return within(ctx, hhmmToMin(ctx.schedule.workoutHHMM) + num(ctx.params.afterMin, 30));
    },
    buildPayload(ctx) {
      const pm = perMeal(ctx);
      return {
        title: "🍗 Post-workout protein",
        body: pm ? `Get ~${pm.protein}g protein in within the hour.` : "Protein within an hour of training.",
        tag: "postworkout-protein",
        actions: [{ action: "done", title: "Done" }],
      };
    },
  },

  {
    key: "creatine",
    label: "Creatine",
    description: "A daily creatine reminder — consistency beats timing.",
    icon: Pill,
    group: "nutrition",
    defaultEnabled: true,
    params: [
      {
        key: "minutesAfterWake",
        label: "After wake",
        type: "minutes",
        default: 60,
        min: 0,
        max: 720,
        step: 15,
        unit: "min",
        hint: "Timing barely matters — pick a moment you'll never miss (Kreider 2017).",
      },
      {
        key: "doseG",
        label: "Daily dose",
        type: "integer",
        default: 5,
        min: 3,
        max: 10,
        step: 1,
        unit: "g",
        citation: "PMC5469049",
        hint: "3–5 g/day monohydrate maintains saturation (Kreider 2017).",
      },
    ],
    computeFireTimes(ctx) {
      return within(ctx, wake(ctx) + num(ctx.params.minutesAfterWake, 60));
    },
    buildPayload(ctx) {
      const dose = num(ctx.params.doseG, 5);
      return {
        title: "💊 Creatine",
        body: `Take ${dose}g creatine. Daily consistency is what counts.`,
        tag: "creatine",
        actions: [{ action: "done", title: "Taken" }, { action: "snooze", title: "+30m" }],
      };
    },
  },

  // ================================================================ RECOVERY
  {
    key: "stretching",
    label: "Warm-up & stretch",
    description: "A mobility nudge before you lift.",
    icon: PersonStanding,
    group: "recovery",
    defaultEnabled: true,
    params: [
      {
        key: "minutesBeforeWorkout",
        label: "Before workout",
        type: "minutes",
        default: 10,
        min: 0,
        max: 45,
        step: 5,
        unit: "min",
        hint: "A short dynamic warm-up before training; save long static stretches for after.",
      },
    ],
    computeFireTimes(ctx) {
      if (ctx.schedule.workoutHHMM == null) return [];
      const fire = hhmmToMin(ctx.schedule.workoutHHMM) - num(ctx.params.minutesBeforeWorkout, 10);
      return fire >= wake(ctx) ? [minToHhmm(fire)] : [];
    },
    buildPayload() {
      return {
        title: "🤸 Warm up",
        body: "Run through a quick dynamic warm-up and mobility before you lift.",
        tag: "stretching",
        actions: [{ action: "done", title: "Done" }],
      };
    },
  },

  {
    key: "sleep",
    label: "Sleep wind-down",
    description: "A screens-off cue before your target bedtime.",
    icon: Moon,
    group: "recovery",
    defaultEnabled: true,
    params: [
      {
        key: "windDownMin",
        label: "Wind-down before bed",
        type: "minutes",
        default: 30,
        min: 15,
        max: 90,
        step: 5,
        unit: "min",
        citation: "PMC4663795",
        hint: "Evening screen light delays melatonin and sleep onset (Chang 2015). 30 min off is the minimum.",
      },
      {
        key: "targetHours",
        label: "Target sleep",
        type: "integer",
        default: 8,
        min: 6,
        max: 10,
        step: 1,
        unit: "h",
        citation: "PMC4434546",
        hint: "AASM/SRS consensus: adults need 7–9 h (Watson 2015); athletes trend higher.",
      },
    ],
    computeFireTimes(ctx) {
      const fire = bed(ctx) - num(ctx.params.windDownMin, 30);
      return fire >= wake(ctx) ? [minToHhmm(fire)] : [];
    },
    buildPayload(ctx) {
      const wind = num(ctx.params.windDownMin, 30);
      const hours = num(ctx.params.targetHours, 8);
      return {
        title: "🌙 Wind down",
        body: `Screens off in ${wind} min. Aim for ${hours}h of sleep tonight.`,
        tag: "sleep",
        actions: [{ action: "done", title: "Offline" }, { action: "snooze", title: "+15m" }],
      };
    },
  },

  {
    key: "electrolytes",
    label: "Electrolytes",
    description: "Sodium/potassium around long or sweaty sessions.",
    icon: Zap,
    group: "recovery",
    defaultEnabled: false,
    params: [
      {
        key: "offsetMin",
        label: "Relative to workout",
        type: "minutes",
        default: 0,
        min: 0,
        max: 60,
        step: 5,
        unit: "min",
        hint: "Useful for sessions over ~60 min or in the heat (NATA 2017).",
      },
    ],
    computeFireTimes(ctx) {
      if (ctx.schedule.workoutHHMM == null) return [];
      return within(ctx, hhmmToMin(ctx.schedule.workoutHHMM) + num(ctx.params.offsetMin, 0));
    },
    buildPayload() {
      return {
        title: "⚡ Electrolytes",
        body: "Add sodium + potassium for a long or sweaty session.",
        tag: "electrolytes",
        actions: [{ action: "done", title: "Done" }],
      };
    },
  },

  {
    key: "magnesium",
    label: "Magnesium",
    description: "An evening magnesium reminder to support sleep.",
    icon: Tablets,
    group: "recovery",
    defaultEnabled: false,
    params: [
      {
        key: "minutesBeforeBed",
        label: "Before bed",
        type: "minutes",
        default: 45,
        min: 15,
        max: 120,
        step: 15,
        unit: "min",
        citation: "PMID23853635",
        hint: "~200–400 mg glycinate in the evening may aid sleep quality (Abbasi 2012).",
      },
    ],
    computeFireTimes(ctx) {
      const fire = bed(ctx) - num(ctx.params.minutesBeforeBed, 45);
      return fire >= wake(ctx) ? [minToHhmm(fire)] : [];
    },
    buildPayload() {
      return {
        title: "🌗 Magnesium",
        body: "Take magnesium (~300mg glycinate) to wind down for deeper sleep.",
        tag: "magnesium",
        actions: [{ action: "done", title: "Taken" }],
      };
    },
  },

  {
    key: "activeRecovery",
    label: "Active recovery",
    description: "A rest-day nudge to do 10–20 min of light movement to ease soreness.",
    icon: Footprints,
    group: "recovery",
    defaultEnabled: false,
    params: [
      {
        key: "minutesAfterWake",
        label: "After wake",
        type: "minutes",
        default: 120,
        min: 30,
        max: 480,
        step: 15,
        unit: "min",
        citation: "PMC5932411",
        hint: "Light active recovery (walk, easy cycle, yoga) cuts DOMS SMD -0.94; 10–20 min walking rivals foam rolling (PMC5932411; NSCA 2022).",
      },
    ],
    computeFireTimes(ctx) {
      // Rest days only — workoutHHMM null means no session is planned today.
      if (ctx.schedule.workoutHHMM != null) return [];
      return within(ctx, wake(ctx) + num(ctx.params.minutesAfterWake, 120));
    },
    buildPayload() {
      return {
        title: "🚶 Active recovery",
        body: "Rest day — 10–20 min of light movement cuts soreness. See the Recovery hub for a routine.",
        tag: "active-recovery",
        actions: [{ action: "done", title: "Done" }, { action: "snooze", title: "+30m" }],
      };
    },
  },

  {
    key: "foamRolling",
    label: "Foam rolling",
    description: "A post-workout self-myofascial release nudge to ease soreness.",
    icon: Repeat,
    group: "recovery",
    defaultEnabled: false,
    params: [
      {
        key: "afterWorkoutMin",
        label: "After workout",
        type: "minutes",
        default: 15,
        min: 0,
        max: 60,
        step: 5,
        unit: "min",
        citation: "PMC6465761",
        hint: "Foam rolling post-session has a small soreness benefit (g=0.47) that grows from 24h, with no downside (PMC6465761; PubMed39593540).",
      },
      {
        key: "durationMin",
        label: "Roll for",
        type: "integer",
        default: 10,
        min: 5,
        max: 30,
        step: 5,
        unit: "min",
        hint: "10–20 min over the muscle groups you trained today.",
      },
    ],
    computeFireTimes(ctx) {
      // Training days only — anchored to the end of the session.
      if (ctx.schedule.workoutHHMM == null) return [];
      return within(ctx, hhmmToMin(ctx.schedule.workoutHHMM) + num(ctx.params.afterWorkoutMin, 15));
    },
    buildPayload(ctx) {
      const dur = num(ctx.params.durationMin, 10);
      return {
        title: "🔁 Foam rolling",
        body: `${dur} min of foam rolling on the muscles you trained. The Recovery hub has a full SMR routine.`,
        tag: "foam-rolling",
        actions: [{ action: "done", title: "Done" }, { action: "snooze", title: "+15m" }],
      };
    },
  },

  {
    key: "sleepExtension",
    label: "Sleep extension nudge",
    description: "An early evening prompt to wind down sooner when you want more sleep.",
    icon: Moon,
    group: "recovery",
    defaultEnabled: false,
    params: [
      {
        key: "targetHours",
        label: "Target sleep",
        type: "integer",
        default: 8,
        min: 6,
        max: 10,
        step: 1,
        unit: "h",
        citation: "PMC11996801",
        hint: "Sleep extension (+26–106 min) improves recovery; under-sleep raises RPE SMD 0.39 (PMC11996801; Vitale 2021).",
      },
      {
        key: "earlyWindDownMin",
        label: "Wind down earlier by",
        type: "minutes",
        default: 30,
        min: 15,
        max: 90,
        step: 15,
        unit: "min",
        hint: "Move tonight's wind-down earlier than usual to bank the extra sleep.",
      },
    ],
    computeFireTimes(ctx) {
      // ~1h before the (earlier) wind-down so there's time to wrap up the evening.
      const fire = bed(ctx) - num(ctx.params.earlyWindDownMin, 30) - 60;
      return fire >= wake(ctx) ? [minToHhmm(fire)] : [];
    },
    buildPayload(ctx) {
      const hours = num(ctx.params.targetHours, 8);
      const wind = num(ctx.params.earlyWindDownMin, 30);
      return {
        title: "😴 Sleep extension",
        body: `Aim for ${hours}h tonight — start winding down ${wind} min earlier. More sleep = lower RPE tomorrow.`,
        tag: "sleep-extension",
        actions: [{ action: "done", title: "Will do" }, { action: "snooze", title: "+15m" }],
      };
    },
  },

  // =============================================================== WELLBEING
  {
    key: "hydration",
    label: "Hydration",
    description: "Evenly spaced water reminders across your waking hours.",
    icon: Droplets,
    group: "wellbeing",
    defaultEnabled: true,
    params: [
      {
        key: "remindersPerDay",
        label: "Reminders per day",
        type: "integer",
        default: 6,
        min: 2,
        max: 16,
        step: 1,
        citation: "PMC2908954",
        hint: "Aim ~35 ml/kg/day (Popkin 2010). 6 nudges spreads intake instead of front-loading it.",
      },
      {
        key: "mlPerReminder",
        label: "Amount each time",
        type: "integer",
        default: 350,
        min: 100,
        max: 750,
        step: 50,
        unit: "ml",
        hint: "6 × 350 ml ≈ 2.1 L. Bump this up on training days or in heat.",
      },
    ],
    computeFireTimes(ctx) {
      return evenlySpaced(ctx, num(ctx.params.remindersPerDay, 6));
    },
    buildPayload(ctx, i) {
      const ml = num(ctx.params.mlPerReminder, 350);
      const n = num(ctx.params.remindersPerDay, 6);
      return {
        title: "💧 Hydration",
        body: `Drink ~${ml} ml of water. (${i + 1} of ${n} today)`,
        tag: "hydration",
        actions: [{ action: "done", title: "Done" }, { action: "snooze", title: "Snooze 15m" }],
      };
    },
  },

  {
    key: "morningSunlight",
    label: "Morning sunlight",
    description: "Early daylight to anchor your circadian rhythm.",
    icon: Sunrise,
    group: "wellbeing",
    defaultEnabled: false,
    params: [
      {
        key: "minutesAfterWake",
        label: "After wake",
        type: "minutes",
        default: 20,
        min: 0,
        max: 120,
        step: 5,
        unit: "min",
        hint: "Outdoor light early in the day strengthens circadian timing and alertness.",
      },
    ],
    computeFireTimes(ctx) {
      return within(ctx, wake(ctx) + num(ctx.params.minutesAfterWake, 20));
    },
    buildPayload() {
      return {
        title: "🌅 Get sunlight",
        body: "Step outside for ~10 min of daylight to anchor your rhythm.",
        tag: "sunlight",
        actions: [{ action: "done", title: "Done" }],
      };
    },
  },

  {
    key: "adhdMedication",
    label: "Medication",
    description: "A private daily medication reminder. No details are stored.",
    icon: Brain,
    group: "wellbeing",
    defaultEnabled: false,
    params: [
      {
        key: "minutesAfterWake",
        label: "After wake",
        type: "minutes",
        default: 15,
        min: 0,
        max: 240,
        step: 5,
        unit: "min",
        hint: "Take consistently around the same time each day. Nothing about the medication is saved.",
      },
    ],
    computeFireTimes(ctx) {
      return within(ctx, wake(ctx) + num(ctx.params.minutesAfterWake, 15));
    },
    buildPayload() {
      return {
        title: "🧠 Medication",
        body: "Time for your medication.",
        tag: "medication",
        actions: [{ action: "done", title: "Taken" }, { action: "snooze", title: "+15m" }],
      };
    },
  },

  {
    key: "weighIn",
    label: "Morning weigh-in",
    description: "A fasted weigh-in that feeds your Body Tuning trend.",
    icon: Scale,
    group: "wellbeing",
    defaultEnabled: false,
    params: [
      {
        key: "minutesAfterWake",
        label: "After wake",
        type: "minutes",
        default: 30,
        min: 0,
        max: 180,
        step: 5,
        unit: "min",
        hint: "Weigh fasted, after the bathroom, before eating — the most consistent daily number.",
      },
    ],
    computeFireTimes(ctx) {
      return within(ctx, wake(ctx) + num(ctx.params.minutesAfterWake, 30));
    },
    buildPayload() {
      return {
        title: "⚖️ Weigh-in",
        body: "Log a fasted weigh-in — it sharpens your Body Tuning targets.",
        tag: "weigh-in",
        actions: [{ action: "done", title: "Logged" }],
      };
    },
  },
];

/** Look up a habit definition by its stable key. */
export function findHabit(key: string): HabitDefinition | undefined {
  return HABIT_REGISTRY.find((h) => h.key === key);
}
