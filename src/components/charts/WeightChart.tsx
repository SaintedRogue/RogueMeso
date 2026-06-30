"use client";

import { ComposedChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";

// Pre-formatted points: { date: "5/2/2026", weight: 80.1, smoothed: 80.0 }.
// Two lines: "Logged" connects every actual weigh-in (straight segments — tracks the real
// day-to-day moves), and "Trend" is the EWMA smoothing the engine actually uses.
export function WeightChart({
  data,
}: {
  data: { date: string; weight: number; smoothed: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
        <XAxis dataKey="date" stroke="var(--color-line-2)" tick={{ fill: "var(--color-muted)" }} fontSize={12} tickLine={false} />
        <YAxis stroke="var(--color-line-2)" tick={{ fill: "var(--color-muted)" }} fontSize={12} domain={["auto", "auto"]} tickLine={false} />
        <Tooltip
          contentStyle={{ background: "var(--color-panel)", border: "1px solid var(--color-line)", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "var(--color-text)" }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="linear"
          dataKey="weight"
          name="Logged"
          stroke="var(--color-info)"
          strokeWidth={1.5}
          dot={{ r: 3, fill: "var(--color-info)" }}
        />
        <Line type="monotone" dataKey="smoothed" name="Trend" stroke="var(--color-accent)" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
