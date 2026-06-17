# Automated Image Build + Push to GHCR (one-click Unraid deploy via template)

**Date:** 2026-06-14
**Status:** Approved (design)

## Goal

Move the production Docker image build off the devbox and onto a GitHub-hosted
runner. On a push to `main` that introduces user-facing (`feat`/`fix`) commits,
the runner builds the multi-stage image and pushes it to GHCR as
`ghcr.io/saintedrogue/roguemeso:latest` and `:<short-sha>`. Deploying to the
Unraid server becomes a **one-click "Update"** in the Unraid GUI, enabled by a
dockerMan template that captures the container config (no Watchtower, no scheduled
auto-updater — the click stays deliberate).

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

### Deploy on Unraid: native one-button via a dockerMan template

The deploy mechanism is Unraid's built-in **Update** button, backed by a
dockerMan template. Today roguemeso has no template (it was created by raw
`docker run`), so the button can't recreate it. We add a template that captures
the full container config; thereafter Unraid's update flow (digest-compare →
`docker pull` → recreate-from-template) gives a true one-click update.

**Template file:** `/boot/config/plugins/dockerMan/templates-user/my-RogueMeso.xml`
on the Unraid flash, modeled on the working `my-MichaelAhrendt.xml` (pgAdmin)
template, which is also `br0` + fixed-IP. Key fields:

- `<Repository>ghcr.io/saintedrogue/roguemeso:latest</Repository>`
- `<Registry>https://ghcr.io/saintedrogue/roguemeso</Registry>`
- `<Network>br0</Network>` + `<MyIP>10.0.0.232</MyIP>` (fixed IP — the `<MyIP>`
  element is how Unraid pins a br0 address)
- `<Icon>https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/dumbbell.svg</Icon>`
- `<WebUI>http://[IP]:3000/</WebUI>`
- One `<Config Type="Variable">` per env var carried from the live container:
  `NODE_ENV`, `PORT`, `HOSTNAME`, `NEXT_TELEMETRY_DISABLED`, and (with
  `Mask="true"`) `AUTH_SECRET`, `DATABASE_URL`, `VAPID_PRIVATE_KEY`,
  `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`.
- No `<Config Type="Path">` (the container uses no mounts) and no published
  ports (br0 gives the container its own IP).

**Generation (secret-safe):** the template is generated **on the box**, reading
env values from `docker inspect roguemeso` and writing them straight into the XML
on the flash — secret values never transit the assistant's context or the repo. A
**redacted reference copy** is committed at `deploy/unraid-roguemeso.xml` (secret
values blanked) for version-controlled reproducibility.

**One-time adoption:** after the template exists, adopt it once via the Unraid GUI
(Docker → Add Container → select the `RogueMeso` template → Apply). This makes the
running container template-managed so the Update button recreates it correctly.
Because the template is generated from the current container, the recreate is a
no-op change in config — only the image differs on future updates.

**Steady-state deploy:** when CI pushes a new image, Unraid shows "update ready";
click **Update** → it pulls and recreates from the template. The entrypoint runs
`prisma migrate deploy` on boot.

**Rollback:** Unraid keeps the prior container; or re-pull a prior
`:<short-sha>` tag and update.

## Out of scope (YAGNI)

- **No Watchtower / no scheduled auto-update plugin** — updates stay a deliberate
  one-click action via the Unraid **Update** button (user declined auto-update).
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
- A dockerMan template `my-RogueMeso.xml` exists on the Unraid flash, accurately
  capturing the live container's image, `br0`/`10.0.0.232`, env, icon, and webui;
  Unraid shows roguemeso as template-managed with a working **Update** button.
- A redacted reference copy is committed at `deploy/unraid-roguemeso.xml`.
- Secret env values never enter the repo or the assistant's context.

## Follow-ups (not in this spec)

- Update memory `deploy-roguemeso-unraid` (it currently states CI does not build
  the image) once this ships.
- Optionally make `gate` a required status check on `main`.
