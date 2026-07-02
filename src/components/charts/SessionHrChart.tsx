"use client";

import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

/**
 * Intra-session heart rate against the actual work. The x-axis is real time (epoch ms,
 * same idiom as WeightChart); a dashed vertical marker sits at every logged set's
 * finishedAt — the correlation no vendor API can provide, drawn from our own capture.
 * Zone bands (Z2+) are horizontal washes in the app's semantic colors; the zone label
 * text on each band keeps the meaning legible without relying on color alone.
 */
export type SessionHrPoint = { ts: number; bpm: number };

const ZONES: { pct: number; label: string; color: string }[] = [
  { pct: 0.6, label: "Z2", color: "var(--color-good)" },
  { pct: 0.7, label: "Z3", color: "var(--color-info)" },
  { pct: 0.8, label: "Z4", color: "var(--color-warn)" },
  { pct: 0.9, label: "Z5", color: "var(--color-bad)" },
];

export function SessionHrChart({
  points,
  markers,
  maxHr,
}: {
  points: SessionHrPoint[];
  markers: { ts: number; label: string }[];
  maxHr: number;
}) {
  const fmtTime = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const minBpm = Math.min(...points.map((p) => p.bpm));
  const maxBpm = Math.max(...points.map((p) => p.bpm));
  const yMin = Math.max(30, Math.floor((minBpm - 8) / 10) * 10);
  const yMax = Math.ceil((maxBpm + 8) / 10) * 10;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={points} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <XAxis
          dataKey="ts"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickFormatter={fmtTime}
          stroke="var(--color-line-2)"
          tick={{ fill: "var(--color-muted)" }}
          fontSize={12}
          tickLine={false}
        />
        <YAxis
          stroke="var(--color-line-2)"
          tick={{ fill: "var(--color-muted)" }}
          fontSize={12}
          domain={[yMin, yMax]}
          tickLine={false}
          width={44}
        />
        <Tooltip
          contentStyle={{ background: "var(--color-panel)", border: "1px solid var(--color-line)", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "var(--color-text)" }}
          labelFormatter={(ts) => fmtTime(Number(ts))}
          formatter={(value) => [`${value} bpm`, "Heart rate"]}
        />
        {/* Zone washes — only bands that intersect the visible bpm range render. */}
        {ZONES.map((z, i) => {
          const y1 = Math.round(maxHr * z.pct);
          const y2 = i + 1 < ZONES.length ? Math.round(maxHr * ZONES[i + 1].pct) : yMax;
          if (y1 >= yMax || y2 <= yMin) return null;
          return (
            <ReferenceArea
              key={z.label}
              y1={Math.max(y1, yMin)}
              y2={Math.min(y2, yMax)}
              fill={z.color}
              fillOpacity={0.07}
              stroke="none"
              label={{ value: z.label, position: "insideTopRight", fill: z.color, fontSize: 10, opacity: 0.9 }}
            />
          );
        })}
        {/* One dashed marker per logged set. */}
        {markers.map((m) => (
          <ReferenceLine
            key={`${m.ts}-${m.label}`}
            x={m.ts}
            stroke="var(--color-accent)"
            strokeDasharray="3 4"
            strokeOpacity={0.55}
          />
        ))}
        <Line
          type="monotone"
          dataKey="bpm"
          name="Heart rate"
          stroke="var(--color-accent)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
