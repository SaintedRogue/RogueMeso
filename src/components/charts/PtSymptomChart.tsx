"use client";

import { useMemo, useState } from "react";
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer } from "recharts";
import { PAIN_REGION_LABELS, type PainRegion } from "@/lib/features/physicalTherapyTaxonomy";

// Pain reports plotted over time (x = date, y = 0–10 score), filterable by body region and by
// check-in phase (pre-workout vs post-session). Each point keeps its region + phase for the
// tooltip. Client-side filtering only.
export type SymptomPoint = { t: number; score: number; region: string; phase: "pre" | "post" };

const regionLabel = (r: string) => PAIN_REGION_LABELS[r as PainRegion] ?? r;
const PHASES = [
  { value: "all", label: "All" },
  { value: "pre", label: "Pre" },
  { value: "post", label: "Post" },
] as const;

export function PtSymptomChart({ points }: { points: SymptomPoint[] }) {
  const regions = useMemo(() => [...new Set(points.map((p) => p.region))].sort(), [points]);
  const [region, setRegion] = useState<string>("all");
  const [phase, setPhase] = useState<string>("all");

  const filtered = points.filter(
    (p) => (region === "all" || p.region === region) && (phase === "all" || p.phase === phase),
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          aria-pressed={region === "all"}
          onClick={() => setRegion("all")}
          className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
            region === "all" ? "border-accent bg-accent/10 text-text" : "border-line text-muted hover:text-text"
          }`}
        >
          All regions
        </button>
        {regions.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={region === r}
            onClick={() => setRegion(r)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              region === r ? "border-accent bg-accent/10 text-text" : "border-line text-muted hover:text-text"
            }`}
          >
            {regionLabel(r)}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          {PHASES.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={phase === p.value}
              onClick={() => setPhase(p.value)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                phase === p.value ? "border-accent bg-accent/10 text-text" : "border-line text-muted hover:text-text"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <ScatterChart margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <XAxis
            type="number"
            dataKey="t"
            domain={["dataMin", "dataMax"]}
            stroke="var(--color-line-2)"
            tick={{ fill: "var(--color-muted)" }}
            fontSize={12}
            tickLine={false}
            tickFormatter={(t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          />
          <YAxis
            type="number"
            dataKey="score"
            domain={[0, 10]}
            stroke="var(--color-line-2)"
            tick={{ fill: "var(--color-muted)" }}
            fontSize={12}
            tickLine={false}
            width={28}
          />
          <ZAxis range={[60, 60]} />
          <Tooltip
            contentStyle={{ background: "var(--color-panel)", border: "1px solid var(--color-line)", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "var(--color-text)" }}
            cursor={{ stroke: "var(--color-line-2)" }}
            formatter={(_value, _name, item) => {
              const p = (item as { payload?: SymptomPoint })?.payload;
              return p ? [`${p.score}/10 · ${regionLabel(p.region)}`, p.phase === "pre" ? "Pre-workout" : "Post-session"] : ["", ""];
            }}
            labelFormatter={(label) => new Date(Number(label)).toLocaleDateString("en-US")}
          />
          <Scatter data={filtered} fill="var(--color-bad)" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
