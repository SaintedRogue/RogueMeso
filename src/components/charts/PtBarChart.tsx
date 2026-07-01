"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

// Horizontal categorical bars for a volume-load breakdown (movement-pattern balance, joint load).
// One bar per category; height scales with the number of rows. `colors` optionally tints each bar.
export type BarDatum = { label: string; value: number };

export function PtBarChart({ data, color = "var(--color-accent)", colors }: { data: BarDatum[]; color?: string; colors?: string[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 38)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <XAxis type="number" stroke="var(--color-line-2)" tick={{ fill: "var(--color-muted)" }} fontSize={12} tickLine={false} />
        <YAxis
          type="category"
          dataKey="label"
          width={120}
          stroke="var(--color-line-2)"
          tick={{ fill: "var(--color-muted)" }}
          fontSize={12}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{ background: "var(--color-panel)", border: "1px solid var(--color-line)", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "var(--color-text)" }}
          cursor={{ fill: "var(--color-line-2)", opacity: 0.15 }}
          formatter={(v: number) => [Math.round(v).toLocaleString(), "Volume load"]}
        />
        <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]}>
          {colors && data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
