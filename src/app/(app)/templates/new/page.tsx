import { getMuscleGroups } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { TemplateBuilder } from "@/components/TemplateBuilder";

export default async function NewTemplatePage() {
  await requireUser();
  const muscleGroups = await getMuscleGroups();

  return (
    <>
      <PageHeader title="New template" subtitle="Build a custom training template" />
      <TemplateBuilder muscleGroups={muscleGroups.map((m) => ({ id: m.id, name: m.name }))} mode="create" />
    </>
  );
}
