import { Clock, ShieldAlert } from "lucide-react";
import type { RecoveryRoutineView } from "@/lib/features/recovery";

const FOCUS_LABEL: Record<string, string> = {
  full_body: "Full body",
  lower: "Lower body",
  upper: "Upper body",
  posterior: "Posterior chain",
};

/** Human-friendly duration for a step ("45s", "1m", "1m 30s"). */
function fmtStep(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

/**
 * A curated recovery routine: header (name, duration, focus), rationale + citation, an
 * expandable step list, and — for mobility routines — the ROM-only guardrail. Server-rendered;
 * the step list uses a native <details> so it needs no client JS.
 */
export function RoutineCard({ routine }: { routine: RecoveryRoutineView }) {
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{routine.name}</h3>
          <div className="mt-1 text-xs text-muted">{FOCUS_LABEL[routine.bodyFocus] ?? routine.bodyFocus}</div>
        </div>
        <span className="chip inline-flex items-center gap-1">
          <Clock aria-hidden size={13} />
          {routine.durationMin} min
        </span>
      </div>

      <p className="mt-3 text-sm text-muted">{routine.rationale}</p>

      {routine.guardrail && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-panel-2 p-3 text-xs text-warn">
          <ShieldAlert aria-hidden size={14} className="mt-0.5 shrink-0" />
          <span>{routine.guardrail}</span>
        </p>
      )}

      <details className="mt-3 group">
        <summary className="cursor-pointer text-sm font-medium text-accent">
          {routine.steps.length} steps
        </summary>
        <ol className="mt-2 space-y-2">
          {routine.steps.map((step, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 border-b border-line/40 pb-2 last:border-0">
              <div>
                <span className="text-sm">{step.movement}</span>
                {step.cue && <p className="text-xs text-muted">{step.cue}</p>}
              </div>
              <span className="num shrink-0 text-xs text-muted">{fmtStep(step.durationSec)}</span>
            </li>
          ))}
        </ol>
      </details>

      <p className="mt-3 text-[11px] text-muted">Evidence: {routine.citation}</p>
    </div>
  );
}
