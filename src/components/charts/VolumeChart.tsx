"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

// One record per week: { week: "W1", Chest: 3, Back: 2, ... }. `muscleColors` maps
// each muscle series to its color. `mev`/`mrv` are the engine's per-muscle volume
// landmarks, drawn as horizontal bands — each muscle's line is read against them.
export type WeekDatum = { week: string } & Record<string, number | string>;

export function VolumeChart({
  data,
  muscleColors,
  mev,
  mrv,
}: {
  data: WeekDatum[];
  muscleColors: Record<string, string>;
  mev: number;
  mrv: number;
}) {
  const muscles = Object.keys(muscleColors);
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <XAxis dataKey="week" stroke="var(--color-line-2)" tick={{ fill: "var(--color-muted)" }} fontSize={12} tickLine={false} />
        <YAxis stroke="var(--color-line-2)" tick={{ fill: "var(--color-muted)" }} fontSize={12} allowDecimals={false} tickLine={false} />
        <Tooltip
          contentStyle={{ background: "var(--color-panel)", border: "1px solid var(--color-line)", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "var(--color-text)" }}
          cursor={{ stroke: "var(--color-line-2)" }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <ReferenceLine y={mev} stroke="var(--color-good)" strokeDasharray="4 4" label={{ value: "MEV", fill: "var(--color-good)", fontSize: 11, position: "right" }} />
        <ReferenceLine y={mrv} stroke="var(--color-bad)" strokeDasharray="4 4" label={{ value: "MRV", fill: "var(--color-bad)", fontSize: 11, position: "right" }} />
        {muscles.map((m) => (
          <Line
            key={m}
            type="monotone"
            dataKey={m}
            stroke={muscleColors[m]}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
