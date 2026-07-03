// Ping receiver for the Zepp OS beacon spike (zepp-beacon/). Unlike every other route,
// the caller is NOT a browser with a session cookie — it's the mini-app's Side Service
// fetch()-ing from inside the Zepp phone app — so auth is a bearer token checked against
// the ZEPP_BEACON_TOKEN env var (set it in the container env to enable; unset = 503,
// the route is dark). The spike only logs + echoes; no DB writes until the real beacon.
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { RateLimiter } from "@/lib/rateLimit";

// Generous for one household, hostile to guessing: 20 bad tokens in 10 min locks 30 min.
const limiter = new RateLimiter({
  maxAttempts: 20,
  windowMs: 10 * 60_000,
  baseLockoutMs: 30 * 60_000,
  maxLockoutMs: 6 * 60 * 60_000,
});

const sha256 = (s: string) => createHash("sha256").update(s).digest();

function tokenMatches(presented: string, expected: string) {
  // Hash both sides so the comparison is constant-time regardless of length.
  return timingSafeEqual(sha256(presented), sha256(expected));
}

export async function POST(req: NextRequest) {
  const expected = process.env.ZEPP_BEACON_TOKEN;
  if (!expected) return NextResponse.json({ ok: false, error: "disabled" }, { status: 503 });

  const key = req.headers.get("x-forwarded-for") ?? "unknown";
  if (!limiter.check(key).allowed) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const auth = req.headers.get("authorization") ?? "";
  const presented = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!presented || !tokenMatches(presented, expected)) {
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

  // Spike observability: `docker logs roguemeso` is the server side of the experiment.
  // Log the whole (bounded) payload — pings and rate-test results have different shapes.
  console.log(`[zepp-beacon] ${typeof body.type === "string" ? body.type : "?"}`, JSON.stringify(body).slice(0, 500));

  return NextResponse.json({ ok: true, serverAt: Date.now() });
}
