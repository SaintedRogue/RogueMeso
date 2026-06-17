"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { MgPriority } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getExercises, getTemplate } from "@/lib/data";
import { PRIORITIES } from "@/lib/priorities";
import { assertTemplateOwner } from "@/lib/ownership";

// Write side for user-owned templates. Reads + mesocycle generation already handle them
// (see generateMeso.ts / data.ts); this module only creates/edits/deletes them. The payload
// is a nested days -> slots tree plus per-muscle-group priorities, so these are typed actions
// called directly from the client (the SwapPanel useTransition idiom), not <form>+FormData.

/** One exercise line within a day. `exerciseId` null = an empty slot (dropped at generation). */
export type TemplateSlotInput = { muscleGroupId: number; exerciseId: number | null };
/** A day's slots, in order, with an optional day name. Day/slot `position` is the array index. */
export type TemplateDayInput = { label?: string | null; slots: TemplateSlotInput[] };
export type TemplatePriorityInput = { muscleGroupId: number; priority: MgPriority };
export type TemplateBuilderInput = {
  name: string;
  description?: string | null;
  days: TemplateDayInput[];
  priorities: TemplatePriorityInput[];
};

/** Slim, serializable exercise row the builder's picker renders — mirrors SwapCandidate. */
export type TemplateExercise = {
  id: number;
  name: string;
  exerciseType: string;
  muscleGroupId: number;
};

/**
 * Candidate exercises for a builder slot. Browsing is scoped to the slot's muscle group, but
 * a search query escapes that scope and spans the whole catalog — otherwise searching e.g.
 * "tricep" while the slot defaults to Chest would wrongly return nothing. Auth only — unlike
 * getSwapCandidates there's no DayExercise to own yet. getExercises already scopes to the
 * shared catalog + the user's own, so the picker can only surface valid exercises.
 */
export async function getTemplateExercises(
  muscleGroupId: number,
  search?: string,
): Promise<TemplateExercise[]> {
  const me = await requireUser();
  const q = search?.trim() || undefined;
  const list = await getExercises(me.id, q, q ? undefined : muscleGroupId);
  return list.map((e) => ({
    id: e.id,
    name: e.name,
    exerciseType: e.exerciseType,
    muscleGroupId: e.muscleGroupId,
  }));
}

/** The validated, position-stamped shape a create/update writes. */
type BuiltTemplate = {
  name: string;
  description: string | null;
  days: { position: number; label: string | null; slots: { position: number; muscleGroupId: number; exerciseId: number | null }[] }[];
  priorities: { muscleGroupId: number; priority: MgPriority }[];
};

/**
 * Validate raw builder input and stamp positions from array order. Shared by create + update.
 * Rejects bad structure; ensures every muscle group is real, every chosen exercise is
 * catalog-or-owned, and priorities are deduped to satisfy @@unique([templateId, muscleGroupId]).
 */
async function validateAndBuild(input: TemplateBuilderInput, userId: number): Promise<BuiltTemplate> {
  const name = input.name?.trim();
  if (!name) throw new Error("Name is required.");
  if (!input.days?.length) throw new Error("Add at least one day.");
  if (input.days.some((d) => !d.slots?.length)) throw new Error("Each day needs at least one slot.");

  const allSlots = input.days.flatMap((d) => d.slots);
  const usedMgIds = new Set(allSlots.map((s) => s.muscleGroupId));

  // Every slot's muscle group must be one of the seeded groups.
  const validMgIds = new Set((await prisma.muscleGroup.findMany({ select: { id: true } })).map((m) => m.id));
  if ([...usedMgIds].some((id) => !validMgIds.has(id))) throw new Error("Invalid muscle group.");

  // Every non-null exercise must be in the shared catalog or owned by this user.
  const exIds = [...new Set(allSlots.map((s) => s.exerciseId).filter((x): x is number => x != null))];
  if (exIds.length) {
    const ok = await prisma.exercise.findMany({
      where: { id: { in: exIds }, OR: [{ userId: null }, { userId }] },
      select: { id: true },
    });
    if (ok.length !== exIds.length) throw new Error("Invalid exercise selection.");
  }

  // Priorities: enum-valid, restricted to groups actually used (drops stale rows), and
  // deduped (last write wins) so the unique constraint can't be violated.
  const prioMap = new Map<number, MgPriority>();
  for (const p of input.priorities ?? []) {
    if (!usedMgIds.has(p.muscleGroupId)) continue;
    if (!PRIORITIES.includes(p.priority)) throw new Error("Invalid priority.");
    prioMap.set(p.muscleGroupId, p.priority);
  }

  return {
    name,
    description: input.description?.trim().slice(0, 2000) || null,
    days: input.days.map((d, di) => ({
      position: di,
      label: d.label?.trim().slice(0, 80) || null,
      slots: d.slots.map((s, si) => ({
        position: si,
        muscleGroupId: s.muscleGroupId,
        exerciseId: s.exerciseId ?? null,
      })),
    })),
    priorities: [...prioMap.entries()].map(([muscleGroupId, priority]) => ({ muscleGroupId, priority })),
  };
}

