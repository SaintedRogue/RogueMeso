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
        <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} tickLine={false} />
        <YAxis stroke="#9ca3af" fontSize={12} domain={["auto", "auto"]} tickLine={false} />
        <Tooltip
          contentStyle={{ background: "#0b0f14", border: "1px solid #1f2937", borderRadius: 8, fontSize: 12 }}
        />
        <Scatter dataKey="weight" name="Raw" fill="#6b7280" />
        <Line type="monotone" dataKey="smoothed" name="Trend" stroke="#ff6a2b" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
