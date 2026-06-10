"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

// One record per week: { week: "W1", Chest: 3, Back: 2, ... }. `muscleColors` maps
// each muscle series to its color. `mev`/`mrv` are the engine's volume landmarks.
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
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <XAxis dataKey="week" stroke="#9ca3af" fontSize={12} tickLine={false} />
        <YAxis stroke="#9ca3af" fontSize={12} allowDecimals={false} tickLine={false} />
        <Tooltip
          contentStyle={{ background: "#0b0f14", border: "1px solid #1f2937", borderRadius: 8, fontSize: 12 }}
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <ReferenceLine y={mev} stroke="#34d399" strokeDasharray="4 4" label={{ value: "MEV", fill: "#34d399", fontSize: 11, position: "right" }} />
        <ReferenceLine y={mrv} stroke="#f87171" strokeDasharray="4 4" label={{ value: "MRV", fill: "#f87171", fontSize: 11, position: "right" }} />
        {muscles.map((m) => (
          <Bar key={m} dataKey={m} fill={muscleColors[m]} radius={[2, 2, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
