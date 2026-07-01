import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getInsightsMeso } from "@/lib/features/insights";
import {
  getPtSets,
  getPtPain,
  getWeeklyLoadVsReadiness,
  movementPatternBalance,
  pushPullRatio,
  acwr,
  acwrByPattern,
  symmetryByExercise,
  loadProgression,
  jointLoad,
  symptomFlags,
  recoveryVsLoad,
  ACWR,
  PUSH_PULL,
  SYMMETRY_FLAG_PCT,
  type RatioResult,
  type AcwrResult,
} from "@/lib/features/physicalTherapy";
import { fmtWeight, fromKg } from "@/lib/format";
import { PAIN_REGION_LABELS, type PainRegion } from "@/lib/features/physicalTherapyTaxonomy";
import { PageHeader, EmptyState } from "@/components/ui";
import { PhysicalTherapyDisclaimer } from "@/components/PhysicalTherapyDisclaimer";
import { PtBarChart } from "@/components/charts/PtBarChart";
import { PtProgressionChart } from "@/components/charts/PtProgressionChart";
import { PtRecoveryChart } from "@/components/charts/PtRecoveryChart";
import { PtSymptomChart } from "@/components/charts/PtSymptomChart";
import { Activity, ChevronLeft, GitCompareArrows, HeartPulse, ScatterChart, Scale, TrendingUp, Bone } from "lucide-react";

const PALETTE = ["#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#a855f7", "#ec4899", "#14b8a6", "#eab308", "#6366f1"];
const fmtVol = (n: number) => Math.round(n).toLocaleString();
const regionLabel = (r: string) => PAIN_REGION_LABELS[r as PainRegion] ?? r;

/** Position (0–100%) of a ratio on a 0→2 track, capped so extreme values still render on-bar. */
const pctOnTrack = (v: number) => Math.min(100, (Math.min(v, 2) / 2) * 100);

/** A small band bar: sweet-spot shaded, spike threshold marked, a dot at the current ratio. */
function AcwrBar({ result }: { result: AcwrResult }) {
  if (!result.ready) {
    return <p className="text-xs text-muted">Log ~3–4 weeks of training to unlock ACWR.</p>;
  }
  if (result.ratio == null) {
    return <p className="text-xs text-muted">No recent load in the chronic window yet.</p>;
  }
  const color = result.spike ? "var(--color-bad)" : result.inBand ? "var(--color-good)" : "var(--color-warn)";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="num text-sm" style={{ color }}>
          {result.ratio.toFixed(2)}
        </span>
        <span className="text-muted">
          acute {fmtVol(result.acute)} · chronic {fmtVol(result.chronic)}/wk
        </span>
      </div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-input">
        {/* sweet-spot band 0.8–1.3 */}
        <div
          className="absolute inset-y-0 bg-good/25"
          style={{ left: `${pctOnTrack(ACWR.low)}%`, right: `${100 - pctOnTrack(ACWR.high)}%` }}
        />
        {/* spike threshold marker */}
        <div className="absolute inset-y-0 w-px bg-bad/70" style={{ left: `${pctOnTrack(ACWR.spike)}%` }} />
        {/* current ratio */}
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-bg"
          style={{ left: `${pctOnTrack(result.ratio)}%`, background: color }}
        />
      </div>
    </div>
  );
}

function RatioRow({ label, r }: { label: string; r: RatioResult }) {
  const value = r.ratioBySets;
  const tone = !r.ready ? "text-muted" : r.flag ? "text-warn" : "text-good";
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className="flex items-center gap-2">
        <span className={`num ${tone}`}>{value == null ? "—" : value.toFixed(2)}</span>
        <span className="text-xs text-muted">
          {r.pushSets}:{r.pullSets} sets
        </span>
        {r.flag && (
          <span className="chip" style={{ color: "var(--color-warn)", borderColor: "var(--color-warn)" }}>
            check
          </span>
        )}
      </span>
    </div>
  );
}

