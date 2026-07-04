// Receiver for the Zepp OS mini-app (zepp-beacon/): pings from the spike and, as of
// recorder R1, HR sample batches from the on-watch recorder. The caller is the
// mini-app's Side Service fetch()-ing from inside the Zepp phone app — no session
// cookie — so auth is a per-user bearer token: the presented token's sha256 is looked
// up in User.zeppTokenHash (generated/revoked in Profile → Wearables, shown once).
// Design: docs/superpowers/specs/2026-07-02-hr-recorder-design.md
import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { RateLimiter } from "@/lib/rateLimit";
import { hashBeaconToken } from "@/lib/wearableTokens";
import { clockSkewMs, decodeHrBatch, sanitizeBatch, HR_WATCH_MAX_AGE_MS } from "@/lib/heartRate";
import { parseWellnessSnapshot } from "@/lib/wellness";

// Generous for one household, hostile to guessing: 20 bad tokens in 10 min locks 30 min.
const limiter = new RateLimiter({
  maxAttempts: 20,
  windowMs: 10 * 60_000,
  baseLockoutMs: 30 * 60_000,
  maxLockoutMs: 6 * 60 * 60_000,
});

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-forwarded-for") ?? "unknown";
  if (!limiter.check(key).allowed) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const auth = req.headers.get("authorization") ?? "";
  const presented = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  // Hash-then-lookup is constant-time by construction: no comparison against the
  // presented string, and an unknown hash simply finds no row.
  const user = presented
    ? await prisma.user.findUnique({
        where: { zeppTokenHash: hashBeaconToken(presented) },
        select: { id: true, active: true },
      })
    : null;
  if (!user?.active) {
    limiter.recordFailure(key);
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  limiter.recordSuccess(key);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (body.type === "hr") {
    // Recorder batch: compact [secondsSinceT0, bpm] pairs + the watch's clock for
    // skew correction, then the same sanitize gate live capture uses. Rows land
    // day-agnostic (dayId null) — session attribution happens at read time.
    const now = Date.now();
    const skew = clockSkewMs(typeof body.watchNow === "number" ? body.watchNow : undefined, now);
    const decoded = decodeHrBatch(
      typeof body.t0 === "number" ? body.t0 : NaN,
      body.s as [number, number][],
      skew,
    );
    // Watch batches (recorder or all-day minute logger) can drain up to a day late —
    // the wider watch gate applies here; the browser's live-capture path keeps the
    // tight session-scoped default.
    const rows = sanitizeBatch(decoded, now, HR_WATCH_MAX_AGE_MS);
    if (rows.length) {
      await prisma.hrSample.createMany({
        data: rows.map((p) => ({ userId: user.id, dayId: null, at: new Date(p.at), bpm: p.bpm })),
      });
    }
    return NextResponse.json({ ok: true, seq: body.seq ?? null, stored: rows.length, serverAt: now });
  }

  if (body.type === "window") {
    // The watch's on-demand "Sync HR" asks: when was my latest workout? Answer with the
    // set-log bounds ±5 min so the watch sends only workout-relevant minutes. Sessions
    // older than 36h don't count — nothing recent means nothing to sync.
    const latestSet = await prisma.exerciseSet.findFirst({
      where: {
        finishedAt: { not: null, gte: new Date(Date.now() - 36 * 60 * 60_000) },
        dayExercise: { day: { meso: { userId: user.id } } },
      },
      orderBy: { finishedAt: "desc" },
      select: { dayExercise: { select: { dayId: true } } },
    });
    if (!latestSet) return NextResponse.json({ ok: true, from: null, to: null });
    const bounds = await prisma.exerciseSet.aggregate({
      where: { dayExercise: { dayId: latestSet.dayExercise.dayId }, finishedAt: { not: null } },
      _min: { finishedAt: true },
      _max: { finishedAt: true },
    });
    const pad = 5 * 60_000;
    return NextResponse.json({
      ok: true,
      from: bounds._min.finishedAt!.getTime() - pad,
      to: bounds._max.finishedAt!.getTime() + pad,
    });
  }

  if (body.type === "wellness") {
    // Full wellness snapshot, reassembled by the Side Service from per-domain parts.
    // Stored as-collected (schema-on-read; see WellnessSnapshot model note) after the
    // whitelist/size/clock gate in lib/wellness. The {ok:true} ack is what lets the
    // watch delete its buffered snapshot file — only send it after the row is durable.
    const now = Date.now();
    const parsed = parseWellnessSnapshot(body, now);
    if (!parsed) return NextResponse.json({ ok: false }, { status: 400 });
    await prisma.wellnessSnapshot.create({
      data: {
        userId: user.id,
        collectedAt: new Date(parsed.collectedAt),
        payload: { sections: parsed.sections, errors: parsed.errors } as Prisma.InputJsonValue,
      },
    });
    const domains = Object.keys(parsed.sections);
    console.log(
      `[zepp-beacon] wellness user=${user.id} domains=${domains.join(",")}` +
        (Object.keys(parsed.errors).length ? ` errors=${JSON.stringify(parsed.errors).slice(0, 300)}` : ""),
    );
    return NextResponse.json({ ok: true, stored: domains.length, serverAt: now });
  }

  // Anything else (pings, diag, raw dumps): log-and-echo observability, bounded.
  // Raw-array dump chunks must land whole (200 values ≈ 1KB); everything else stays tight.
  console.log(
    `[zepp-beacon] ${typeof body.type === "string" ? body.type : "?"} user=${user.id}`,
    JSON.stringify(body).slice(0, body.type === "dump" ? 4000 : 500),
  );
  return NextResponse.json({ ok: true, serverAt: Date.now() });
}
