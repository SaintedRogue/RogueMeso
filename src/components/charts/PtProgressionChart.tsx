"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";

// Weekly volume-load progression, one line per group (movement pattern or exercise). Each series
// carries its own {week, volume} points; we merge them into per-week rows keyed by series label.
export type ProgressionSeries = { label: string; color: string; points: { week: string; volume: number }[] };

function mergeByWeek(series: ProgressionSeries[]): Record<string, number | string>[] {
  const weeks = [...new Set(series.flatMap((s) => s.points.map((p) => p.week)))].sort();
  return weeks.map((week) => {
    const row: Record<string, number | string> = { week };
    for (const s of series) {
      const pt = s.points.find((p) => p.week === week);
      if (pt) row[s.label] = Math.round(pt.volume);
    }
    return row;
  });
}

export function PtProgressionChart({ series }: { series: ProgressionSeries[] }) {
  const data = mergeByWeek(series);
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <XAxis dataKey="week" stroke="var(--color-line-2)" tick={{ fill: "var(--color-muted)" }} fontSize={12} tickLine={false} />
        <YAxis stroke="var(--color-line-2)" tick={{ fill: "var(--color-muted)" }} fontSize={12} tickLine={false} width={48} />
        <Tooltip
          contentStyle={{ background: "var(--color-panel)", border: "1px solid var(--color-line)", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "var(--color-text)" }}
          cursor={{ stroke: "var(--color-line-2)" }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s) => (
          <Line key={s.label} type="monotone" dataKey={s.label} stroke={s.color} strokeWidth={2} dot={{ r: 2 }} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
