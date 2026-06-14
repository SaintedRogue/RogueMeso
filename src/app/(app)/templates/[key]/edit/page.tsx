import { notFound } from "next/navigation";
import { getMuscleGroups, getTemplate } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { TemplateBuilder, type TemplateBuilderInitial } from "@/components/TemplateBuilder";

export default async function EditTemplatePage({ params }: { params: Promise<{ key: string }> }) {
  const me = await requireUser();
  const { key } = await params;
  const t = await getTemplate(key, me.id);
  // Only the owner may edit — library (userId null) and others' templates are immutable.
  if (!t || t.userId !== me.id) notFound();

  const muscleGroups = await getMuscleGroups();
  const initial: TemplateBuilderInitial = {
    name: t.name,
    days: t.days.map((d) => ({
      slots: d.slots.map((s) => ({
        muscleGroupId: s.muscleGroupId,
        exerciseId: s.exerciseId,
        exerciseName: s.exercise?.name ?? null,
      })),
    })),
    priorities: t.priorities.map((p) => ({ muscleGroupId: p.muscleGroupId, priority: p.priority })),
  };

  return (
    <>
      <PageHeader title="Edit template" subtitle={t.name} />
      <TemplateBuilder
        muscleGroups={muscleGroups.map((m) => ({ id: m.id, name: m.name }))}
        mode="edit"
        templateKey={key}
        initial={initial}
      />
    </>
  );
}
