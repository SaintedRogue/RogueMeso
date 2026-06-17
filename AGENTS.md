<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Development process: validate in CI, not locally

`.github/workflows/ci.yml` runs the full gate on every branch push and PR to `main`: job `gate` (lint → typecheck → test → `next build`) and job `changelog-guard` (`npm run check:changelog`). Use CI as the source of truth for full validation instead of running the heavy gate locally — the goal is to keep verbose `tsc`/`eslint`/`next build` output out of the session.

- **Full validation:** push the branch and check the result with `gh run watch --exit-status` (one pass/fail line). Do **not** run `tsc --noEmit`, `eslint`, or `next build` locally as routine pre-merge verification.
- **Tight loops only:** the fast local unit tests (`npm test`, ~0.6s, no DB/browser) are fine for TDD and debugging. CI complements them; it does not replace them.
- **Before merge:** the CI `gate` (and `changelog-guard`) checks must be green.

# Build & deploy (CI → GHCR → Unraid)

**Never build the production image locally or on the devbox — it's automated in CI.**

- The `build-push` job in `ci.yml` builds and pushes `ghcr.io/saintedrogue/roguemeso:{latest,<short-sha>}` to GHCR on pushes to `main` that contain a `feat`/`fix` commit (detected by `scripts/ci-detect-userfacing.sh`), gated by `needs: [gate, changelog-guard]` so only validated commits publish.
- Docs/chore/ci-only merges do **not** publish an image (no user-facing change). To ship an infra-only change, use an empty feat commit: `git commit --allow-empty -m "feat(...): ..."`.
- **Deploy = one click:** after a CI push, roguemeso shows "update ready" on the Unraid Docker page → click "apply update" (pull + recreate from the dockerMan template; `prisma migrate deploy` self-applies via the entrypoint).
- **Seeding on boot:** `docker-entrypoint.sh` runs `prisma migrate deploy`, loads `prisma/seed-data.sql` only when the DB is empty, then always applies the *idempotent additive* SQL files (`prisma/descriptions.sql`, `prisma/kettlebell.sql`) so existing DBs gain new reference data. Ship new add-on reference data as an idempotent SQL file (`ON CONFLICT` / `WHERE NOT EXISTS`) wired into the entrypoint — don't rely on `seed-data.sql`, which only loads into an empty DB.
- Full deploy procedure + GHCR/Unraid gotchas live in the `deploy-roguemeso-unraid` memory and `deploy/image-build-push-cd.md`.
