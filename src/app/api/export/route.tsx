// Personal data export — downloads one Markdown document (readable summary + a fenced JSON
// block of the lossless, canonical-kg payload) for the signed-in user, ready to drop into an
// AI agent for analysis. Mirrors the share-image route: Node runtime (Prisma), getCurrentUser
// → 401, plain Response with an attachment Content-Disposition. Data shaping lives in
// lib/export.ts so it stays unit-tested and the route only wires auth → fetch → render.
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getExportData, buildExportPayload, renderExportDocument } from "@/lib/export";

// Needs Prisma (getExportData) → Node runtime, never edge.
export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return new Response("Unauthorized", { status: 401 });

  const raw = await getExportData(me.id);
  const payload = buildExportPayload(raw, new Date());
  const doc = renderExportDocument(payload, me.unit);
  const date = payload.exportedAt.slice(0, 10);

  return new Response(doc, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="roguemeso-export-${date}.md"`,
      // Always reflect live data; never let a proxy/browser serve a stale snapshot.
      "Cache-Control": "no-store",
    },
  });
}
