import Link from "next/link";
import { getActiveMeso, getDay } from "@/lib/data";
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

  // Pick the current day from the shallow status list, then deep-load only that day.
  const current =
    active.days.find((d) => !["complete", "skipped"].includes(d.status)) ?? active.days[0];
  if (!current) return null;
  const day = await getDay(active.key, current.week, current.position, me.id);
  if (!day) return null;

  return (
    <>
      <PageHeader
        title={active.name}
        subtitle={`Week ${current.week + 1} of ${active.weeksCount} · Day ${current.position + 1}${
          current.label ? ` · ${current.label}` : ""
        }`}
      >
        <div className="flex items-center gap-2">
          <StatusPill status={current.status} />
          <Link
            href={`/mesocycles/${active.key}`}
            className="chip hover:border-accent-dim hover:text-text"
          >
            Full plan →
          </Link>
        </div>
      </PageHeader>

      <DayView day={day} meso={{ name: active.name, weeksCount: active.weeksCount, unit: active.unit }} />
    </>
  );
}
