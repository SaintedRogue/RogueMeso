import { HeartPulse, Moon } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { computeRecovery, type RecoveryCategory } from "@/lib/features/recovery";
import { PageHeader, EmptyState } from "@/components/ui";
import { ReadinessCard } from "@/components/recovery/ReadinessCard";
import { CheckInForm } from "@/components/recovery/CheckInForm";
import { RoutineCard } from "@/components/recovery/RoutineCard";

const CATEGORY_META: Record<RecoveryCategory, { label: string; blurb: string }> = {
  active_recovery: {
    label: "Active recovery",
    blurb: "Light movement (walk, easy cycle, gentle flow) — eases soreness without adding fatigue. Best on off days.",
  },
  foam_rolling: {
    label: "Foam rolling",
    blurb: "Self-myofascial release after training. The soreness benefit is small but grows from 24h, with no downside.",
  },
  mobility: {
    label: "Mobility & yoga",
    blurb: "Range-of-motion work for moving better — not a soreness cure (see the note on each routine).",
  },
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

        <section className="space-y-6">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <HeartPulse aria-hidden size={16} className="text-accent" />
              <h2 className="font-semibold">Recovery library</h2>
            </div>
            <p className="text-sm text-muted">{context} Browse all options below and pick whatever fits.</p>
          </div>

          {r.library.length ? (
            r.library.map((group) => {
              const meta = CATEGORY_META[group.category];
              const suggested = group.category === r.suggestedCategory;
              return (
                <div key={group.category}>
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{meta.label}</h3>
                    {suggested && (
                      <span className="chip text-accent" style={{ borderColor: "var(--color-accent)" }}>
                        Suggested today
                      </span>
                    )}
                  </div>
                  <p className="mb-3 text-sm text-muted">{meta.blurb}</p>
                  <div className="space-y-3">
                    {group.routines.map((routine) => (
                      <RoutineCard key={routine.id} routine={routine} />
                    ))}
                  </div>
                </div>
              );
            })
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
