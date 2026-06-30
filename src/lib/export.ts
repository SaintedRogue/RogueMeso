// Personal data export — dumps one user's training, body-tuning and recovery data for analysis
// by an AI agent. Two formats, downloaded as separate files: a lossless canonical-kg JSON
// payload, and a readable Markdown summary (in the user's preferred unit). The user picks which
// domains to include and an optional "from" date. All selection/filtering/shaping is pure (and
// unit-tested); getExportData is a dumb fetch-all — mirroring the split in features/bodyTuning.ts.
import { prisma } from "@/lib/prisma";
import { toKg, fromKg, fmtWeight } from "@/lib/format";

// ----- Raw input shape (structural mirror of the getExportData query result) -----

export type RawSet = {
  position: number;
  weight: number | null;
  weightTarget: number | null;
  weightTargetMin: number | null;
  weightTargetMax: number | null;
  reps: number | null;
  repsTarget: number | null;
  rir: number | null;
  bodyweight: number | null;
  unit: string | null;
  setType: string;
  status: string;
  finishedAt: Date | null;
};

export type RawDayExercise = {
  position: number;
  jointPain: number | null;
  status: string;
  exercise: { name: string; exerciseType: string };
  muscleGroup: { name: string };
  sets: RawSet[];
};

export type RawDay = {
  week: number;
  position: number;
  label: string | null;
  status: string;
  bodyweight: number | null;
  bodyweightUnit: string | null;
  notes: string | null;
  finishedAt: Date | null;
  exercises: RawDayExercise[];
};

export type RawMeso = {
  name: string;
  status: string;
  unit: string;
  daysPerWeek: number;
  weeksCount: number;
  nutritionGoal: string | null;
  goalWeightKg: number | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  days: RawDay[];
};

export type RawWeightEntry = {
  date: Date;
  weightKg: number;
  bodyFatPct: number | null;
  localMinutes: number | null;
  note: string | null;
};

export type RawReadinessEntry = {
  date: Date;
  sleepHours: number;
  soreness: number;
  energy: number;
  score: number;
  note: string | null;
};

export type RawExport = {
  user: {
    name: string | null;
    email: string;
    unit: string;
    heightCm: number | null;
    birthDate: Date | null;
    bodySex: string | null;
    activityLevel: string | null;
    goalWeightKg: number | null;
    createdAt: Date;
  };
  mesocycles: RawMeso[];
  weightEntries: RawWeightEntry[];
  readinessEntries: RawReadinessEntry[];
};

// ----- Selection options -----

export type DomainSelection = { training: boolean; body: boolean; recovery: boolean };
export const ALL_DOMAINS: DomainSelection = { training: true, body: true, recovery: true };

export type ExportOptions = { domains: DomainSelection; from: Date | null };

// ----- Lossless export payload (canonical kilograms throughout) -----

export type ExportSet = {
  set: number; // 1-based set number within the exercise
  weightKg: number | null; // load on the bar/stack (added load for bodyweight-loadable)
  reps: number | null;
  rir: number | null;
  targetWeightKg: number | null;
  targetReps: number | null;
  bodyweightKg: number | null; // lifter mass logged for this set, when captured
  setType: string;
  status: string;
  completedAt: string | null;
};

export type ExportExercise = {
  name: string;
  muscle: string;
  type: string;
  jointPain: number | null;
  sets: ExportSet[];
};

export type ExportDay = {
  week: number; // 1-based
  day: number; // 1-based
  label: string | null;
  status: string;
  bodyweightKg: number | null;
  finishedAt: string | null;
  notes: string | null;
  exercises: ExportExercise[];
};

export type ExportMeso = {
  name: string;
  status: string;
  weeks: number;
  daysPerWeek: number;
  nutritionGoal: string | null;
  goalWeightKg: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  days: ExportDay[];
};

export type ExportWeighIn = {
  date: string;
  weightKg: number;
  bodyFatPct: number | null;
  timeOfDay: "AM" | "PM" | null;
  note: string | null;
};

export type ExportReadiness = {
  date: string;
  sleepHours: number;
  soreness: number;
  energy: number;
  score: number;
  note: string | null;
};

export type ExportProfile = {
  name: string | null;
  email: string;
  sex: string | null;
  heightCm: number | null;
  birthDate: string | null;
  activityLevel: string | null;
  goalWeightKg: number | null;
  memberSince: string;
};

export type ExportPayload = {
  app: "RogueMeso";
  exportedAt: string;
  filteredFrom: string | null; // earliest date included, or null for all-time
  units: { weight: "kg"; note: string };
  profile: ExportProfile;
  // Each section is present only when its domain was selected.
  mesocycles?: ExportMeso[];
  weighIns?: ExportWeighIn[];
  readiness?: ExportReadiness[];
};

