// Renders the current workout day as a branded PNG for the "Share workout" action. Uses
// Next.js's built-in ImageResponse (Satori + Resvg) — JSX → PNG, flexbox-only, no CSS vars,
// so the brand palette is hardcoded here (mirrors the dark theme in globals.css). Reuses the
// exact getDay() payload the day page renders, scoped to the signed-in user, and the pure
// summarizeExercise() transform so the picture can't drift from what's on screen.
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDay } from "@/lib/data";
import { mgColor, rirForWeek } from "@/lib/format";
import { summarizeExercise } from "@/lib/shareSummary";

// Needs Prisma (getDay) → Node runtime, never edge.
export const runtime = "nodejs";

// Dark-theme palette, copied from globals.css (Satori can't resolve CSS custom properties).
const C = {
  bg: "#0c0a09",
  panel: "#231d16",
  line: "#403528",
  muted: "#b3a89a",
  text: "#f7f3ee",
  brand: "#ff6a2b",
  info: "#4d9fff",
  good: "#3fcf8e",
};

// Status → pill color, matching the app's semantics (green=done, blue=in progress).
function statusColor(status: string): string {
  if (status === "complete") return C.good;
  if (status === "partial" || status === "started") return C.info;
  return C.muted;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string; week: string; day: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return new Response("Unauthorized", { status: 401 });

  const { key, week, day } = await params;
  const wk = Number(week);
  const pos = Number(day);
  if (!Number.isInteger(wk) || !Number.isInteger(pos)) {
    return new Response("Bad request", { status: 400 });
  }

  const d = await getDay(key, wk, pos, me.id); // ownership enforced inside getDay
  if (!d) return new Response("Not found", { status: 404 });

  const meso = d.meso;
  const targetRir = rirForWeek(wk, meso.weeksCount);
  const rows = d.exercises.map((ex) => ({
    ...summarizeExercise(ex, meso.unit, targetRir),
    color: mgColor(ex.muscleGroup.name),
  }));

  const completedSets = d.exercises.reduce(
    (n, ex) => n + ex.sets.filter((s) => s.status === "complete").length,
    0,
  );
  const totalSets = rows.reduce((n, r) => n + r.plannedCount, 0);
  const dateLabel = new Date().toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  // Portrait card; height grows with the exercise count so nothing clips.
  const WIDTH = 1080;
  const ROW_H = 92;
  const height = 300 + rows.length * ROW_H + 96;

  try {
    return new ImageResponse(
      (
        <div
          style={{
            width: WIDTH,
            height,
            display: "flex",
            flexDirection: "column",
            backgroundColor: C.bg,
            color: C.text,
            padding: 56,
            fontFamily: "sans-serif",
          }}
        >
          {/* Brand + meta header */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 18, height: 36, borderRadius: 4, backgroundColor: C.brand }} />
              <div style={{ display: "flex", fontSize: 30, fontWeight: 700, letterSpacing: -0.5 }}>
                <span>Rogue</span>
                <span style={{ color: C.brand }}>Meso</span>
              </div>
              <div
                style={{
                  display: "flex",
                  marginLeft: "auto",
                  padding: "6px 16px",
                  borderRadius: 999,
                  fontSize: 22,
                  fontWeight: 600,
                  color: C.bg,
                  backgroundColor: statusColor(d.status),
                }}
              >
                {d.status === "complete" ? "Complete" : d.status === "partial" ? "In progress" : "Planned"}
              </div>
            </div>

            <div style={{ display: "flex", marginTop: 28, fontSize: 56, fontWeight: 800, letterSpacing: -1 }}>
              {`Week ${wk + 1} · Day ${pos + 1}`}
            </div>
            <div style={{ display: "flex", marginTop: 8, fontSize: 30, color: C.muted }}>
              {meso.name}
              {d.label ? ` · ${d.label}` : ""}
            </div>
            <div style={{ display: "flex", marginTop: 6, fontSize: 26, color: C.muted }}>
              {`${completedSets}/${totalSets} sets logged · ${rows.length} exercise${rows.length === 1 ? "" : "s"}`}
            </div>
          </div>

          <div style={{ display: "flex", height: 2, backgroundColor: C.line, margin: "28px 0" }} />

          {/* One row per exercise */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {rows.map((r, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: ROW_H - 14,
                  padding: "0 24px",
                  borderRadius: 14,
                  backgroundColor: C.panel,
                  borderLeft: `6px solid ${r.color}`,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
                  <div style={{ display: "flex", fontSize: 30, fontWeight: 600 }}>{r.name}</div>
                  <div style={{ display: "flex", fontSize: 22, color: C.muted }}>{r.muscleGroup}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", marginLeft: 24 }}>
                  <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: r.topSet ? C.text : C.muted }}>
                    {r.detail}
                  </div>
                  <div style={{ display: "flex", fontSize: 22, color: C.muted }}>
                    {`${r.loggedCount}/${r.plannedCount} sets`}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              marginTop: "auto",
              paddingTop: 28,
              fontSize: 24,
              color: C.muted,
            }}
          >
            <span>{dateLabel}</span>
            <span style={{ marginLeft: "auto" }}>Tracked with RogueMeso</span>
          </div>
        </div>
      ),
      { width: WIDTH, height },
    );
  } catch {
    return new Response("Failed to generate image", { status: 500 });
  }
}
