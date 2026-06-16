import { setRampPreview } from "@/lib/progression";
import { PRIORITY_META } from "@/lib/priorities";

/**
 * Expandable "How volume works" panel. Explains what the three volume priorities do by showing
 * the ACTUAL per-week set ramp for this block (derived from the same engine that generates a
 * meso), plus the RIR/deload note. Pure + presentational — reused by the template builder
 * (example block) and the live-meso priority editor (the real block).
 */
export function VolumeExplainer({ weeksCount }: { weeksCount: number }) {
  const lastWeek = weeksCount - 1;
  return (
    <details className="rounded-md border border-line/60 bg-bg/40 text-sm">
      <summary className="cursor-pointer select-none px-3 py-2 font-medium text-muted hover:text-text">
        How volume works
      </summary>
      <div className="space-y-3 border-t border-line/60 px-3 py-3 text-muted">
        <p>
          Each muscle group&apos;s <span className="text-text">priority</span> sets how its weekly
          volume ramps across the block. Planned sets per week (this {weeksCount}-week block):
        </p>
        <div className="space-y-1.5">
          {PRIORITY_META.map((o) => {
            const ramp = setRampPreview(o.value, weeksCount);
            return (
              <div key={o.value} className="flex items-baseline gap-3">
                <span className="w-20 shrink-0 text-text">{o.label}</span>
                <span className="num flex flex-wrap gap-1.5">
                  {ramp.map((n, w) => (
                    <span
                      key={w}
                      className={w === lastWeek ? "rounded bg-line/50 px-1.5 text-muted" : "px-1.5 text-text"}
                      title={w === lastWeek ? "deload week" : `week ${w + 1}`}
                    >
                      {n}
                      {w === lastWeek ? " ·dl" : ""}
                    </span>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
        <ul className="space-y-1">
          {PRIORITY_META.map((o) => (
            <li key={o.value}>
              <span className="text-text">{o.label}</span> — {o.blurb}
            </li>
          ))}
        </ul>
        <p>
          Target effort also rises each week: RIR (reps left in the tank) ramps from 3 toward 0,
          and the final week is a lighter <span className="text-text">deload</span>.
        </p>
      </div>
    </details>
  );
}
