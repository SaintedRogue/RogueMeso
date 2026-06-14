# GitHub Actions Full-Gate CI + README Badge

**Date:** 2026-06-14
**Status:** Approved (design)

## Goal

Move the full validation gate (lint, typecheck, tests, build) off the local
session and into GitHub Actions, so that:

- Every branch push and every PR to `main` gets validated in the cloud.
- Sessions can rely on a single pass/fail signal (`gh run watch`) instead of
  reading hundreds of lines of `tsc` / `eslint` / `next build` output locally.
- A README status badge surfaces the latest default-branch result.

Local `npm test` (~0.6s, 124 unit tests) stays available for tight debug loops.
CI does not replace it — CI replaces the heavy, verbose verification that was
consuming conversation context before deploys.

## Context (verified 2026-06-14)

- **Tests:** 124 vitest tests across 11 files, all pure unit tests under
  `src/lib` (no DB, no browser). Full suite runs in ~0.6s.
- **No existing CI:** `.github/workflows/` does not exist.
- **Remote:** `https://github.com/SaintedRogue/RogueMeso.git`.
- **No `postinstall` / `prisma generate` hook** in package.json — CI must run
  `prisma generate` before building.
- **Schema reads `env("DATABASE_URL")`** (`prisma/schema.prisma:11`) — the build
  needs a dummy `DATABASE_URL` supplied to parse, not to connect.
- **Scripts:** `test` = `vitest run`, `lint` = `eslint`, `build` = `next build`.

## Architecture

A single workflow file, `.github/workflows/ci.yml`, with one job (`gate`).
One job (not parallel jobs) keeps a single pass/fail check — the point of the
exercise.

### Triggers

```yaml
on:
  push:
    branches: ['**']        # every branch
  pull_request:
    branches: [main]        # PRs targeting main
```

A branch with an open PR runs the gate twice (once for push, once for the PR
event). This is the accepted tradeoff: the `pull_request` run attaches the check
to the PR object (so it can be made a required check via branch protection),
while the push run gives fast feedback on raw branch pushes.

### Gate steps (fail-fast order — cheapest first)

1. `actions/checkout`
2. `actions/setup-node` — Node 22 LTS (pinned for reproducibility; not the local
   v26), with `cache: npm`
3. `npm ci` — clean, lockfile-exact install
4. `npx prisma generate` — produces the Prisma client the build imports
5. `npx eslint` — lint
6. `npx tsc --noEmit` — typecheck
7. `npm test` — the 124 vitest tests
8. `npm run build` (`next build`) — with `DATABASE_URL` set to a dummy value
   (`postgresql://user:pass@localhost:5432/db`) as a build-time env var

Lint / typecheck / test are seconds and fail fast; the slow `next build` runs
last so a broken test surfaces without waiting on the build.

### README badge

Added at the top of `README.md`:

```markdown
[![CI](https://github.com/SaintedRogue/RogueMeso/actions/workflows/ci.yml/badge.svg)](https://github.com/SaintedRogue/RogueMeso/actions/workflows/ci.yml)
```

Reflects the latest run on the default branch.

## Out of scope (YAGNI)

- **No deploy automation** — deploys stay manual from the devbox by design.
- **No DB service container or migration run** — no test touches a DB, and the
  build only needs `DATABASE_URL` to parse.
- **No Node version matrix** — single pinned version.

## Success criteria

- A push to any branch triggers the `gate` job; it runs all 8 steps.
- A PR to `main` shows a CI check that can be required via branch protection.
- The gate fails (red) if lint, typecheck, tests, or build fail; passes (green)
  otherwise.
- The README badge renders and links to the Actions runs.
- The full gate passes green on the current `main` (or the branch this lands on).
