# Automated Image Build + Push to GHCR (manual Unraid deploy)

**Date:** 2026-06-14
**Status:** Approved (design)

## Goal

Move the production Docker image build off the devbox and onto a GitHub-hosted
runner. On a push to `main` that introduces user-facing (`feat`/`fix`) commits,
the runner builds the multi-stage image and pushes it to GHCR as
`ghcr.io/saintedrogue/roguemeso:latest` and `:<short-sha>`. Deploying to the
Unraid server stays a **manual** `docker pull` + recreate step (no Watchtower,
nothing new running on the server).

## Context (verified 2026-06-14)

- **Build is local today, not registry-based.** The devbox's docker client
  targets the Unraid host daemon, so `docker build -t ghcr.io/...:latest` only
  produces a local image on Unraid — it never pushes to GHCR. Relocating the
  build to a runner means the image now travels through the real GHCR registry,
  and Unraid must `docker pull` it. Unraid already has a GHCR `docker login`.
- **No semver.** The "What's new" feature is git-SHA + conventional-commit based:
  `changelog.json` is generated from `git log` (`generatedFromSha` = newest
  commit SHA); `User.lastSeenVersion` stores a SHA (`schema.prisma:69`); the
  panel renders only `^(feat|fix)` subjects (`src/lib/updates.ts:39`); nothing
  reads `package.json`'s version. No VERSION file is invented.
- **Existing CI** (`.github/workflows/ci.yml`) has two jobs: `gate`
  (lint/typecheck/test/`next build`) and `changelog-guard`
  (`npm run check:changelog`, checkout `fetch-depth: 0`). It gates code only — it
  does not build or push an image.
- **Changelog must regenerate at build time.** `scripts/gen-changelog.mjs` reads
  `git log` and must run after checkout, before `docker build`, because `.git` is
  excluded from the Docker context. A runner with `fetch-depth: 0` has full
  history, eliminating the former devbox `gen-changelog` step.
- **Migrations are runtime.** `docker-entrypoint.sh` runs `prisma migrate deploy`
  + idempotent seed on container start, so "deploy" = swap image + recreate.

## Architecture

Add a third job, `build-push`, to the existing `.github/workflows/ci.yml`:

```
push to main ─► gate ────────────┐
             ─► changelog-guard ─┴─► build-push   (needs: [gate, changelog-guard])
                                      if: ref == refs/heads/main AND merge has feat/fix
```

Same-workflow job dependencies (`needs:`) guarantee the image is published **only
after** validation passes — a commit failing lint/typecheck/test/build can never
produce a published image. On branch pushes and PRs the `if` is false, so the job
is skipped; image builds happen only on `main`.

### Job: `build-push`

Permissions (job-scoped): `contents: read`, `packages: write`.

Steps:

1. **Detect user-facing changes** (gate the rest of the job):
   - Compare `${{ github.event.before }}..${{ github.event.after }}`, passed via
     `env:` (never interpolated into the script body — commit-message injection
     safe).
   - If `before` is all-zeros (first push / force-push / new branch), fall back to
     `build=true`.
   - Otherwise `build=true` iff `git log --pretty=%s <before>..<after>` contains a
     subject matching `^(feat|fix)`.
   - Subsequent steps run only `if: steps.gate.outputs.build == 'true'`.
2. **Checkout** with `fetch-depth: 0` (full `.git` for the changelog).
3. **Regenerate changelog:** `node scripts/gen-changelog.mjs`.
4. **Log in to GHCR:** `docker/login-action@v3` with `registry: ghcr.io`,
   `username: ${{ github.actor }}`, `password: ${{ secrets.GITHUB_TOKEN }}`.
5. **Set up Buildx:** `docker/setup-buildx-action@v3`.
6. **Build + push:** `docker/build-push-action@v6` with the existing root
   `Dockerfile`, `push: true`, tags:
   - `ghcr.io/saintedrogue/roguemeso:latest`
   - `ghcr.io/saintedrogue/roguemeso:<short-sha>` (7-char, matches the app's
     `generatedFromSha` identity concept)
   - Layer cache: `cache-from: type=gha`, `cache-to: type=gha,mode=max` (speeds
     the slow `npm ci` / multi-stage build on repeat runs).

Image name is lowercase (GHCR requirement). The package is **private** (inherits
the private repo's visibility); Unraid's existing GHCR login covers the pull.

### Manual deploy on Unraid (unchanged mechanics; `pull` replaces `build`)

Captured in `docs/deploy.md`. The only change from today's procedure is replacing
the local `docker build` with `docker pull`:

1. `docker tag ghcr.io/saintedrogue/roguemeso:latest ghcr.io/saintedrogue/roguemeso:previous`
   (snapshot current image for rollback).
2. `docker pull ghcr.io/saintedrogue/roguemeso:latest` (fetch the runner-built image).
3. Carry env over from the live container:
   `docker inspect roguemeso --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -vE '^(PATH|NODE_VERSION|YARN_VERSION)=' > /tmp/roguemeso.env`
4. `docker rm -f roguemeso-old` (clear any stale rollback), then
   `docker rename roguemeso roguemeso-old`.
5. `docker run -d --name roguemeso --network br0 --ip 10.0.0.232 --restart unless-stopped --env-file /tmp/roguemeso.env`
   + the 3 labels (icon=dumbbell svg / `net.unraid.docker.managed=dockerman` /
   webui=`http://10.0.0.232:3000`) `ghcr.io/saintedrogue/roguemeso:latest`,
   then `shred -u /tmp/roguemeso.env`.
6. Verify: `docker logs roguemeso` (entrypoint runs `migrate deploy`), then
   in-container `wget http://127.0.0.1:3000/login` → 200 (use `127.0.0.1`, not
   `localhost` — server binds IPv4).

Rollback: `docker start roguemeso-old`, or
`docker pull ghcr.io/saintedrogue/roguemeso:previous` (or any prior `:<short-sha>`)
and recreate.

## Out of scope (YAGNI)

- **No Watchtower / no auto-pull** — deploy stays a manual decision.
- **No semver / VERSION file** — the codebase is SHA-based and the user won't
  maintain a version number. A human-readable version label, if ever wanted, is a
  separate feature.
- **No multi-arch** — Unraid and GitHub runners are both amd64.
- **No deploy automation to Unraid** — the LAN is not reachable from cloud
  runners and the user chose manual deploys.

## Success criteria

- A push to `main` containing a `feat`/`fix` commit, with `gate` +
  `changelog-guard` green, builds and pushes
  `ghcr.io/saintedrogue/roguemeso:latest` and `:<short-sha>` to GHCR.
- A push to `main` with only docs/chore/ci/merge subjects does **not** build or
  push an image (job skipped after the detect step).
- Branch pushes and PRs never trigger `build-push`.
- The pushed image's baked `changelog.json` reflects the built commit.
- `docs/deploy.md` documents the manual `pull` + recreate + rollback procedure.

## Follow-ups (not in this spec)

- Update memory `deploy-roguemeso-unraid` (it currently states CI does not build
  the image) once this ships.
- Optionally make `gate` a required status check on `main`.
