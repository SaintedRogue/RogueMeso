import Link from "next/link";
import { ArrowRight, Gauge } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { computeBodyTuning } from "@/lib/features/bodyTuning";
import { logWeight, setMesoGoal } from "@/lib/bodyTuningActions";
import { fmtWeight, fromKg } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/ui";
import { ToastForm, LocalTimeField } from "@/components/forms";
import { WeightChart } from "@/components/charts/WeightChart";

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
  const chartData = bt.trend.map((t) => ({
    date: t.date.toLocaleDateString("en-US", { timeZone: "UTC" }),
    weight: Math.round(fromKg(t.weightKg, me.unit) * 10) / 10,
    smoothed: Math.round(fromKg(t.smoothedKg, me.unit) * 10) / 10,
  }));

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
          {chartData.length >= 2 ? (
            <WeightChart data={chartData} />
          ) : (
            <p className="text-sm text-muted">Log a few days of weight to see your trend and personalize targets.</p>
          )}
          <AmPmTable amPm={bt.amPm} unit={me.unit} />
        </div>
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
