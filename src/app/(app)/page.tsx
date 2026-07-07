import Link from "next/link";
import { ArrowRight, Dumbbell, HeartPulse } from "lucide-react";
import { cookies } from "next/headers";
import { getActiveMeso, getDay, getDaySuggestions, getMuscleGroups, getSessionContext, getSessionHrView } from "@/lib/data";
import { getLatestReadiness, readinessLabel } from "@/lib/features/recovery";
import { pickHomeDay } from "@/lib/homeDay";
import { requireUser } from "@/lib/auth";
import { DayView } from "@/components/DayView";
import { PageHeader, StatusPill, ActiveBadge, EmptyState } from "@/components/ui";

export default async function Home() {
  const me = await requireUser();
  const active = await getActiveMeso(me.id);
  if (!active) {
    return (
      <>
        <PageHeader title="Current workout" />
        <EmptyState
          icon={Dumbbell}
          title="No mesocycles yet"
          hint="Create one from a template to start training, or import your history."
        />
      </>
    );
  }

  // Pick the day from the shallow status list, then deep-load only that day. After finishing a
  // session we stay on it for the rest of the user's local day (so the completion state + survey
  // are visible) and only then advance; `next` is the upcoming workout for "Start next workout".
  const tzCookie = (await cookies()).get("tzoffset")?.value;
  const offsetMin = Number.isFinite(Number(tzCookie)) ? Number(tzCookie) : new Date().getTimezoneOffset();
  const toLocalDate = (d: Date) => new Date(d.getTime() - offsetMin * 60000).toISOString().slice(0, 10);
  const { current, next } = pickHomeDay(active.days, toLocalDate(new Date()), toLocalDate);
  if (!current) return null;
  const day = await getDay(active.key, current.week, current.position, me.id);
  if (!day) return null;
  const nextWorkout = next
    ? {
        href: `/mesocycles/${active.key}/${next.week}/${next.position}`,
        label: `Week ${next.week + 1} · Day ${next.position + 1}${next.label ? ` · ${next.label}` : ""}`,
      }
    : null;
  const muscleGroups = await getMuscleGroups();

  // Advisory recovery nudge: only surfaced when the latest check-in flags low readiness.
  // Purely informational — it links to the Recovery hub and never alters the day's targets.
  const readiness = await getLatestReadiness(me.id);
  const lowReadiness = readiness != null && readiness.score < 60;

  // Carry the same day from last week forward as a shaded target until the user logs.
  const suggestions = await getDaySuggestions(
    active.key,
    current.week,
    current.position,
    active.weeksCount,
    me.id,
    me.unit,
    day.exercises,
  );

  // Physical Therapy Lens: this session's pre/post check-in + last session's symptoms for context.
  const { checkIn, lastSession } = await getSessionContext(day.id, me.physicalTherapyLens);

  // Session heart rate captured live over BLE, when there's enough to chart.
  const hr = await getSessionHrView(day.id, me);

  return (
    <>
      <PageHeader
        title={active.name}
        subtitle={`Week ${current.week + 1} of ${active.weeksCount} · Day ${current.position + 1}${
          current.label ? ` · ${current.label}` : ""
        }`}
      >
        <div className="flex items-center gap-2">
          {active.activeAt && <ActiveBadge />}
          <StatusPill status={current.status} />
          <Link
            href={`/mesocycles/${active.key}`}
            className="chip hover:border-accent-dim hover:text-text"
          >
            Full plan<ArrowRight aria-hidden size={14} />
          </Link>
        </div>
      </PageHeader>

      {lowReadiness && (
        <Link
          href="/recovery"
          className="mb-4 flex items-center gap-2 rounded-lg border border-line bg-panel-2/40 p-3 text-sm text-muted transition-colors hover:border-accent-dim"
        >
          <HeartPulse aria-hidden size={16} className="shrink-0 text-warn" />
          <span>
            Readiness <span className="num text-warn">{readiness!.score}/100</span> · {readinessLabel(readiness!.score).label}.
            Consider easing in today — see recovery options.
          </span>
          <ArrowRight aria-hidden size={14} className="ml-auto shrink-0" />
        </Link>
      )}

      <DayView
        day={day}
        meso={{ key: active.key, name: active.name, weeksCount: active.weeksCount, unit: active.unit }}
        muscleGroups={muscleGroups}
        suggestions={suggestions}
        physicalTherapyLens={me.physicalTherapyLens}
        checkIn={checkIn}
        lastSession={lastSession}
        nextWorkout={nextWorkout}
        hr={hr}
      />
    </>
  );
}
