# RogueMeso — Security Audit

**Date:** 2026-06-15
**Scope:** Full application (Next.js 16 server actions, auth/session, Prisma data layer, Docker deploy)
**Method:** STRIDE threat model + manual data-flow tracing of every entry point (server actions, route handlers, proxy/middleware, scheduler) + `npm audit`.

## Summary

The codebase is **well-secured**. No Critical or High findings. Authentication, session signing, object-level authorization, and SQL safety are all handled correctly and consistently. Findings below are hardening/defense-in-depth items (Medium and lower).

| # | Severity | Title | STRIDE |
|---|----------|-------|--------|
| 1 | Medium | No login rate limiting / account lockout | DoS / Spoofing |
| 2 | Medium | Sessions not revoked on password change/reset | Spoofing |
| 3 | Low–Med | Blind SSRF via unvalidated push `endpoint` | Info Disclosure / EoP |
| 4 | Low | `postcss` moderate advisory (transitive, build-time) | — |
| 5 | Low | Missing security response headers (CSP, etc.) | Tampering |
| 6 | Low | Push route handler CSRF relies solely on SameSite | Spoofing |
| 7 | Low | docker-compose: weak default DB password + exposed port | Info Disclosure |
| 8 | Info | bcrypt cost 10; 30-day session, no idle timeout | — |

---

## Findings

### 1. No login rate limiting / account lockout — Medium
`login()` (`src/lib/authActions.ts:17`) performs an unbounded number of bcrypt comparisons. There is no per-IP or per-account throttle, lockout, or backoff. An attacker can brute-force / credential-stuff at the rate bcrypt allows.
**Fix:** Add per-IP + per-account rate limiting with exponential backoff (e.g. a small in-memory or DB-backed counter keyed by email+IP). The existing constant-time dummy-hash anti-enumeration is good; rate limiting complements it.

### 2. Sessions are stateless and survive password change/reset — Medium
`signSession` (`src/lib/session.ts:49`) embeds only `{ uid, exp }`. There is no token version, so changing or admin-resetting a password does **not** invalidate already-issued cookies — a stolen/leaked 30-day cookie stays valid even after the victim rotates their password. (Note: account *deactivation* IS effective immediately, because `getCurrentUser` re-checks `active` on every request — `src/lib/auth.ts:21`. Only the password path is missing.)
**Fix:** Add `sessionVersion Int @default(0)` to `User`; include it in the signed payload; bump it on `changeMyPassword`/`forcePasswordChange`/`resetUserPassword`; reject tokens whose version is stale in `getCurrentUser`.

### 3. Blind SSRF via unvalidated push subscription endpoint — Low–Medium
`subscribePush` (`src/lib/pushActions.ts:20`) stores an arbitrary client-supplied `endpoint` string with no scheme or host validation. The in-process scheduler (`src/lib/scheduler.ts`, ticks every minute) and `sendTestPush` then make the server POST to that URL via `web-push`. An authenticated user can point `endpoint` at internal/link-local addresses (e.g. `http://169.254.169.254/…`, `http://localhost:…`) and induce server-side requests.
Risk is bounded: it's authenticated, the body is encrypted, and the response is not returned to the caller (blind). But there is no allowlist.
**Fix:** Validate `endpoint` is `https://`, reject private/link-local/loopback hosts, and ideally allowlist known push-service domains (FCM, Mozilla, Apple, Windows).

### 4. `postcss` moderate advisory (transitive) — Low
`npm audit` reports postcss `<8.5.10` (GHSA-qx2v-qp2m-jg93, XSS via unescaped `</style>` in stringify output), pulled in transitively by `next`. **Not exploitable here** — PostCSS processes trusted authored CSS (Tailwind), not user input. Track it; do **not** run `npm audit fix --force` (it wrongly proposes downgrading `next` to 9.x). Wait for a `next` patch that bumps the nested postcss.

### 5. Missing security response headers — Low
`next.config.ts` sets only `sw.js` cache headers. No Content-Security-Policy, X-Content-Type-Options, X-Frame-Options/`frame-ancestors`, Referrer-Policy, or HSTS. A CSP would also be defense-in-depth for the inline theme script (`src/app/layout.tsx:40`, currently safe/static).
**Fix:** Add a baseline header block in `next.config.ts` `headers()`: `Content-Security-Policy` (script-src self + nonce/hash for the theme script), `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `frame-ancestors 'none'`, and `Strict-Transport-Security` (behind the TLS-terminating proxy).

### 6. Push route handler CSRF relies solely on SameSite — Low
`/api/push/action` (`src/app/api/push/action/route.ts`) is a cookie-authenticated `POST` with no explicit Origin/CSRF check. It is currently protected because the session cookie is `SameSite=Lax` (a cross-site `POST` fetch won't carry it), which is adequate — but the protection is implicit.
**Fix:** Add an explicit `Origin`/`Host` check (or a CSRF token) as defense-in-depth, matching what Next.js does for server actions.

### 7. docker-compose: weak default DB password + exposed port — Low
`docker-compose.yml` falls back to `POSTGRES_PASSWORD: openmeso_dev_pw` and publishes `5432:5432` on all interfaces. This file is for dev (prod uses the Unraid template), but anyone running compose without setting `POSTGRES_PASSWORD` exposes Postgres on the host with a publicly-known password.
**Fix:** Remove the password default (require the env var), and bind the port to `127.0.0.1:5432:5432`.

### 8. Informational
- **bcrypt cost 10** (`authActions.ts`/`userActions.ts`) — acceptable today; consider 12 for new hashes.
- **30-day session, no idle timeout** — reasonable posture for a self-hosted single-tenant app; documented here as a deliberate choice.

---

## Verified Strong (no action needed)

- **Session signing:** HMAC-SHA256 with a mandatory ≥32-char `AUTH_SECRET` and **no insecure fallback** — fails loudly if misconfigured (`session.ts:14`).
- **Cookies:** `httpOnly`, `SameSite=Lax`, `Secure` in production, scoped path (`authActions.ts:28`).
- **Login:** bcrypt with a constant-time dummy-hash compare to prevent email enumeration (`authActions.ts:15,23`).
- **Authorization:** every mutating server action calls `requireUser()`/`requireAdmin()`; **object-level ownership is checked on every read and write** (`assertMesoOwner`, `assertDayExerciseOwner`, `assertTemplateOwner`, `meso.userId !== me.id`, `getMesocycle`/`getDay`/`getTemplate` scope by user). **No IDOR found.**
- **Privilege escalation guards:** last-admin protection runs inside a `Serializable` transaction; can't change/deactivate/delete your own admin coverage or the last admin (`userActions.ts:28`, `roles.ts:37`).
- **Audit trail:** append-only, label-snapshotted, best-effort (never rolls back the action) (`audit.ts`).
- **SQL injection:** all queries go through Prisma; **no raw SQL** in application code.
- **XSS:** React auto-escaping throughout; the only `dangerouslySetInnerHTML` is a static, no-user-input theme script.
- **Secrets:** `.env` is gitignored and **not tracked**; VAPID public key correctly served at runtime, private key server-only.
- **Setup flow:** `createFirstAdmin` self-closes once any user exists — can't mint a second admin.
- **Deactivation:** takes effect on the user's very next request (active re-checked in `getCurrentUser`).
