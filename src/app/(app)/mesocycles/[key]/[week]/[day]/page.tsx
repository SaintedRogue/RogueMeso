import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { getDay, getDaySuggestions, getMuscleGroups } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { DayView } from "@/components/DayView";
import { DayMenu } from "@/components/DayMenu";
import { PageHeader, StatusPill } from "@/components/ui";

export default async function DayPage({
  params,
}: {
  params: Promise<{ key: string; week: string; day: string }>;
}) {
  const me = await requireUser();
  const { key, week, day } = await params;
  const wk = Number(week);
  const pos = Number(day);
  const d = await getDay(key, wk, pos, me.id);
  if (!d) notFound();
  const muscleGroups = await getMuscleGroups();

  const meso = d.meso;
  // Carry the same day from last week forward as a shaded target until the user logs.
  const suggestions = await getDaySuggestions(key, wk, pos, meso.weeksCount, me.id, d.exercises);
  const prev = pos > 0 ? `/mesocycles/${key}/${wk}/${pos - 1}` : null;
  const next = pos + 1 < meso.daysPerWeek ? `/mesocycles/${key}/${wk}/${pos + 1}` : null;
  const prevWeek = wk > 0 ? `/mesocycles/${key}/${wk - 1}/${pos}` : null;
  const nextWeek = wk + 1 < meso.weeksCount ? `/mesocycles/${key}/${wk + 1}/${pos}` : null;

  return (
    <>
      <PageHeader
        title={`Week ${wk + 1} · Day ${pos + 1}`}
        subtitle={`${meso.name}${d.label ? ` · ${d.label}` : ""}`}
      >
        <div className="flex items-center gap-2">
          <StatusPill status={d.status} />
          {d.exercises.length > 0 && (
            <DayMenu mesoKey={key} week={wk} position={pos} done={d.status === "complete"} />
          )}
        </div>
      </PageHeader>

      <div className="mb-4 flex items-center justify-between text-sm">
        <div className="flex gap-2">
          {prevWeek && <Link href={prevWeek} className="chip chip-nav hover:text-text"><ChevronUp aria-hidden size={14} />prev week</Link>}
          {nextWeek && <Link href={nextWeek} className="chip chip-nav hover:text-text"><ChevronDown aria-hidden size={14} />next week</Link>}
        </div>
        <div className="flex gap-2">
          {prev && <Link href={prev} className="chip chip-nav hover:text-text"><ChevronLeft aria-hidden size={14} />day {pos}</Link>}
          {next && <Link href={next} className="chip chip-nav hover:text-text">day {pos + 2}<ChevronRight aria-hidden size={14} /></Link>}
        </div>
      </div>

      <DayView
        day={d}
        meso={{ key, name: meso.name, weeksCount: meso.weeksCount, unit: meso.unit }}
        muscleGroups={muscleGroups}
        suggestions={suggestions}
        physicalTherapyLens={me.physicalTherapyLens}
      />
    </>
  );
}
