import Link from "next/link";
import { ArrowRight, Gauge, Target, CheckCircle2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { computeBodyTuning, type BodyTuningResult, type GoalProjection } from "@/lib/features/bodyTuning";
import { logWeight, setMesoGoal, setGoalWeight } from "@/lib/bodyTuningActions";
import { fmtWeight, fromKg } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/ui";
import { ToastForm, LocalTimeField } from "@/components/forms";
import { WeightChart, type WeightChartPoint } from "@/components/charts/WeightChart";
import { DateWeightEstimator } from "@/components/DateWeightEstimator";

const CONFIDENCE_COPY: Record<string, string> = {
  formula: "Formula estimate",
  personalizing: "Personalizing…",
  personalized: "Personalized",
};

export default async function BodyTuningPage() {
  const me = await requireUser();
  const bt = await computeBodyTuning(me.id, new Date());

  if (bt.needsProfile) {
    return (
      <>
        <PageHeader title="Body Tuning" subtitle="Calorie & macro targets" />
        <EmptyState
          icon={Gauge}
          title="Finish your profile first"
          hint="Add your height, sex, and birth date in Profile & Settings, then log a weigh-in below."
        />
        <div className="mt-4 max-w-lg">
          <WeighInForm unit={me.unit} />
          <p className="mt-3 text-sm text-muted">
            <Link href="/profile" className="inline-flex items-center gap-1 text-accent underline">Go to Profile &amp; Settings<ArrowRight aria-hidden size={14} /></Link>
          </p>
        </div>
      </>
    );
  }

  const m = bt.macros;
  const unit = me.unit;
  const toDisp = (kg: number) => Math.round(fromKg(kg, unit) * 10) / 10;

  // Main "Weight trend" chart shows ACTUAL data only — a far-out goal date must never compress it.
  const actual: WeightChartPoint[] = bt.trend.map((t) => ({
    ts: t.date.getTime(),
    weight: toDisp(t.weightKg),
    smoothed: toDisp(t.smoothedKg),
    projection: null,
  }));

  // Forecast for the dedicated projection chart: a dashed line from the latest weigh-in to the
  // farthest on-track goal (its slope crosses any nearer goal marker on the way).
  const onTrack = [bt.goals.cycle, bt.goals.longTerm].filter(
    (g): g is NonNullable<typeof g> => g != null && g.projection.status === "on-track" && g.projection.projectedDate != null,
  );
  const farthest = onTrack.sort(
    (a, b) => b.projection.projectedDate!.getTime() - a.projection.projectedDate!.getTime(),
  )[0];
  const goalLines = [
    bt.goals.cycle ? { label: "Block goal", weight: toDisp(bt.goals.cycle.goalKg) } : null,
    bt.goals.longTerm ? { label: "Long-term", weight: toDisp(bt.goals.longTerm.goalKg) } : null,
  ].filter((g): g is { label: string; weight: number } => g != null);
  // The projection chart shows only Logged → Projection (no EWMA line): the dashed forecast
  // continues straight from the last logged point to the goal, so the date matches the visual.
  const projChart =
    farthest && actual.length >= 2
      ? {
          data: [
            ...actual.map((p, i) => ({
              ts: p.ts,
              weight: p.weight,
              smoothed: null,
              projection: i === actual.length - 1 ? p.weight : null,
            })),
            {
              ts: farthest.projection.projectedDate!.getTime(),
              weight: null,
              smoothed: null,
              projection: toDisp(farthest.goalKg),
            },
          ] as WeightChartPoint[],
          goals: goalLines,
        }
      : null;

  // "What will I weigh on date X" estimator: same observed-rate extrapolation, anchored at the
  // latest weigh-in. Available once there's a trend to extrapolate from.
  const estimator =
    bt.latestWeightKg != null && bt.trend.length >= 2
      ? {
          latestWeight: toDisp(bt.latestWeightKg),
          ratePerWeek: Math.round(fromKg(bt.observedRateKg, unit) * 10) / 10,
        }
      : null;

  return (
    <>
      <PageHeader title="Body Tuning" subtitle="Calorie & macro targets" />

      <div className="max-w-2xl space-y-4">
        {/* Today's targets */}
        <div className="card p-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-muted">Daily target</span>
            <span className="rounded-full bg-panel-2 px-2 py-1 text-xs text-muted">
              {CONFIDENCE_COPY[bt.confidence]} · {bt.goal}
            </span>
          </div>
          <div className="text-3xl font-bold">{m.kcal.toLocaleString("en-US")} <span className="text-base font-normal text-muted">kcal</span></div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <Macro label="Protein" grams={m.proteinG} />
            <Macro label="Fat" grams={m.fatG} />
            <Macro label="Carbs" grams={m.carbG} />
          </div>
          <p className="mt-4 text-xs text-muted">
            Maintenance ≈ {bt.adjMaintenance.toLocaleString("en-US")} kcal · {bt.weeklySets} sets logged in the last 7 days.
          </p>
        </div>

        {/* Goal control (bound to active meso) */}
        {bt.mesoId != null && (
          <ToastForm
            action={setMesoGoal}
            submitLabel="Save goal"
            className="card flex flex-col gap-3 p-6 sm:flex-row sm:items-end sm:justify-between"
            submitClassName="btn-primary px-4 py-2 text-sm"
          >
            <input type="hidden" name="mesoId" value={bt.mesoId} />
            <div className="flex-1">
              <label htmlFor="nutritionGoal" className="mb-1 block text-sm font-medium text-muted">
                Goal for {bt.mesoName ?? "current block"}
              </label>
              <select id="nutritionGoal" name="nutritionGoal" defaultValue={bt.goal} className="input">
                <option value="maintain">Maintain</option>
                <option value="cut">Cut</option>
                <option value="bulk">Bulk</option>
              </select>
            </div>
            <div className="w-32">
              <label htmlFor="goalWeight" className="mb-1 block text-sm font-medium text-muted">
                Block goal ({unit})
              </label>
              <input
                id="goalWeight"
                name="goalWeight"
                type="number"
                step="0.1"
                min="0"
                defaultValue={bt.goals.cycle ? toDisp(bt.goals.cycle.goalKg) : ""}
                className="input"
                placeholder="optional"
              />
            </div>
          </ToastForm>
        )}

        {/* Quick weigh-in */}
        <WeighInForm unit={me.unit} />

        {/* Weight trend */}
        <div className="card p-6">
          <div className="mb-3 text-sm font-medium text-muted">
            Weight trend {bt.latestWeightKg != null && (
              <span className="text-text">· {fmtWeight(Math.round(fromKg(bt.latestWeightKg, me.unit) * 10) / 10, me.unit)}</span>
            )}
          </div>
          {actual.length >= 2 ? (
            <WeightChart data={actual} unit={unit} />
          ) : (
            <p className="text-sm text-muted">Log a few days of weight to see your trend and personalize targets.</p>
          )}
          <AmPmTable amPm={bt.amPm} unit={me.unit} />
        </div>

        {/* Goal weight & projection */}
        <GoalProjectionCard goals={bt.goals} observedRateKg={bt.observedRateKg} unit={unit} projChart={projChart} estimator={estimator} />
      </div>
    </>
  );
}

/** Average weigh-in weight split AM (before local noon) vs PM. Populates as the user logs with
 *  the time-capturing form; legacy entries (no captured time) simply aren't counted. */
function AmPmTable({
  amPm,
  unit,
}: {
  amPm: { am: { count: number; avgKg: number | null }; pm: { count: number; avgKg: number | null } };
  unit: string;
}) {
  const disp = (kg: number | null) => (kg == null ? null : Math.round(fromKg(kg, unit) * 10) / 10);
  const am = disp(amPm.am.avgKg);
  const pm = disp(amPm.pm.avgKg);

  if (amPm.am.count + amPm.pm.count === 0) {
    return (
      <p className="mt-4 text-xs text-muted">
        Log a weigh-in to start your AM vs PM breakdown — weighing in around the same time each day gives the cleanest trend.
      </p>
    );
  }

  const diff = am != null && pm != null ? Math.round((am - pm) * 10) / 10 : null;
  return (
    <div className="mt-5">
      <div className="mb-2 text-sm font-medium text-muted">AM vs PM average</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="py-1 font-normal">Time of day</th>
            <th className="py-1 font-normal">Weigh-ins</th>
            <th className="py-1 text-right font-normal">Avg weight</th>
          </tr>
        </thead>
        <tbody>
          <AmPmRow label="Morning (AM)" count={amPm.am.count} avg={am} unit={unit} />
          <AmPmRow label="Evening (PM)" count={amPm.pm.count} avg={pm} unit={unit} />
        </tbody>
      </table>
      {diff != null && (
        <p className="mt-2 text-xs text-muted">
          {diff === 0
            ? "No AM/PM difference so far."
            : `Mornings run ${fmtWeight(Math.abs(diff), unit)} ${diff < 0 ? "lighter" : "heavier"} than evenings on average.`}
        </p>
      )}
    </div>
  );
}

function AmPmRow({ label, count, avg, unit }: { label: string; count: number; avg: number | null; unit: string }) {
  return (
    <tr className="border-t border-line">
      <td className="py-1.5">{label}</td>
      <td className="py-1.5 text-muted">{count}</td>
      <td className="py-1.5 text-right">{avg != null ? fmtWeight(avg, unit) : "—"}</td>
    </tr>
  );
}

const disp = (kg: number, unit: string) => Math.round(fromKg(kg, unit) * 10) / 10;

/** Goal-weight setter (long-term) + trend-based projection readouts for both goal horizons. */
function GoalProjectionCard({
  goals,
  observedRateKg,
  unit,
  projChart,
  estimator,
}: {
  goals: BodyTuningResult["goals"];
  observedRateKg: number;
  unit: string;
  projChart: { data: WeightChartPoint[]; goals: { label: string; weight: number }[] } | null;
  estimator: { latestWeight: number; ratePerWeek: number } | null;
}) {
  return (
    <div className="card p-6">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted">
        <Target aria-hidden size={16} /> Weight goal &amp; projection
      </div>

      <ToastForm
        action={setGoalWeight}
        submitLabel="Save"
        className="flex items-end gap-3"
        submitClassName="btn-primary px-4 py-2 text-sm"
      >
        <div className="flex-1">
          <label htmlFor="goalWeightLong" className="mb-1 block text-sm font-medium text-muted">
            Long-term goal ({unit})
          </label>
          <input
            id="goalWeightLong"
            name="goalWeight"
            type="number"
            step="0.1"
            min="0"
            defaultValue={goals.longTerm ? disp(goals.longTerm.goalKg, unit) : ""}
            className="input"
            placeholder="e.g. 225"
          />
        </div>
      </ToastForm>

      {/* Dedicated forecast chart — its own time scale out to the goal date, so it never
          compresses the main trend chart above. */}
      {projChart && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-medium text-muted">Projected path to goal</div>
          <WeightChart data={projChart.data} goals={projChart.goals} unit={unit} />
        </div>
      )}

      {goals.cycle || goals.longTerm ? (
        <div className="mt-4 space-y-3">
          {goals.cycle && (
            <GoalRow label="Block goal" goal={goals.cycle} observedRateKg={observedRateKg} unit={unit} />
          )}
          {goals.longTerm && (
            <GoalRow label="Long-term goal" goal={goals.longTerm} observedRateKg={observedRateKg} unit={unit} />
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">
          Set a goal weight (and a block goal above) to see when you&apos;ll reach it at your current trend.
        </p>
      )}

      {estimator && (
        <DateWeightEstimator latestWeight={estimator.latestWeight} ratePerWeek={estimator.ratePerWeek} unit={unit} />
      )}
    </div>
  );
}

function GoalRow({
  label,
  goal,
  observedRateKg,
  unit,
}: {
  label: string;
  goal: { goalKg: number; projection: GoalProjection };
  observedRateKg: number;
  unit: string;
}) {
  const { projection } = goal;
  const toGo = Math.abs(disp(projection.deltaKg, unit));
  const pctWidth = projection.progressPct != null ? Math.round(Math.max(0, Math.min(1, projection.progressPct)) * 100) : null;
  const barColor =
    projection.status === "reached"
      ? "var(--color-good)"
      : projection.status === "on-track"
        ? "var(--color-accent)"
        : "var(--color-muted)";

  return (
    <div className="rounded-lg bg-panel-2 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-text">
          {label} · {fmtWeight(disp(goal.goalKg, unit), unit)}
        </span>
        {projection.status !== "reached" && (
          <span className="text-xs text-muted">{fmtWeight(toGo, unit)} to go</span>
        )}
      </div>

      {projection.status === "reached" ? (
        <div className="mt-1 flex items-center gap-1.5 text-sm text-good">
          <CheckCircle2 aria-hidden size={15} /> Goal reached
        </div>
      ) : projection.status === "insufficient" ? (
        <p className="mt-1 text-xs text-muted">Log a few more weigh-ins to project a date.</p>
      ) : projection.status === "off-track" ? (
        <p className="mt-1 text-xs text-muted">Not trending toward this goal yet — adjust your plan or keep logging.</p>
      ) : (
        <p className="mt-1 text-sm text-text">
          On trend ({fmtRate(observedRateKg, unit)}): ~{Math.max(1, Math.round(projection.weeksToGoal!))}{" "}
          {Math.max(1, Math.round(projection.weeksToGoal!)) === 1 ? "week" : "weeks"} ·{" "}
          {projection.projectedDate!.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </p>
      )}

      {pctWidth != null && (
        <div className="mt-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-panel">
            <div className="h-full rounded-full" style={{ width: `${pctWidth}%`, background: barColor }} />
          </div>
          <div className="mt-1 text-right text-xs text-muted">{pctWidth}% there</div>
        </div>
      )}
    </div>
  );
}

/** Signed weekly rate in the user's unit, e.g. "-1.1 lb/wk". */
function fmtRate(kgPerWeek: number, unit: string): string {
  const r = Math.round(fromKg(kgPerWeek, unit) * 10) / 10;
  return `${r > 0 ? "+" : ""}${r} ${unit}/wk`;
}

function Macro({ label, grams }: { label: string; grams: number }) {
  return (
    <div className="rounded-lg bg-panel-2 p-3">
      <div className="text-lg font-semibold">{grams}g</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

function WeighInForm({ unit }: { unit: string }) {
  return (
    <ToastForm
      action={logWeight}
      submitLabel="Log"
      className="card flex flex-col gap-3 p-6 sm:flex-row sm:items-end"
      submitClassName="btn-primary px-4 py-2 text-sm"
    >
      <LocalTimeField />
      <div className="flex-1">
        <label htmlFor="weight" className="mb-1 block text-sm font-medium text-muted">Today&apos;s weight ({unit})</label>
        <input id="weight" name="weight" type="number" step="0.1" min="0" required className="input" placeholder={unit === "kg" ? "80.0" : "176.0"} />
      </div>
      <div className="w-28">
        <label htmlFor="bodyFatPct" className="mb-1 block text-sm font-medium text-muted">Body fat %</label>
        <input id="bodyFatPct" name="bodyFatPct" type="number" step="0.1" min="0" max="70" className="input" placeholder="optional" />
      </div>
    </ToastForm>
  );
}
