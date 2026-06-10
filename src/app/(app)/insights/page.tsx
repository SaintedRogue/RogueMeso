import { requireUser } from "@/lib/auth";
import { getMesocycles } from "@/lib/data";
import {
  getInsightsMeso,
  getVolumeData,
  getLoggedExercises,
  getExerciseHistory,
  getPersonalRecords,
} from "@/lib/features/insights";
import { MEV_SETS, MRV_SETS } from "@/lib/progression";
import { mgColor, fmtWeight } from "@/lib/format";
import { Trophy, BarChart3, LineChart } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui";
import { VolumeChart, type WeekDatum } from "@/components/charts/VolumeChart";
import { HistoryChart } from "@/components/charts/HistoryChart";

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ meso?: string; ex?: string }>;
}) {
  const me = await requireUser();
  const sp = await searchParams;

  const [mesos, meso, logged, prs] = await Promise.all([
    getMesocycles(me.id),
    getInsightsMeso(me.id, sp.meso),
    getLoggedExercises(me.id),
    getPersonalRecords(me.id, new Date()),
  ]);

  // `sp.ex` is untrusted: a non-numeric value would parse to NaN and hit the DB. Guard it.
  const exIdRaw = sp.ex ? Number(sp.ex) : NaN;
  const exId = Number.isFinite(exIdRaw) ? exIdRaw : logged[0]?.id;

  // Volume and history depend only on the Promise.all results above and are independent
  // of each other — fetch them together rather than in a serial waterfall.
  const [volume, historyRaw] = await Promise.all([
    meso ? getVolumeData(me.id, meso.id, meso.weeksCount) : Promise.resolve([] as Awaited<ReturnType<typeof getVolumeData>>),
    exId ? getExerciseHistory(me.id, exId) : Promise.resolve([] as Awaited<ReturnType<typeof getExerciseHistory>>),
  ]);

  // --- Volume: shape per-muscle weekly arrays into per-week records for the chart ---
  const muscleColors: Record<string, string> = Object.fromEntries(
    volume.map((v) => [v.muscleGroup, mgColor(v.muscleGroup)]),
  );
  const weekData: WeekDatum[] = Array.from({ length: meso?.weeksCount ?? 0 }, (_, w) => {
    const row: WeekDatum = { week: `W${w + 1}` };
    for (const v of volume) row[v.muscleGroup] = v.perWeek[w] ?? 0;
    return row;
  });
  const hasVolume = volume.length > 0;

  // --- History: serialize dates to strings for the client chart component ---
  const history = historyRaw.map((h) => ({
    date: h.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    oneRm: h.oneRm,
  }));

  return (
    <>
      <PageHeader title="Insights" subtitle="Volume, progress, and records from your logged sets" />

      {/* 1 · WEEKLY VOLUME */}
      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Weekly volume per muscle</h2>
          {mesos.length > 0 && (
            <form className="flex items-center gap-2">
              {exId && <input type="hidden" name="ex" value={String(exId)} />}
              <select name="meso" defaultValue={meso?.key} className="input">
                {mesos.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn-primary">
                View
              </button>
            </form>
          )}
        </div>
        {hasVolume ? (
          <div className="card p-4">
            <p className="mb-3 text-xs text-muted">
              Sets per week vs. engine landmarks — MEV {MEV_SETS} (green) · MRV {MRV_SETS} (red).
            </p>
            <VolumeChart data={weekData} muscleColors={muscleColors} mev={MEV_SETS} mrv={MRV_SETS} />
          </div>
        ) : (
          <EmptyState icon={BarChart3} title="No completed sets yet" hint="Log some sets in a mesocycle to see weekly volume." />
        )}
      </section>

      {/* 2 · EXERCISE HISTORY */}
      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Exercise history</h2>
          {logged.length > 0 && (
            <form className="flex items-center gap-2">
              {meso?.key && <input type="hidden" name="meso" value={meso.key} />}
              <select name="ex" defaultValue={String(exId ?? "")} className="input">
                {logged.map((e) => (
                  <option key={e.id} value={String(e.id)}>
                    {e.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn-primary">
                View
              </button>
            </form>
          )}
        </div>
        {history.length > 0 ? (
          <div className="card p-4">
            <p className="mb-3 text-xs text-muted">Estimated 1RM (Epley) per completed set, over time.</p>
            <HistoryChart data={history} />
          </div>
        ) : (
          <EmptyState icon={LineChart} title="No history yet" hint="Complete sets of an exercise to chart its estimated 1RM." />
        )}
      </section>

      {/* 3 · PERSONAL RECORDS */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Personal records</h2>
        {prs.length > 0 ? (
          <div className="card divide-y divide-line/60">
            {prs.map((pr) => (
              <div key={pr.exercise} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <Trophy aria-hidden size={16} className="shrink-0 text-accent" />
                  <span className="text-sm">{pr.exercise}</span>
                  {pr.isNew && (
                    <span className="chip" style={{ color: "var(--color-good)", borderColor: "var(--color-good)" }}>
                      New
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted">
                  <span>
                    {fmtWeight(pr.weight, me.unit)} × {pr.reps}
                  </span>
                  <span className="text-accent">~{pr.oneRm} 1RM</span>
                  <span>{pr.date.toLocaleDateString("en-US")}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Trophy} title="No records yet" hint="Your best estimated 1RM per exercise will appear here." />
        )}
      </section>
    </>
  );
}
