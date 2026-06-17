import type { ReadinessLabel } from "@/lib/features/recovery";

const COLOR_CLASS: Record<string, string> = {
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
};

/**
 * Advisory readiness readout. Shows the 0–100 score, band label, and the inputs behind it.
 * Purely informational — it never changes programmed training. Renders an empty-ish prompt
 * when there's no check-in yet.
 */
export function ReadinessCard({
  score,
  label,
  sleepHours,
  soreness,
  energy,
  logged,
}: {
  score: number | null;
  label: ReadinessLabel | null;
  sleepHours: number | null;
  soreness: number | null;
  energy: number | null;
  logged: boolean;
}) {
  if (score == null || label == null) {
    return (
      <div className="card p-6">
        <div className="text-sm font-medium text-muted">Readiness</div>
        <p className="mt-2 text-sm text-muted">
          Log a check-in below to see your advisory readiness score. It reflects how recovered you
          feel — it never changes your programmed sets or RIR.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-muted">Readiness {logged ? "· today" : "· last check-in"}</span>
        <span className="chip" style={{ borderColor: "var(--color-line-2)" }}>{label.label}</span>
      </div>
      <div className={`text-4xl font-bold num ${COLOR_CLASS[label.color] ?? ""}`}>
        {score}
        <span className="text-base font-normal text-muted">/100</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <Metric label="Sleep" value={sleepHours != null ? `${sleepHours}h` : "—"} />
        <Metric label="Soreness" value={soreness != null ? `${soreness}/5` : "—"} />
        <Metric label="Energy" value={energy != null ? `${energy}/5` : "—"} />
      </div>
      <p className="mt-4 text-xs text-muted">
        Advisory only — a recovery signal, not a change to your training plan.
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-panel-2 p-3">
      <div className="num text-lg font-semibold">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
