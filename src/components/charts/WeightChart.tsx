"use client";

import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

/**
 * Weight trend with goal projection. The x-axis is a real time scale (epoch ms) so the projected
 * date lands accurately. Three series: "Logged" connects actual weigh-ins (solid), "Trend" is the
 * EWMA (solid), and "Projection" is a dashed forecast from the latest weigh-in to the goal at the
 * observed rate. Horizontal markers show each goal weight. Line styles (solid vs dashed) — not just
 * color — distinguish actual from forecast for accessibility.
 */
export type WeightChartPoint = {
  ts: number; // epoch ms
  weight: number | null;
  smoothed: number | null;
  projection: number | null;
};

export function WeightChart({
  data,
  goals = [],
  unit,
}: {
  data: WeightChartPoint[];
  goals?: { label: string; weight: number }[];
  unit: string;
}) {
  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
        <XAxis
          dataKey="ts"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickFormatter={fmtDate}
          stroke="var(--color-line-2)"
          tick={{ fill: "var(--color-muted)" }}
          fontSize={12}
          tickLine={false}
        />
        <YAxis
          stroke="var(--color-line-2)"
          tick={{ fill: "var(--color-muted)" }}
          fontSize={12}
          domain={["auto", "auto"]}
          tickLine={false}
          width={44}
        />
        <Tooltip
          contentStyle={{ background: "var(--color-panel)", border: "1px solid var(--color-line)", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "var(--color-text)" }}
          labelFormatter={(ts) => fmtDate(Number(ts))}
          formatter={(value, name) => [`${value} ${unit}`, name]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {goals.map((g) => (
          <ReferenceLine
            key={g.label}
            y={g.weight}
            stroke="var(--color-good)"
            strokeDasharray="4 4"
            label={{ value: g.label, position: "insideBottomRight", fill: "var(--color-good)", fontSize: 11 }}
          />
        ))}
        <Line
          type="linear"
          dataKey="weight"
          name="Logged"
          stroke="var(--color-info)"
          strokeWidth={1.5}
          dot={{ r: 3, fill: "var(--color-info)" }}
          connectNulls
        />
        <Line type="monotone" dataKey="smoothed" name="Trend" stroke="var(--color-accent)" strokeWidth={2} dot={false} connectNulls />
        {data.some((d) => d.projection != null) && (
          <Line
            type="linear"
            dataKey="projection"
            name="Projection"
            stroke="var(--color-accent)"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            connectNulls
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
