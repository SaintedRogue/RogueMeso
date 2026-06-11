import { getTemplates } from "@/lib/data";
import { createMesocycleAction } from "@/lib/mesoActions";
import { getDefaultUnit } from "@/lib/settings";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { TemplatePicker, type PickerTemplate } from "@/components/TemplatePicker";

export default async function NewMesoPage() {
  const me = await requireUser();
  const [templates, defaultUnit] = await Promise.all([getTemplates(me.id), getDefaultUnit()]);

  const picker: PickerTemplate[] = templates.map((t) => ({
    key: t.key,
    name: t.name,
    emphasis: t.emphasis,
    sex: t.sex,
    frequency: t.frequency,
    days: t._count.days,
  }));
  // Template.sex is "male"/"female"; the profile stores "M"/"F". Pre-select the matching facet.
  const defaultSex = me.bodySex === "F" ? "female" : me.bodySex === "M" ? "male" : null;

  return (
    <>
      <PageHeader title="New mesocycle" subtitle="Generate a training block from a template" />

      <form action={createMesocycleAction} className="space-y-6">
        <TemplatePicker templates={picker} defaultSex={defaultSex} defaultUnit={defaultUnit} />
      </form>
    </>
  );
}
