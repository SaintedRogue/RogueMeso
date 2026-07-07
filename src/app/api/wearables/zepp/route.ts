// Receiver for the Zepp OS mini-app (zepp-beacon/): HR sample batches from the on-watch
// workout tracker, plus connectivity pings. The caller is the mini-app's Side Service
// fetch()-ing from inside the Zepp phone app — no session cookie — so auth is a per-user
// bearer token: the presented token's sha256 is looked up in User.zeppTokenHash
// (generated/revoked in Profile → Wearables, shown once).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { RateLimiter } from "@/lib/rateLimit";
import { hashBeaconToken } from "@/lib/wearableTokens";
import { clockSkewMs, decodeHrBatch, sanitizeBatch, HR_WATCH_MAX_AGE_MS } from "@/lib/heartRate";

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

  // Anything else (connectivity pings): log-and-echo, bounded.
  console.log(
    `[zepp-beacon] ${typeof body.type === "string" ? body.type : "?"} user=${user.id}`,
    JSON.stringify(body).slice(0, 500),
  );
  return NextResponse.json({ ok: true, serverAt: Date.now() });
}
