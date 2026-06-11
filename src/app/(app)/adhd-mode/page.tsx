import { requireUser } from "@/lib/auth";
import { getOrCreateSchedule, getHabitConfigMap } from "@/lib/features/adhdData";
import { PageHeader } from "@/components/ui";
import { PushEnableCard } from "@/components/adhd/PushEnableCard";
import { ScheduleForm } from "@/components/adhd/ScheduleForm";
import { HabitSettings } from "@/components/adhd/HabitSettings";

export default async function AdhdModePage() {
  const me = await requireUser();
  const [schedule, configMap] = await Promise.all([getOrCreateSchedule(me.id), getHabitConfigMap(me.id)]);

  const configs = Object.fromEntries(
    [...configMap.entries()].map(([key, v]) => [key, { enabled: v.enabled, params: v.params }]),
  );

  return (
    <>
      <PageHeader title="ADHD Mode" subtitle="Push reminders for the habits that move the needle" />

      <div className="max-w-2xl space-y-8">
        <PushEnableCard globalEnabled={schedule.globalEnabled} />

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Your day</h2>
          <ScheduleForm
            wakeHHMM={schedule.wakeHHMM}
            bedtimeHHMM={schedule.bedtimeHHMM}
            workoutHHMM={schedule.workoutHHMM}
            mealsPerDay={schedule.mealsPerDay}
          />
          <p className="mt-2 text-xs text-muted">
            Every reminder is timed from these anchors — e.g. caffeine fires before your workout and cuts off well
            before bed.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Reminders</h2>
          <HabitSettings configs={configs} />
        </section>
      </div>
    </>
  );
}