export default async function PhysicalTherapyInsightsPage() {
  const me = await requireUser();
  // Gate: OFF is the default experience — this area does not exist for opted-out users.
  if (!me.physicalTherapyLens) redirect("/insights");

  const now = new Date();
  const meso = await getInsightsMeso(me.id);
  const [allSets, mesoSets, pain, weekly] = await Promise.all([
    getPtSets(me.id), // all history — ACWR, symmetry, joint load, progression, symptoms
    meso ? getPtSets(me.id, meso.id) : Promise.resolve([]), // current block — pattern balance
    getPtPain(me.id),
    getWeeklyLoadVsReadiness(me.id),
  ]);

  const balance = movementPatternBalance(mesoSets);
  const ratios = pushPullRatio(mesoSets);
  const acwrOverall = acwr(allSets, now);
  const acwrPatterns = acwrByPattern(allSets, now);
  const symmetry = symmetryByExercise(allSets);
  const patternProgression = loadProgression(allSets, "pattern");
  const joints = jointLoad(allSets);
  const flags = symptomFlags(pain, now);
  const recovery = recoveryVsLoad(weekly);

  const symmetryWithData = symmetry.filter((s) => s.result.index != null);
  const painPoints = pain.map((p) => ({ t: p.date.getTime(), score: p.score, region: p.region, exercise: p.exercise }));
  const inUnit = (kg: number) => fmtWeight(Math.round(fromKg(kg, me.unit)), me.unit);

  return (
    <>
      <PageHeader title="Physical Therapy Lens" subtitle="Load management & movement quality — informational only, not medical advice">
        <Link href="/insights" className="chip chip-nav hover:text-text">
          <ChevronLeft aria-hidden size={14} /> Insights
        </Link>
      </PageHeader>

      <PhysicalTherapyDisclaimer />

      {allSets.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No completed sets yet"
          hint="Log a few weeks of training (with side and any symptom notes) to populate these views."
        />
      ) : (
        <div className="space-y-8">
          {/* 1 · MOVEMENT-PATTERN BALANCE */}
          <section>
            <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
              <Scale aria-hidden size={18} className="text-accent" /> Movement-pattern balance
            </h2>
            <p className="mb-3 text-xs text-muted">Volume load by pattern for {meso ? meso.name : "your training"}.</p>
            {balance.length > 0 ? (
              <div className="card space-y-4 p-4">
                <PtBarChart data={balance.map((b) => ({ label: b.label, value: b.volume }))} colors={PALETTE} />
                <div className="border-t border-line/60 pt-2">
                  <RatioRow label="Push : pull (overall)" r={ratios.overall} />
                  <RatioRow label="Push : pull (horizontal)" r={ratios.horizontal} />
                  <p className="mt-1 text-xs text-muted">
                    Balanced band {PUSH_PULL.low}–{PUSH_PULL.high}. A persistent horizontal push{">"}pull tilt is
                    shoulder-health relevant.
                  </p>
                </div>
              </div>
            ) : (
              <EmptyState icon={Scale} title="No classified sets yet" hint="Log sets in this block to see the pattern split." />
            )}
          </section>

          {/* 2 · LOAD PROGRESSION */}
          <section>
            <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
              <TrendingUp aria-hidden size={18} className="text-accent" /> Load progression
            </h2>
            <p className="mb-3 text-xs text-muted">Weekly volume load per movement pattern, over time.</p>
            {patternProgression.some((s) => s.points.length >= 2) ? (
              <div className="card p-4">
                <PtProgressionChart
                  series={patternProgression
                    .filter((s) => s.points.length > 0)
                    .map((s, i) => ({ label: s.label, color: PALETTE[i % PALETTE.length], points: s.points }))}
                />
              </div>
            ) : (
              <EmptyState icon={TrendingUp} title="Not enough weeks yet" hint="Log across at least two weeks to chart progression." />
            )}
          </section>

          {/* 3 · ACWR */}
          <section>
            <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
              <Activity aria-hidden size={18} className="text-accent" /> Acute : chronic workload
            </h2>
            <p className="mb-3 text-xs text-muted">
              Last 7 days vs. your 28-day weekly average. A spike ({">"}
              {ACWR.spike}) means load jumped faster than you&apos;ve adapted to — a heuristic, not a diagnosis.
            </p>
            <div className="card space-y-4 p-4">
              <div>
                <div className="mb-1 text-xs font-medium text-muted">Overall</div>
                <AcwrBar result={acwrOverall} />
                {acwrOverall.ready && acwrOverall.spike && (
                  <p className="mt-2 text-xs text-bad">Workload spike — consider easing the next few sessions.</p>
                )}
              </div>
              {acwrPatterns.filter((p) => p.result.ready && p.result.ratio != null).length > 0 && (
                <div className="border-t border-line/60 pt-3">
                  <div className="mb-2 text-xs font-medium text-muted">By pattern</div>
                  <div className="space-y-3">
                    {acwrPatterns
                      .filter((p) => p.result.ready && p.result.ratio != null)
                      .map((p) => (
                        <div key={p.pattern}>
                          <div className="mb-1 text-xs">{p.label}</div>
                          <AcwrBar result={p.result} />
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* 4 · LEFT/RIGHT SYMMETRY */}
          <section>
            <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
              <GitCompareArrows aria-hidden size={18} className="text-accent" /> Left / right symmetry
            </h2>
            <p className="mb-3 text-xs text-muted">
              Best-set load per side on unilateral lifts. Flagged beyond {SYMMETRY_FLAG_PCT}% difference.
            </p>
            {symmetryWithData.length > 0 ? (
              <div className="card divide-y divide-line/60">
                {symmetryWithData.map(({ exercise, result }) => (
                  <div key={exercise} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span>{exercise}</span>
                    <span className="flex items-center gap-3 text-xs text-muted">
                      <span className="num">
                        L {inUnit(result.left!)} · R {inUnit(result.right!)}
                      </span>
                      <span className={`num ${result.flag ? "text-warn" : "text-good"}`}>{result.index!.toFixed(0)}%</span>
                      {result.flag && (
                        <span className="chip" style={{ color: "var(--color-warn)", borderColor: "var(--color-warn)" }}>
                          {result.strong} stronger
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={GitCompareArrows}
                title="No per-side data yet"
                hint="Log unilateral sets with Left / Right selected to compare sides."
              />
            )}
          </section>

          {/* 5 · RECOVERY VS LOAD */}
          <section>
            <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
              <HeartPulse aria-hidden size={18} className="text-accent" /> Recovery vs. load
            </h2>
            <p className="mb-3 text-xs text-muted">Weekly training volume against your recovery-readiness score.</p>
            {weekly.some((w) => w.readiness != null) ? (
              <div className="card space-y-3 p-4">
                <PtRecoveryChart data={weekly} />
                {recovery.flag && (
                  <p className="text-xs text-warn">
                    Load has been rising while readiness falls over the last few weeks — a classic under-recovery
                    pattern. Consider a lighter week.
                  </p>
                )}
              </div>
            ) : (
              <EmptyState
                icon={HeartPulse}
                title="No readiness data yet"
                hint="Log daily readiness check-ins in Recovery to overlay them with training load."
              />
            )}
          </section>

          {/* 6 · SYMPTOM TIMELINE */}
          <section>
            <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
              <ScatterChart aria-hidden size={18} className="text-accent" /> Symptom timeline
            </h2>
            <p className="mb-3 text-xs text-muted">Pain reports over time, filterable by region and exercise.</p>
            {painPoints.length > 0 ? (
              <div className="card space-y-3 p-4">
                <PtSymptomChart points={painPoints} />
                {flags.length > 0 && (
                  <div className="space-y-1 border-t border-line/60 pt-2 text-xs">
                    {flags.map((f, i) => (
                      <p key={i} className="text-warn">
                        {f.kind === "recurring"
                          ? `${regionLabel(f.region)} pain logged in ${f.sessions} sessions recently.`
                          : `${regionLabel(f.region)} pain trending up (+${f.scoreChange}).`}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <EmptyState
                icon={ScatterChart}
                title="No symptoms logged"
                hint="Add pain, a body region and timing in the Movement & symptoms panel while logging."
              />
            )}
          </section>

          {/* 7 · JOINT / TISSUE LOAD */}
          <section>
            <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
              <Bone aria-hidden size={18} className="text-accent" /> Joint / tissue load
            </h2>
            <p className="mb-3 text-xs text-muted">
              Cumulative volume load per primary joint — most useful cross-referenced with symptom locations.
            </p>
            {joints.length > 0 ? (
              <div className="card p-4">
                <PtBarChart data={joints.map((j) => ({ label: j.label, value: j.volume }))} colors={PALETTE} />
              </div>
            ) : (
              <EmptyState icon={Bone} title="No joint data yet" hint="Classified exercises attribute their volume to joints here." />
            )}
          </section>
        </div>
      )}
    </>
  );
}
