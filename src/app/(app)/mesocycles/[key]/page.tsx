import Link from "next/link";
import { notFound } from "next/navigation";
import { getMesocycle } from "@/lib/data";
import { PageHeader, StatusPill, ActiveBadge, MgDot } from "@/components/ui";
import { MesoMenu } from "@/components/MesoMenu";
import { MesoPriorities } from "@/components/MesoPriorities";
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
        <div className="flex items-center gap-2">
          {meso.activeAt && <ActiveBadge />}
          <StatusPill status={meso.status} />
          <MesoMenu mesoKey={meso.key} name={meso.name} status={meso.status} isActive={meso.activeAt != null} />
        </div>
      </PageHeader>

      {meso.priorities.length > 0 && (
        <MesoPriorities
          mesoKey={meso.key}
          weeksCount={meso.weeksCount}
          priorities={meso.priorities.map((p) => ({
            muscleGroupId: p.muscleGroupId,
            name: p.muscleGroup.name,
            priority: p.priority,
          }))}
        />
      )}

      {/* Break the week rows out of the shared max-w-5xl shell to fill <main>, so all
          days of a week sit side by side on desktop. Centered on main (not the viewport)
          via left-1/2 + an explicit width that accounts for the 240px (w-60) sidebar. */}
      <section className="relative left-1/2 w-screen -translate-x-1/2 space-y-5 px-4 sm:w-[calc(100vw-15rem)] sm:px-8">
        {[...byWeek.entries()].map(([week, days]) => (
          <div key={week}>
            <div className="mb-2 text-sm font-semibold text-muted">Week {week + 1}</div>
            {/* flex-1 + min-w lets days fill the row when they fit and hold a readable
                width (scrolling the row) when there are too many to fit. */}
            <div className="flex gap-3 overflow-x-auto pb-1">
              {days.map((d) => (
                <Link
                  key={d.id}
                  href={`/mesocycles/${meso.key}/${d.week}/${d.position}`}
                  className="card flex min-w-[15rem] flex-1 flex-col p-3 transition-colors hover:border-accent-dim"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">
                      Day {d.position + 1}
                      {d.label ? <span className="text-muted"> · {d.label}</span> : ""}
                    </span>
                    <StatusPill status={d.status} />
                  </div>
                  {d.exercises.length > 0 ? (
                    <ul className="mt-2.5 space-y-1.5">
                      {d.exercises.map((e) => (
                        <li key={e.id} className="flex items-center gap-2 text-xs">
                          <MgDot color={mgColor(e.muscleGroup.name)} />
                          <span className="truncate">{e.exercise.name}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2.5 text-xs text-muted">No exercises</p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
