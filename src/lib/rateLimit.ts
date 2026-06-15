// In-memory sliding-window rate limiter with exponential lockout. Pure (clock injected) so
// the policy is unit-tested in isolation. Used to throttle login attempts. In-process state
// is acceptable here: RogueMeso runs as a single container (no horizontal scale), so there's
// no shared store to coordinate — a process restart simply forgives in-flight counters, which
// is a safe failure mode for a login throttle. NOT suitable for multi-instance deploys.

export type RateLimitConfig = {
  /** Failures allowed within `windowMs` before a lockout trips. */
  maxAttempts: number;
  /** Sliding window over which failures are counted. */
  windowMs: number;
  /** Duration of the first lockout. */
  baseLockoutMs: number;
  /** Ceiling for the exponential backoff. */
  maxLockoutMs: number;
};

type Attempt = {
  failures: number;
  firstAt: number;
  lockedUntil: number;
  lockoutCount: number;
};

export type CheckResult = { allowed: boolean; retryAfterMs: number };

export class RateLimiter {
  private readonly map = new Map<string, Attempt>();

  constructor(
    private readonly cfg: RateLimitConfig,
    private readonly now: () => number = Date.now,
  ) {}

  /** Is `key` currently allowed to attempt? When blocked, `retryAfterMs` is the wait. */
  check(key: string): CheckResult {
    this.prune();
    const a = this.map.get(key);
    const now = this.now();
    if (a && now < a.lockedUntil) {
      return { allowed: false, retryAfterMs: a.lockedUntil - now };
    }
    return { allowed: true, retryAfterMs: 0 };
  }

  /** Record a failed attempt; trips (or escalates) a lockout once the window fills. */
  recordFailure(key: string): void {
    const now = this.now();
    const a = this.map.get(key) ?? { failures: 0, firstAt: now, lockedUntil: 0, lockoutCount: 0 };
    // A fresh window (no active lockout, last window elapsed) resets the failure count.
    if (now - a.firstAt > this.cfg.windowMs) {
      a.failures = 0;
      a.firstAt = now;
    }
    a.failures += 1;
    if (a.failures >= this.cfg.maxAttempts) {
      const dur = Math.min(this.cfg.baseLockoutMs * 2 ** a.lockoutCount, this.cfg.maxLockoutMs);
      a.lockedUntil = now + dur;
      a.lockoutCount += 1;
      a.failures = 0;
      a.firstAt = now;
    }
    this.map.set(key, a);
  }

  /** Clear all state for `key` after a successful attempt. */
  recordSuccess(key: string): void {
    this.map.delete(key);
  }

  /** Drop entries that are neither locked nor inside an active window, so the map can't grow
   *  without bound from one-off attempts. Cheap to run on each check. */
  private prune(): void {
    const now = this.now();
    for (const [key, a] of this.map) {
      if (now >= a.lockedUntil && now - a.firstAt > this.cfg.windowMs) this.map.delete(key);
    }
  }
}

/** Login policy: lock after 10 failures in 15 min; lockout grows 1 min → 15 min. */
export const DEFAULT_LOGIN_LIMIT: RateLimitConfig = {
  maxAttempts: 10,
  windowMs: 15 * 60_000,
  baseLockoutMs: 60_000,
  maxLockoutMs: 15 * 60_000,
};

/** Process-wide login limiter shared across requests. */
export const loginLimiter = new RateLimiter(DEFAULT_LOGIN_LIMIT);
