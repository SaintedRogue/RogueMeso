import { getTemplates } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { TemplateLibrary, type LibraryTemplate } from "@/components/TemplateLibrary";

export default async function TemplatesPage() {
  const me = await requireUser();
  const templates = await getTemplates(me.id);

  const library: LibraryTemplate[] = templates.map((t) => ({
    key: t.key,
    name: t.name,
    emphasis: t.emphasis,
    sex: t.sex,
    frequency: t.frequency,
    days: t._count.days,
    userId: t.userId,
    sharedWithInstance: t.sharedWithInstance,
  }));
  // Template.sex is "male"/"female"; the profile stores "M"/"F". Pre-select the matching facet.
  const defaultSex = me.bodySex === "F" ? "female" : me.bodySex === "M" ? "male" : null;

  return (
    <>
      <PageHeader title="Templates" subtitle={`${templates.length} program templates`} />
      <TemplateLibrary templates={library} meId={me.id} communityOptIn={me.communityOptIn} defaultSex={defaultSex} />
    </>
  );
}