/** Facet metadata the builder doesn't ask the user for. Template.sex is "male"/"female"
 *  (bodySex is "M"/"F"); default to "male" when unknown since the column is required. */
function sexFor(bodySex: string | null): string {
  return bodySex === "F" ? "female" : "male";
}

/** Persist a validated template owned by `userId`; returns its new key. Shared by create + copy. */
async function persistNewTemplate(built: BuiltTemplate, userId: number, bodySex: string | null): Promise<string> {
  const key = randomUUID().replace(/-/g, "").slice(0, 12);
  await prisma.template.create({
    data: {
      key,
      name: built.name,
      description: built.description,
      emphasis: "Custom",
      sex: sexFor(bodySex),
      frequency: built.days.length,
      userId,
      sharedWithInstance: false,
      days: { create: built.days.map((d) => ({ position: d.position, label: d.label, slots: { create: d.slots } })) },
      priorities: { create: built.priorities },
    },
  });
  return key;
}

/** Create a user-owned template and go to its detail page. */
export async function createTemplateAction(input: TemplateBuilderInput): Promise<void> {
  const me = await requireUser();
  const built = await validateAndBuild(input, me.id);
  const key = await persistNewTemplate(built, me.id, me.bodySex);
  revalidatePath("/templates");
  redirect(`/templates/${key}`); // throws a control-flow signal — keep outside any try/catch
}

/**
 * Duplicate any template the user can see (a seeded library one, a shared one, or their own)
 * into a fresh editable copy they own, then open it in the builder. This is how you customize
 * a built-in template: copy it, then tweak days/exercises/priorities on your own version.
 */
export async function copyTemplateAction(key: string): Promise<void> {
  const me = await requireUser();
  const t = await getTemplate(key, me.id); // enforces accessible (library / shared / own)
  if (!t) throw new Error("Forbidden");
  const built = await validateAndBuild(
    {
      name: `Copy of ${t.name}`.slice(0, 80),
      description: t.description,
      days: t.days.map((d) => ({
        label: d.label,
        slots: d.slots.map((s) => ({ muscleGroupId: s.muscleGroupId, exerciseId: s.exerciseId })),
      })),
      priorities: t.priorities.map((p) => ({ muscleGroupId: p.muscleGroupId, priority: p.priority })),
    },
    me.id,
  );
  const newKey = await persistNewTemplate(built, me.id, me.bodySex);
  revalidatePath("/templates");
  redirect(`/templates/${newKey}/edit`); // land in the builder so they can immediately tweak
}

/**
 * Edit one of the user's own templates. Children are deleted and recreated inside a
 * transaction (matching the seeder's idempotent pattern); the Template row and its key
 * stay stable so existing links/deep-links keep working.
 */
export async function updateTemplateAction(key: string, input: TemplateBuilderInput): Promise<void> {
  const me = await requireUser();
  await assertTemplateOwner(key, me.id);
  const built = await validateAndBuild(input, me.id);
  const tpl = await prisma.template.findUniqueOrThrow({ where: { key }, select: { id: true } });

  await prisma.$transaction(async (tx) => {
    await tx.templateDay.deleteMany({ where: { templateId: tpl.id } }); // cascades to slots
    await tx.templatePriority.deleteMany({ where: { templateId: tpl.id } });
    await tx.template.update({
      where: { id: tpl.id },
      data: {
        name: built.name,
        description: built.description,
        frequency: built.days.length,
        days: { create: built.days.map((d) => ({ position: d.position, label: d.label, slots: { create: d.slots } })) },
        priorities: { create: built.priorities },
      },
    });
  });

  revalidatePath("/templates");
  revalidatePath(`/templates/${key}`);
  redirect(`/templates/${key}`);
}

/** Hard delete one of the user's own templates — cascades to days/slots/priorities. */
export async function deleteTemplateAction(key: string): Promise<void> {
  const me = await requireUser();
  await assertTemplateOwner(key, me.id);
  await prisma.template.delete({ where: { key } });
  revalidatePath("/templates");
  redirect("/templates");
}
