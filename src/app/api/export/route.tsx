// Personal data export — downloads the signed-in user's training, body-tuning and recovery data
// for analysis by an AI agent. Query params drive it: `format` (json|md), `domain` (repeatable:
// training|body|recovery; omit all = everything) and `from` (YYYY-MM-DD, optional lower bound).
// Mirrors the share-image route: Node runtime (Prisma), getCurrentUser → 401, plain Response with
// an attachment Content-Disposition. Shaping lives in lib/export.ts so it stays unit-tested.
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { parseDateField } from "@/lib/format";
import {
  getExportData,
  buildExportPayload,
  renderJson,
  renderMarkdown,
  type DomainSelection,
} from "@/lib/export";

// Needs Prisma (getExportData) → Node runtime, never edge.
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return new Response("Unauthorized", { status: 401 });

  const params = req.nextUrl.searchParams;
  const format = params.get("format") === "md" ? "md" : "json";

  // Which domains: explicit `domain` params win; none selected ⇒ export everything.
  const picked = new Set(params.getAll("domain"));
  const domains: DomainSelection =
    picked.size === 0
      ? { training: true, body: true, recovery: true }
      : { training: picked.has("training"), body: picked.has("body"), recovery: picked.has("recovery") };

  // `from` is an inclusive lower bound; blank/invalid ⇒ all-time. parseDateField defaults a
  // blank value to today, so guard on the raw string before parsing.
  const fromRaw = params.get("from");
  const from = fromRaw && /^\d{4}-\d{2}-\d{2}$/.test(fromRaw) ? parseDateField(fromRaw) : null;

  const raw = await getExportData(me.id);
  const payload = buildExportPayload(raw, new Date(), { domains, from });
  const date = payload.exportedAt.slice(0, 10);

  const body = format === "md" ? renderMarkdown(payload, me.unit) : renderJson(payload);
  const contentType = format === "md" ? "text/markdown; charset=utf-8" : "application/json; charset=utf-8";
  const filename = `roguemeso-export-${date}.${format === "md" ? "md" : "json"}`;

  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Always reflect live data; never let a proxy/browser serve a stale snapshot.
      "Cache-Control": "no-store",
    },
  });
}
