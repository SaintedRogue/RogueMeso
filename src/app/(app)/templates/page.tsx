import { getTemplates } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { PageHeader, CardLink } from "@/components/ui";

export default async function TemplatesPage() {
  const me = await requireUser();
  const templates = await getTemplates(me.id);
  return (
    <>
      <PageHeader title="Templates" subtitle={`${templates.length} program templates`} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => (
          <CardLink key={t.id} href={`/templates/${t.key}`}>
            <div className="font-semibold leading-tight">{t.name}</div>
            <div className="mt-1 text-xs text-muted">
              {t.emphasis} · {t.sex}
              {t.frequency ? ` · ${t.frequency}×/wk` : ""}
            </div>
            <div className="mt-2 text-xs text-muted">{t._count.days} training days</div>
          </CardLink>
        ))}
      </div>
    </>
  );
}
