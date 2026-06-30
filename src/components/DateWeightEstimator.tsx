"use client";

import { useState, type ReactNode } from "react";
import { fmtWeight } from "@/lib/format";

/** Linear trend extrapolation: weight at `weeksAway` from now = latest + rate·weeks. Display units. */
export function projectedWeight(latest: number, ratePerWeek: number, weeksAway: number): number {
  return Math.round((latest + ratePerWeek * weeksAway) * 10) / 10;
}

const WEEK_MS = 7 * 86400000;

/**
 * "What will I weigh on…" estimator. Pick a future date and see the trend-projected weight at the
 * same observed rate that drives the goal projection. Time is read in the change handler (not during
 * render) so it stays pure and free of hydration drift; the estimate is purely client-side.
 */
export function DateWeightEstimator({
  latestWeight,
  ratePerWeek,
  unit,
}: {
  latestWeight: number;
  ratePerWeek: number;
  unit: string;
}) {
  const [date, setDate] = useState("");
  const [readout, setReadout] = useState<ReactNode>(null);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setDate(v);
    if (!v) return setReadout(null);
    const weeksAway = (new Date(`${v}T00:00:00`).getTime() - Date.now()) / WEEK_MS;
    if (Number.isNaN(weeksAway)) return setReadout(null);
    if (weeksAway < 0) return setReadout(<span className="text-muted">Pick a future date.</span>);
    const weeks = Math.round(weeksAway);
    setReadout(
      <span className="text-text">
        ≈ <strong>{fmtWeight(projectedWeight(latestWeight, ratePerWeek, weeksAway), unit)}</strong>{" "}
        <span className="text-muted">(~{weeks} {weeks === 1 ? "week" : "weeks"} out)</span>
      </span>,
    );
  };

  return (
    <div className="mt-5">
      <label htmlFor="estDate" className="mb-1 block text-sm font-medium text-muted">
        Estimate my weight on a date
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input id="estDate" type="date" value={date} onChange={onChange} className="input sm:w-48" />
        {readout && <div className="text-sm">{readout}</div>}
      </div>
      <p className="mt-1 text-xs text-muted">Projected from your current trend — not a guarantee.</p>
    </div>
  );
}
