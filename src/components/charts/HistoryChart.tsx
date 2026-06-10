"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// Pre-formatted points: { date: "5/2/2026", oneRm: 133 }. A single point renders as a dot.
export function HistoryChart({ data }: { data: { date: string; oneRm: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
        <XAxis dataKey="date" stroke="var(--color-line-2)" tick={{ fill: "var(--color-muted)" }} fontSize={12} tickLine={false} />
        <YAxis stroke="var(--color-line-2)" tick={{ fill: "var(--color-muted)" }} fontSize={12} domain={["auto", "auto"]} tickLine={false} />
        <Tooltip
          contentStyle={{ background: "var(--color-panel)", border: "1px solid var(--color-line)", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "var(--color-text)" }}
        />
        <Line type="monotone" dataKey="oneRm" stroke="var(--color-accent)" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
