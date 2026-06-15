import { describe, it, expect } from "vitest";
import { RateLimiter, type RateLimitConfig } from "./rateLimit";

const CFG: RateLimitConfig = {
  maxAttempts: 3,
  windowMs: 10_000,
  baseLockoutMs: 1_000,
  maxLockoutMs: 4_000,
};

// A controllable clock so tests never depend on real time.
function fakeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("RateLimiter", () => {
  it("allows attempts up to the limit, then blocks", () => {
    const clk = fakeClock();
    const rl = new RateLimiter(CFG, clk.now);
    for (let i = 0; i < CFG.maxAttempts; i++) {
      expect(rl.check("k").allowed).toBe(true);
      rl.recordFailure("k");
    }
    // The (maxAttempts+1)th check is now locked out.
    const res = rl.check("k");
    expect(res.allowed).toBe(false);
    expect(res.retryAfterMs).toBeGreaterThan(0);
  });

  it("clears the lockout once it expires", () => {
    const clk = fakeClock();
    const rl = new RateLimiter(CFG, clk.now);
    for (let i = 0; i < CFG.maxAttempts; i++) rl.recordFailure("k");
    expect(rl.check("k").allowed).toBe(false);
    clk.advance(CFG.baseLockoutMs + 1);
    expect(rl.check("k").allowed).toBe(true);
  });

  it("backs off exponentially and caps at maxLockoutMs", () => {
    const clk = fakeClock();
    const rl = new RateLimiter(CFG, clk.now);

    // First lockout: baseLockoutMs.
    for (let i = 0; i < CFG.maxAttempts; i++) rl.recordFailure("k");
    expect(rl.check("k").retryAfterMs).toBe(CFG.baseLockoutMs);

    // Wait it out, trip again → 2x.
    clk.advance(CFG.baseLockoutMs + 1);
    for (let i = 0; i < CFG.maxAttempts; i++) rl.recordFailure("k");
    expect(rl.check("k").retryAfterMs).toBe(CFG.baseLockoutMs * 2);

    // Trip again → would be 4x but capped at maxLockoutMs.
    clk.advance(CFG.baseLockoutMs * 2 + 1);
    for (let i = 0; i < CFG.maxAttempts; i++) rl.recordFailure("k");
    expect(rl.check("k").retryAfterMs).toBe(CFG.maxLockoutMs);
  });

  it("forgets failures older than the window", () => {
    const clk = fakeClock();
    const rl = new RateLimiter(CFG, clk.now);
    rl.recordFailure("k");
    rl.recordFailure("k");
    clk.advance(CFG.windowMs + 1); // window slides past the earlier failures
    rl.recordFailure("k");
    // Only the most recent failure counts, so we're still under the limit.
    expect(rl.check("k").allowed).toBe(true);
  });

  it("recordSuccess clears state immediately", () => {
    const clk = fakeClock();
    const rl = new RateLimiter(CFG, clk.now);
    for (let i = 0; i < CFG.maxAttempts; i++) rl.recordFailure("k");
    expect(rl.check("k").allowed).toBe(false);
    rl.recordSuccess("k");
    expect(rl.check("k").allowed).toBe(true);
  });

  it("keeps separate keys independent", () => {
    const clk = fakeClock();
    const rl = new RateLimiter(CFG, clk.now);
    for (let i = 0; i < CFG.maxAttempts; i++) rl.recordFailure("a");
    expect(rl.check("a").allowed).toBe(false);
    expect(rl.check("b").allowed).toBe(true);
  });
});
