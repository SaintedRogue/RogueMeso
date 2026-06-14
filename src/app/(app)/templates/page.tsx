import Link from "next/link";
import { Plus } from "lucide-react";
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
      <PageHeader title="Templates" subtitle={`${templates.length} program templates`}>
        <Link
          href="/templates/new"
          className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
        >
          <Plus aria-hidden size={15} />
          New template
        </Link>
      </PageHeader>
      <TemplateLibrary templates={library} meId={me.id} communityOptIn={me.communityOptIn} defaultSex={defaultSex} />
    </>
  );
}
