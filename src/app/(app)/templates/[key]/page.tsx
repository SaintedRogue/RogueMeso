import { notFound } from "next/navigation";
import { getTemplate } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { PageHeader, MgDot } from "@/components/ui";
import { mgColor } from "@/lib/format";

export default async function TemplateDetail({ params }: { params: Promise<{ key: string }> }) {
  const me = await requireUser();
  const { key } = await params;
  const t = await getTemplate(key, me.id);
  if (!t) notFound();

  return (
    <>
      <PageHeader
        title={t.name}
        subtitle={`${t.emphasis} · ${t.sex}${t.frequency ? ` · ${t.frequency}×/wk` : ""}`}
      />

      {t.priorities.length > 0 && (
        <div className="card mb-6 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Priorities</div>
          <div className="flex flex-wrap gap-2">
            {t.priorities.map((p) => (
              <span key={p.id} className="chip" style={{ borderColor: mgColor(p.muscleGroup.name) }}>
                <MgDot color={mgColor(p.muscleGroup.name)} />
                {p.muscleGroup.name} · {p.priority}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {t.days.map((d) => (
          <div key={d.id} className="card overflow-hidden">
            <div className="border-b border-line px-4 py-2.5 text-sm font-semibold">
              Day {d.position + 1}
            </div>
            <div className="divide-y divide-line/60">
              {d.slots.map((s) => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <MgDot color={mgColor(s.muscleGroup.name)} />
                  <span className="text-muted" style={{ color: mgColor(s.muscleGroup.name), minWidth: "5rem" }}>
                    {s.muscleGroup.name}
                  </span>
                  <span>{s.exercise?.name ?? <span className="text-muted italic">empty slot</span>}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
