<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Development process: validate in CI, not locally

`.github/workflows/ci.yml` runs the full gate on every branch push and PR to `main`: job `gate` (lint → typecheck → test → `next build`) and job `changelog-guard` (`npm run check:changelog`). Use CI as the source of truth for full validation instead of running the heavy gate locally — the goal is to keep verbose `tsc`/`eslint`/`next build` output out of the session.

- **Full validation:** push the branch and check the result with `gh run watch --exit-status` (one pass/fail line). Do **not** run `tsc --noEmit`, `eslint`, or `next build` locally as routine pre-merge verification.
- **Tight loops only:** the fast local unit tests (`npm test`, ~0.6s, no DB/browser) are fine for TDD and debugging. CI complements them; it does not replace them.
- **Merge when green (policy set 2026-07-02):** once the CI `gate` and `changelog-guard` checks pass, **merge the PR to `main`** so `build-push` publishes the image — don't leave green PRs waiting. The user tests finished work **on the Unraid deployment** (apply the image update there), **not locally**. If the permission layer blocks a self-merge, report the green PR URL and ask the user to click merge.

# Build & deploy (CI → GHCR → Unraid)

**Never build the production image locally or on the devbox — it's automated in CI.**

- The `build-push` job in `ci.yml` builds and pushes `ghcr.io/saintedrogue/roguemeso:{latest,<short-sha>}` to GHCR on pushes to `main` that contain a `feat`/`fix` commit (detected by `scripts/ci-detect-userfacing.sh`), gated by `needs: [gate, changelog-guard]` so only validated commits publish.
- Docs/chore/ci-only merges do **not** publish an image (no user-facing change). To ship an infra-only change, use an empty feat commit: `git commit --allow-empty -m "feat(...): ..."`.
- **Deploy = one click:** after a CI push, roguemeso shows "update ready" on the Unraid Docker page → click "apply update" (pull + recreate from the dockerMan template; `prisma migrate deploy` self-applies via the entrypoint).
- **Seeding on boot:** `docker-entrypoint.sh` runs `prisma migrate deploy`, loads `prisma/seed-data.sql` only when the DB is empty, then always applies the *idempotent additive* SQL files (`prisma/descriptions.sql`, `prisma/kettlebell.sql`) so existing DBs gain new reference data. Ship new add-on reference data as an idempotent SQL file (`ON CONFLICT` / `WHERE NOT EXISTS`) wired into the entrypoint — don't rely on `seed-data.sql`, which only loads into an empty DB.
- Full deploy procedure + GHCR/Unraid gotchas live in the `deploy-roguemeso-unraid` memory and `deploy/image-build-push-cd.md`.

# Environment (home lab — mapped 2026-07-02)

Production/test is the user's Unraid home server; this is where finished work gets exercised.

- **Live app (test here):** `https://pump.ahrendt.us` — public HTTPS (Let's Encrypt via Nginx Proxy Manager). Login credentials for the test account are in `pump.env` at the repo root (**gitignored — never commit or echo its contents**).
- **Reverse proxy:** `Nginx-Proxy-Manager-Official` container at `10.0.0.233` (admin UI on `:81`), config in `/mnt/user/appdata/Nginx-Proxy-Manager-Official/`. Proxy host 5 = `pump.ahrendt.us` → `http://10.0.0.232:3000`. Note: unlike the other `*.ahrendt.us` hosts it does **not** include `force-ssl`, so plain-HTTP port 80 is served without redirect. The public HTTPS origin is what makes Web Push (and any future secure-context API like Web Bluetooth) work.
- **App containers (Unraid, `br0` macvlan, static IPs):** `roguemeso` @ `10.0.0.232:3000` (ghcr.io/saintedrogue/roguemeso:latest), `roguemeso-db` @ `10.0.0.231:5432` (postgres:17-alpine). Other stacks on the box (Jellyfin/arr/homepage/etc.) — leave them alone.
- **Docker/host access:** the Unraid Docker engine is reachable through the devbox container — SSH creds in `~/devbox.env` (`10.0.0.50`); its docker client targets the Unraid host daemon. Unraid host itself: `~/unraid.env` (`10.0.0.2`). Use `sshpass` + one-shot commands (zsh, non-interactive).
- **Env-file convention:** `~/devbox.env`, `~/unraid.env`, and repo-root `pump.env` hold `key='value'` credentials. Reference them by path in docs/commits; never inline their values.
