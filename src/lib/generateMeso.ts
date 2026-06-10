import { randomUUID } from "node:crypto";
import type { MgPriority, Unit } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_REPS_TARGET, plannedSets, rirForWeek } from "@/lib/progression";

/** Build a full mesocycle (weeks × days × exercises × sets) from a template. Pure builder. */
export async function generateMesocycle(opts: {
  userId: number;
  templateKey: string;
  name: string;
  weeks: number;
  unit: Unit;
}) {
  const template = await prisma.template.findUnique({
    where: { key: opts.templateKey },
    include: {
      priorities: true,
      days: { orderBy: { position: "asc" }, include: { slots: { orderBy: { position: "asc" } } } },
    },
  });
  if (!template) throw new Error("Template not found");
  // Only the shared library or the user's own templates are usable.
  if (template.userId !== null && template.userId !== opts.userId) throw new Error("Forbidden");

  // Guard against a non-numeric `weeks` (server actions accept arbitrary input):
  // a stray NaN would otherwise survive the clamp and generate a 0-day meso.
  const requestedWeeks = Number.isFinite(opts.weeks) ? Math.floor(opts.weeks) : 5;
  const weeks = Math.max(2, Math.min(8, requestedWeeks));
  const prio = new Map<number, MgPriority>(template.priorities.map((p) => [p.muscleGroupId, p.priority]));
  const priorityFor = (mgId: number): MgPriority => prio.get(mgId) ?? "maintain";

  const days = [] as unknown[];
  for (let w = 0; w < weeks; w++) {
    for (const td of template.days) {
      const exercises = td.slots
        .filter((s) => s.exerciseId != null)
        .map((s) => {
          const count = plannedSets(priorityFor(s.muscleGroupId), w, weeks);
          return {
            exerciseId: s.exerciseId!,
            muscleGroupId: s.muscleGroupId,
            position: s.position,
            status: "pending",
            sets: {
              create: Array.from({ length: count }, (_, i) => ({
                position: i,
                setType: "regular",
                repsTarget: DEFAULT_REPS_TARGET,
                weightTarget: null,
                status: "pendingWeight",
                unit: opts.unit,
              })),
            },
          };
        });
      days.push({
        week: w,
        position: td.position,
        status: w === 0 && td.position === 0 ? "ready" : "pending",
        exercises: { create: exercises },
      });
    }
  }

  const meso = await prisma.mesocycle.create({
    data: {
      key: randomUUID().replace(/-/g, "").slice(0, 12),
      userId: opts.userId,
      name: opts.name.trim() || template.name,
      daysPerWeek: template.days.length,
      weeksCount: weeks,
      unit: opts.unit,
      microRirs: rirForWeek(0, weeks),
      status: "ready",
      generatedFrom: "template",
      sourceTemplateId: template.sourceId ?? null,
      startedAt: null,
      priorities: {
        create: template.priorities.map((p) => ({ muscleGroupId: p.muscleGroupId, priority: p.priority })),
      },
      days: { create: days as never },
    },
  });

  return meso.key;
}
