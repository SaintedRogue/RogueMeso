import Link from "next/link";
import { getTemplates } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { PageHeader, CardLink } from "@/components/ui";
import { ShareTemplateToggle } from "@/components/community/ShareTemplateToggle";

export default async function TemplatesPage() {
  const me = await requireUser();
  const templates = await getTemplates(me.id);
  return (
    <>
      <PageHeader title="Templates" subtitle={`${templates.length} program templates`} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => {
          const meta = (
            <>
              <div className="font-semibold leading-tight">{t.name}</div>
              <div className="mt-1 text-xs text-muted">
                {t.emphasis} · {t.sex}
                {t.frequency ? ` · ${t.frequency}×/wk` : ""}
              </div>
              <div className="mt-2 text-xs text-muted">{t._count.days} training days</div>
            </>
          );

          // Owned templates get a share control once you've joined the community. The
          // toggle is a button, so the card can't be a single <a> — split link + footer.
          if (t.userId === me.id && me.communityOptIn) {
            return (
              <div key={t.id} className="card flex flex-col">
                <Link
                  href={`/templates/${t.key}`}
                  className="block flex-1 rounded-t-[0.9rem] p-4 transition-colors hover:bg-panel-2/40"
                >
                  {meta}
                </Link>
                <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2.5">
                  <span className="text-xs text-muted">Your template</span>
                  <ShareTemplateToggle templateKey={t.key} shared={t.sharedWithInstance} />
                </div>
              </div>
            );
          }

          return (
            <CardLink key={t.id} href={`/templates/${t.key}`}>
              {meta}
            </CardLink>
          );
        })}
      </div>
    </>
  );
}
