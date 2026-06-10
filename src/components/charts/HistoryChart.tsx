"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// Pre-formatted points: { date: "5/2/2026", oneRm: 133 }. A single point renders as a dot.
export function HistoryChart({ data }: { data: { date: string; oneRm: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
        <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} tickLine={false} />
        <YAxis stroke="#9ca3af" fontSize={12} domain={["auto", "auto"]} tickLine={false} />
        <Tooltip
          contentStyle={{ background: "#0b0f14", border: "1px solid #1f2937", borderRadius: 8, fontSize: 12 }}
        />
        <Line type="monotone" dataKey="oneRm" stroke="#ff6a2b" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
