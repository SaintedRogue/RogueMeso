import Link from "next/link";
import { notFound } from "next/navigation";
import { getMesocycle } from "@/lib/data";
import { PageHeader, StatusPill, MgDot } from "@/components/ui";
import { MesoActions } from "@/components/MesoActions";
import { requireUser } from "@/lib/auth";
import { mgColor } from "@/lib/format";

export default async function MesoDetail({ params }: { params: Promise<{ key: string }> }) {
  const me = await requireUser();
  const { key } = await params;
  const meso = await getMesocycle(key, me.id);
  if (!meso) notFound();

  // group days by week
  const byWeek = new Map<number, typeof meso.days>();
  for (const d of meso.days) {
    if (!byWeek.has(d.week)) byWeek.set(d.week, []);
    byWeek.get(d.week)!.push(d);
  }

  return (
    <>
      <PageHeader
        title={meso.name}
        subtitle={`${meso.weeksCount} weeks · ${meso.daysPerWeek} days/wk · ${meso.unit}`}
      >
        <div className="flex items-center gap-3">
          <StatusPill status={meso.status} />
          <MesoActions mesoKey={meso.key} archived={meso.status === "archived"} />
        </div>
      </PageHeader>

      {meso.priorities.length > 0 && (
        <div className="card mb-6 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Priorities</div>
          <div className="flex flex-wrap gap-2">
            {meso.priorities.map((p) => (
              <span key={p.id} className="chip" style={{ borderColor: mgColor(p.muscleGroup.name) }}>
                <MgDot color={mgColor(p.muscleGroup.name)} />
                {p.muscleGroup.name} · {p.priority}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {[...byWeek.entries()].map(([week, days]) => (
          <div key={week}>
            <div className="mb-2 text-sm font-semibold text-muted">Week {week + 1}</div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {days.map((d) => {
                const mgs = [...new Set(d.exercises.map((e) => e.muscleGroup.name))];
                return (
                  <Link
                    key={d.id}
                    href={`/mesocycles/${meso.key}/${d.week}/${d.position}`}
                    className="card p-3 transition-colors hover:border-accent-dim"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">
                        Day {d.position + 1}
                        {d.label ? <span className="text-muted"> · {d.label}</span> : ""}
                      </span>
                      <StatusPill status={d.status} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {mgs.map((m) => (
                        <MgDot key={m} color={mgColor(m)} />
                      ))}
                      <span className="ml-1 text-xs text-muted">{d.exercises.length} exercises</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
