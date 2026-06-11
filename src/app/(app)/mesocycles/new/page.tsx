import { getTemplates } from "@/lib/data";
import { createMesocycleAction } from "@/lib/mesoActions";
import { getDefaultUnit } from "@/lib/settings";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { TemplatePicker, type PickerTemplate } from "@/components/TemplatePicker";

export default async function NewMesoPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const me = await requireUser();
  const [templates, defaultUnit, sp] = await Promise.all([
    getTemplates(me.id),
    getDefaultUnit(),
    searchParams,
  ]);

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
  // Honor a "Use this template" deep link from /templates — but only if it's a real,
  // accessible template (getTemplates already scopes to library + own), so a stale or
  // forged key just falls back to no preselection.
  const initialSelectedKey = sp.template && picker.some((t) => t.key === sp.template) ? sp.template : null;

  return (
    <>
      <PageHeader title="New mesocycle" subtitle="Generate a training block from a template" />

      <form action={createMesocycleAction} className="space-y-6">
        <TemplatePicker
          templates={picker}
          defaultSex={defaultSex}
          defaultUnit={defaultUnit}
          initialSelectedKey={initialSelectedKey}
        />
      </form>
    </>
  );
}
