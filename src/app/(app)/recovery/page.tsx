import { HeartPulse, Moon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { computeRecovery, type RecoveryCategory } from "@/lib/features/recovery";
import { PageHeader, EmptyState } from "@/components/ui";
import { ReadinessCard } from "@/components/recovery/ReadinessCard";
import { CheckInForm } from "@/components/recovery/CheckInForm";
import { RoutineCard } from "@/components/recovery/RoutineCard";

const CATEGORY_LABEL: Record<RecoveryCategory, string> = {
  active_recovery: "Active recovery",
  foam_rolling: "Foam rolling",
  mobility: "Mobility & yoga",
};

export default async function RecoveryPage() {
  const me = await requireUser();
  const r = await computeRecovery(me.id, new Date());

  const context = r.isDeload
    ? "You're in a deload week — mobility work to move well while you shed load."
    : r.isTrainingDay
      ? "Training day — foam rolling to ease soreness once you've lifted."
      : "Off day — light active recovery to reduce soreness without adding fatigue.";

  return (
    <>
      <PageHeader title="Recovery" subtitle="Readiness & active-recovery routines" />

      <div className="max-w-2xl space-y-4">
        <ReadinessCard
          score={r.score}
          label={r.label}
          sleepHours={r.latestEntry?.sleepHours ?? null}
          soreness={r.latestEntry?.soreness ?? null}
          energy={r.latestEntry?.energy ?? null}
          logged={r.todayLogged}
        />

        <CheckInForm today={r.todayLogged ? r.latestEntry : null} />

        {r.suggestSleepExtension && (
          <p className="card flex items-start gap-2 p-4 text-sm text-muted">
            <Moon aria-hidden size={16} className="mt-0.5 shrink-0 text-info" />
            <span>
              You logged under 8h. Even an extra 30–60 min helps recovery — under-sleep makes the
              same training load feel harder. <span className="text-xs">(PMC11996801)</span>
            </span>
          </p>
        )}

        <section>
          <div className="mb-2 flex items-center gap-2">
            <HeartPulse aria-hidden size={16} className="text-accent" />
            <h2 className="font-semibold">Suggested today · {CATEGORY_LABEL[r.suggestedCategory]}</h2>
          </div>
          <p className="mb-3 text-sm text-muted">{context}</p>

          {r.routines.length ? (
            <div className="space-y-3">
              {r.routines.map((routine) => (
                <RoutineCard key={routine.id} routine={routine} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={HeartPulse}
              title="No routines yet"
              hint="The recovery routine library loads on deploy. Check back after the next update."
            />
          )}
        </section>
      </div>
    </>
  );
}
