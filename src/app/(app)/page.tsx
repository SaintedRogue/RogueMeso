import Link from "next/link";
import { getActiveMeso, getMesocycle } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { DayView } from "@/components/DayView";
import { PageHeader, StatusPill, EmptyState } from "@/components/ui";

export default async function Home() {
  const me = await requireUser();
  const active = await getActiveMeso(me.id);
  if (!active) {
    return (
      <>
        <PageHeader title="Current workout" />
        <EmptyState
          title="No mesocycles yet"
          hint="Create one from a template to start training, or import your history."
        />
      </>
    );
  }
  const meso = await getMesocycle(active.key, me.id);
  if (!meso) return null;

  const current =
    meso.days.find((d) => !["complete", "skipped"].includes(d.status)) ?? meso.days[0];

  return (
    <>
      <PageHeader
        title={meso.name}
        subtitle={`Week ${current.week + 1} of ${meso.weeksCount} · Day ${current.position + 1}${
          current.label ? ` · ${current.label}` : ""
        }`}
      >
        <div className="flex items-center gap-2">
          <StatusPill status={current.status} />
          <Link
            href={`/mesocycles/${meso.key}`}
            className="chip hover:border-accent-dim hover:text-text"
          >
            Full plan →
          </Link>
        </div>
      </PageHeader>

      <DayView day={current} meso={{ name: meso.name, weeksCount: meso.weeksCount, unit: meso.unit }} />
    </>
  );
}
