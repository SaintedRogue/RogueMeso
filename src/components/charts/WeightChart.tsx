"use client";

import { ComposedChart, Line, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// Pre-formatted points: { date: "5/2/2026", weight: 80.1, smoothed: 80.0 }.
// Raw dots show day-to-day noise; the line is the EWMA trend the engine actually uses.
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
        <Scatter dataKey="weight" name="Raw" fill="var(--color-muted)" />
        <Line type="monotone" dataKey="smoothed" name="Trend" stroke="var(--color-accent)" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