// ----- Pure helpers -----

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A @db.Date / midnight-UTC instant → "YYYY-MM-DD". */
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Convert a value stored in `unit` (falling back to the block's unit) to canonical kg. */
function kgFrom(value: number | null, unit: string | null, fallbackUnit: string): number | null {
  if (value == null) return null;
  return round2(toKg(value, unit ?? fallbackUnit));
}

/**
 * Collapse a single set's three weight concepts — `weightKg` (load on the bar/stack),
 * `bodyweightKg` (the lifter's mass, present only for bodyweight-loadable lifts) and the
 * exercise `type` — into one "how heavy was this set" figure in kilograms, or null when the
 * set carries no meaningful load. This is the primitive the readable summary uses to pick each
 * exercise's best set, so the policy here defines what "heaviest" means across the whole export.
 *
 * exercise types (Prisma client enum names): "barbell" | "dumbbell" | "machine" | "cable" |
 * "freemotion" | "smithMachine" | "machineAssistance" | "kettlebell" | "bodyweightOnly" |
 * "bodyweightLoadable".
 */
export function effectiveLoadKg(
  set: { weightKg: number | null; bodyweightKg: number | null },
  exerciseType: string,
): number | null {
  const added = set.weightKg;
  const bw = set.bodyweightKg;
  // Bodyweight-only: you are the load. Null bodyweight → no number to report (the summary
  // still labels these as "bodyweight"); never fall back to the bar weight.
  if (exerciseType === "bodyweightOnly") return bw;
  // Bodyweight-loadable: bodyweight plus added load (added may be negative for assistance).
  if (exerciseType === "bodyweightLoadable") {
    if (bw == null && added == null) return null;
    return (bw ?? 0) + (added ?? 0);
  }
  // Weighted / machine / cable / etc.: the selected weight only — bodyweight is excluded.
  return added;
}

const BODYWEIGHT_TYPES = new Set(["bodyweightOnly", "bodyweightLoadable"]);

function setToExport(s: RawSet, fallbackUnit: string): ExportSet {
  return {
    set: s.position + 1,
    weightKg: kgFrom(s.weight, s.unit, fallbackUnit),
    reps: s.reps,
    rir: s.rir,
    targetWeightKg: kgFrom(s.weightTarget, s.unit, fallbackUnit),
    targetReps: s.repsTarget,
    bodyweightKg: kgFrom(s.bodyweight, s.unit, fallbackUnit),
    setType: s.setType,
    status: s.status,
    completedAt: s.finishedAt ? s.finishedAt.toISOString() : null,
  };
}

function mesoToExport(m: RawMeso, from: Date | null): ExportMeso | null {
  // A `from` date keeps only sessions logged (finished) on/after it. Unfinished days have no
  // date, so they fall out of a filtered export — which is meant as "logged history since X".
  const days = m.days.filter((d) => from == null || (d.finishedAt != null && d.finishedAt >= from));
  if (from != null && days.length === 0) return null; // nothing of this block falls in range
  return {
    name: m.name,
    status: m.status,
    weeks: m.weeksCount,
    daysPerWeek: m.daysPerWeek,
    nutritionGoal: m.nutritionGoal,
    goalWeightKg: m.goalWeightKg,
    startedAt: m.startedAt ? m.startedAt.toISOString() : null,
    finishedAt: m.finishedAt ? m.finishedAt.toISOString() : null,
    days: days.map((d) => ({
      week: d.week + 1,
      day: d.position + 1,
      label: d.label,
      status: d.status,
      bodyweightKg: kgFrom(d.bodyweight, d.bodyweightUnit, m.unit),
      finishedAt: d.finishedAt ? d.finishedAt.toISOString() : null,
      notes: d.notes,
      exercises: d.exercises.map((ex) => ({
        name: ex.exercise.name,
        muscle: ex.muscleGroup.name,
        type: ex.exercise.exerciseType,
        jointPain: ex.jointPain,
        sets: ex.sets.map((s) => setToExport(s, m.unit)),
      })),
    })),
  };
}

/** Shape the raw query result into the lossless, canonical-kg payload, honoring the selected
 *  domains and optional `from` date. Sections for unselected domains are omitted entirely. */
export function buildExportPayload(raw: RawExport, now: Date, options: ExportOptions): ExportPayload {
  const { domains, from } = options;
  const u = raw.user;
  const payload: ExportPayload = {
    app: "RogueMeso",
    exportedAt: now.toISOString(),
    filteredFrom: from ? ymd(from) : null,
    units: { weight: "kg", note: "All weights are kilograms." },
    profile: {
      name: u.name,
      email: u.email,
      sex: u.bodySex,
      heightCm: u.heightCm,
      birthDate: u.birthDate ? ymd(u.birthDate) : null,
      activityLevel: u.activityLevel,
      goalWeightKg: u.goalWeightKg,
      memberSince: ymd(u.createdAt),
    },
  };

  if (domains.training) {
    payload.mesocycles = raw.mesocycles
      .map((m) => mesoToExport(m, from))
      .filter((m): m is ExportMeso => m !== null);
  }
  if (domains.body) {
    payload.weighIns = raw.weightEntries
      .filter((w) => from == null || w.date >= from)
      .map((w) => ({
        date: ymd(w.date),
        weightKg: w.weightKg,
        bodyFatPct: w.bodyFatPct,
        timeOfDay: w.localMinutes == null ? null : w.localMinutes < 720 ? "AM" : "PM",
        note: w.note,
      }));
  }
  if (domains.recovery) {
    payload.readiness = raw.readinessEntries
      .filter((r) => from == null || r.date >= from)
      .map((r) => ({
        date: ymd(r.date),
        sleepHours: r.sleepHours,
        soreness: r.soreness,
        energy: r.energy,
        score: r.score,
        note: r.note,
      }));
  }

  return payload;
}

// ----- Markdown rendering (readable summary, in the user's preferred unit) -----

/** Best logged set per exercise across a whole block, for the summary table. `loadKg` is null
 *  for bodyweight exercises with no captured bodyweight — rendered as "bodyweight". */
type BestSet = { muscle: string; loadKg: number | null; reps: number | null; rir: number | null };

function bestSetsByExercise(meso: ExportMeso): Map<string, BestSet> {
  const best = new Map<string, BestSet>();
  for (const day of meso.days) {
    for (const ex of day.exercises) {
      const isBw = BODYWEIGHT_TYPES.has(ex.type);
      for (const s of ex.sets) {
        const load = effectiveLoadKg({ weightKg: s.weightKg, bodyweightKg: s.bodyweightKg ?? day.bodyweightKg }, ex.type);
        const prev = best.get(ex.name);
        if (load != null) {
          // A numeric load always wins; heaviest set across the block.
          if (!prev || prev.loadKg == null || load > prev.loadKg) {
            best.set(ex.name, { muscle: ex.muscle, loadKg: load, reps: s.reps, rir: s.rir });
          }
        } else if (isBw && (!prev || (prev.loadKg == null && (s.reps ?? 0) > (prev.reps ?? 0)))) {
          // Bodyweight set with no number: keep it (most reps), but never displace a numeric best.
          best.set(ex.name, { muscle: ex.muscle, loadKg: null, reps: s.reps, rir: s.rir });
        }
      }
    }
  }
  return best;
}

function fmtKg(kg: number | null, unit: string): string {
  if (kg == null) return "—";
  return fmtWeight(round2(fromKg(kg, unit)), unit);
}

/** Render the readable Markdown summary. Only sections present in the payload are emitted. */
export function renderMarkdown(p: ExportPayload, displayUnit: string): string {
  const lines: string[] = [];
  lines.push(`# RogueMeso data export`);
  lines.push("");
  const range = p.filteredFrom ? ` · from ${p.filteredFrom}` : "";
  lines.push(`_Exported ${p.exportedAt.slice(0, 10)} · weights in ${displayUnit}${range}._`);
  lines.push("");

  // Profile (always present)
  lines.push(`## Profile`);
  const who = p.profile.name ? `${p.profile.name} (${p.profile.email})` : p.profile.email;
  lines.push(`- ${who}`);
  const bits = [
    p.profile.sex ? `Sex: ${p.profile.sex}` : null,
    p.profile.heightCm != null ? `Height: ${p.profile.heightCm} cm` : null,
    p.profile.activityLevel ? `Activity: ${p.profile.activityLevel}` : null,
    p.profile.goalWeightKg != null ? `Goal: ${fmtKg(p.profile.goalWeightKg, displayUnit)}` : null,
  ].filter(Boolean);
  if (bits.length) lines.push(`- ${bits.join(" · ")}`);
  lines.push(`- Member since ${p.profile.memberSince}`);
  lines.push("");

  // Training
  if (p.mesocycles) {
    lines.push(`## Training (${p.mesocycles.length} mesocycle${p.mesocycles.length === 1 ? "" : "s"})`);
    if (p.mesocycles.length === 0) lines.push("_No mesocycles in range._");
    for (const m of p.mesocycles) {
      const done = m.days.filter((d) => d.status === "complete").length;
      const goal = m.goalWeightKg != null ? ` · goal ${fmtKg(m.goalWeightKg, displayUnit)}` : "";
      const nut = m.nutritionGoal ? ` · ${m.nutritionGoal}` : "";
      lines.push("");
      lines.push(`### ${m.name} — ${m.status} · ${m.weeks} weeks × ${m.daysPerWeek}/wk${goal}${nut}`);
      lines.push(`Sessions completed: ${done}/${m.days.length}`);
      const best = bestSetsByExercise(m);
      if (best.size) {
        lines.push("");
        lines.push(`| Exercise | Muscle | Best set |`);
        lines.push(`|---|---|---|`);
        for (const [name, b] of best) {
          const rir = b.rir != null ? ` @${b.rir} RIR` : "";
          const reps = b.reps != null ? ` × ${b.reps}` : "";
          const load = b.loadKg != null ? fmtKg(b.loadKg, displayUnit) : "bodyweight";
          lines.push(`| ${name} | ${b.muscle} | ${load}${reps}${rir} |`);
        }
      }
    }
    lines.push("");
  }

  // Weigh-ins
  if (p.weighIns) {
    lines.push(`## Weigh-ins (${p.weighIns.length})`);
    if (p.weighIns.length === 0) {
      lines.push("_No weigh-ins in range._");
    } else {
      lines.push(`| Date | Weight | Body fat | Time |`);
      lines.push(`|---|---|---|---|`);
      for (const w of p.weighIns) {
        const bf = w.bodyFatPct != null ? `${round2(w.bodyFatPct * 100)}%` : "—";
        lines.push(`| ${w.date} | ${fmtKg(w.weightKg, displayUnit)} | ${bf} | ${w.timeOfDay ?? "—"} |`);
      }
    }
    lines.push("");
  }

  // Recovery readiness
  if (p.readiness) {
    lines.push(`## Recovery readiness (${p.readiness.length})`);
    if (p.readiness.length === 0) {
      lines.push("_No readiness check-ins in range._");
    } else {
      lines.push(`| Date | Sleep | Soreness | Energy | Score |`);
      lines.push(`|---|---|---|---|---|`);
      for (const r of p.readiness) {
        lines.push(`| ${r.date} | ${r.sleepHours}h | ${r.soreness}/5 | ${r.energy}/5 | ${r.score} |`);
      }
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}

/** Serialize the lossless payload as pretty JSON. */
export function renderJson(payload: ExportPayload): string {
  return JSON.stringify(payload, null, 2) + "\n";
}

// ----- Async Prisma wrapper (user-scoped reads; sensitive fields never selected) -----

export async function getExportData(userId: number): Promise<RawExport> {
  const [user, mesocycles, weightEntries, readinessEntries] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        unit: true,
        heightCm: true,
        birthDate: true,
        bodySex: true,
        activityLevel: true,
        goalWeightKg: true,
        createdAt: true,
      },
    }),
    prisma.mesocycle.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: {
        name: true,
        status: true,
        unit: true,
        daysPerWeek: true,
        weeksCount: true,
        nutritionGoal: true,
        goalWeightKg: true,
        startedAt: true,
        finishedAt: true,
        days: {
          orderBy: [{ week: "asc" }, { position: "asc" }],
          select: {
            week: true,
            position: true,
            label: true,
            status: true,
            bodyweight: true,
            bodyweightUnit: true,
            notes: true,
            finishedAt: true,
            exercises: {
              orderBy: { position: "asc" },
              select: {
                position: true,
                jointPain: true,
                status: true,
                exercise: { select: { name: true, exerciseType: true } },
                muscleGroup: { select: { name: true } },
                sets: {
                  orderBy: { position: "asc" },
                  select: {
                    position: true,
                    weight: true,
                    weightTarget: true,
                    weightTargetMin: true,
                    weightTargetMax: true,
                    reps: true,
                    repsTarget: true,
                    rir: true,
                    bodyweight: true,
                    unit: true,
                    setType: true,
                    status: true,
                    finishedAt: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.weightEntry.findMany({
      where: { userId },
      orderBy: { date: "asc" },
      select: { date: true, weightKg: true, bodyFatPct: true, localMinutes: true, note: true },
    }),
    prisma.readinessEntry.findMany({
      where: { userId },
      orderBy: { date: "asc" },
      select: { date: true, sleepHours: true, soreness: true, energy: true, score: true, note: true },
    }),
  ]);
  return { user, mesocycles, weightEntries, readinessEntries };
}
