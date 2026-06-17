# Tests

Fast unit tests for the pure logic in `src/` — no database, no browser. They run in
~0.6s via `npm test` (Vitest) and are the inner-loop check; the full gate (lint,
typecheck, build) runs in CI.

## Layout

`tests/` mirrors `src/`, so a module's test lives at the same path under `tests/`:

```
src/lib/features/recovery.ts   →   tests/lib/features/recovery.test.ts
src/lib/format.ts              →   tests/lib/format.test.ts
```

Tests import the code under test via the `@/` alias (`@/lib/features/recovery`), the
same way app code imports it — so they don't depend on their own location. The alias
and the `tests/**/*.test.ts` discovery glob are configured in `vitest.config.ts`.

## What to test here

Pure, deterministic functions — the evidence-backed engines (`recovery.ts`,
`bodyTuning.ts`, `progression.ts`, `insights.ts`), formatting, auth/session helpers,
rate limiting, etc. Anything needing a DB or browser belongs in CI/e2e, not here.
