"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// Weekly training volume (bars, left axis) overlaid with mean readiness score (line, right axis
// 0–100). The overlay is what surfaces the "load rising while readiness falls" pattern visually.
export type RecoveryDatum = { week: string; volume: number; readiness: number | null };

export function PtRecoveryChart({ data }: { data: RecoveryDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <XAxis dataKey="week" stroke="var(--color-line-2)" tick={{ fill: "var(--color-muted)" }} fontSize={12} tickLine={false} />
        <YAxis yAxisId="vol" stroke="var(--color-line-2)" tick={{ fill: "var(--color-muted)" }} fontSize={12} tickLine={false} width={48} />
        <YAxis
          yAxisId="readiness"
          orientation="right"
          domain={[0, 100]}
          stroke="var(--color-line-2)"
          tick={{ fill: "var(--color-muted)" }}
          fontSize={12}
          tickLine={false}
          width={36}
        />
        <Tooltip
          contentStyle={{ background: "var(--color-panel)", border: "1px solid var(--color-line)", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "var(--color-text)" }}
          cursor={{ stroke: "var(--color-line-2)" }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="vol" dataKey="volume" name="Volume load" fill="var(--color-accent)" radius={[4, 4, 0, 0]} opacity={0.55} />
        <Line
          yAxisId="readiness"
          type="monotone"
          dataKey="readiness"
          name="Readiness"
          stroke="var(--color-info)"
          strokeWidth={2}
          dot={{ r: 3 }}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
