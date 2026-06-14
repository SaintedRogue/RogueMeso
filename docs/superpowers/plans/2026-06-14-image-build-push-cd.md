# Automated Image Build + Push to GHCR + One-Click Unraid Deploy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the production Docker image on a GitHub runner and push it to GHCR on every `main` push that introduces `feat`/`fix` commits, then deploy to Unraid with a one-click "Update" button backed by a dockerMan template.

**Architecture:** A third job (`build-push`) in `.github/workflows/ci.yml`, gated by `needs: [gate, changelog-guard]` + `if: ref == main` + a `feat`/`fix` detection script, builds and pushes `ghcr.io/saintedrogue/roguemeso:latest` and `:<short-sha>`. On Unraid, a dockerMan template (`my-roguemeso.xml`) captures the live container config so the native Update button does pull + recreate.

**Tech Stack:** GitHub Actions, `docker/build-push-action`, GHCR, POSIX sh, Unraid dockerMan XML template. Deploy validation runs against the live box via the devbox (`/home/rogue/devbox.env`, keys `host`/`user`/`pass`; its docker client targets the Unraid host daemon).

---

## File Structure

- **Create:** `scripts/ci-detect-userfacing.sh` — prints `true`/`false` for whether a commit range contains `feat`/`fix` (the "What's new" signal). Pure, env-driven, unit-testable.
- **Modify:** `.github/workflows/ci.yml` — add the `build-push` job.
- **Create:** `deploy/unraid-roguemeso.xml` — redacted reference copy of the Unraid template (version-controlled; secrets blanked).
- **Create (on Unraid flash, not the repo):** `/boot/config/plugins/dockerMan/templates-user/my-roguemeso.xml` — generated from the live container, secrets written straight to flash.

---

## Task 1: feat/fix detection script

The one piece with real logic (range diff, injection-safety, all-zeros fallback). TDD it against the repo's own immutable history.

**Files:**
- Create: `scripts/ci-detect-userfacing.sh`

- [ ] **Step 1: Write the script**

Create `scripts/ci-detect-userfacing.sh`:

```sh
#!/bin/sh
# Print "true" if the commit range $BEFORE..$AFTER contains any feat/fix commit
# subject (the same ^(feat|fix) signal that populates the "What's new" panel),
# else "false". SHAs arrive via env (BEFORE/AFTER) and are never interpolated
# into the script body, so a crafted commit message cannot inject shell.
set -eu

# All-zeros or empty BEFORE (first push / force-push / brand-new branch) has no
# usable range to diff — default to building.
case "${BEFORE:-}" in
  *[!0]*) ;;               # contains a non-zero char -> real ref, fall through
  *) echo true; exit 0 ;;  # empty or all-zeros -> build
esac

if git log --pretty=%s "$BEFORE..$AFTER" 2>/dev/null | grep -qE '^(feat|fix)'; then
  echo true
else
  echo false
fi
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x scripts/ci-detect-userfacing.sh`

- [ ] **Step 3: Test — a range containing a feat commit returns true**

`30dea41` is `feat(meso): show per-day exercises in a full-width week row`.

Run:
```bash
BEFORE=b5b8254 AFTER=30dea41 sh scripts/ci-detect-userfacing.sh
```
Expected output: `true`

- [ ] **Step 4: Test — a docs-only range returns false**

`3f29b5a` is `docs(process): validate in CI, not locally` (no feat/fix).

Run:
```bash
BEFORE=$(git rev-parse 3f29b5a~1) AFTER=3f29b5a sh scripts/ci-detect-userfacing.sh
```
Expected output: `false`

- [ ] **Step 5: Test — all-zeros BEFORE (first push) returns true**

Run:
```bash
BEFORE=0000000000000000000000000000000000000000 AFTER=HEAD sh scripts/ci-detect-userfacing.sh
```
Expected output: `true`

- [ ] **Step 6: Commit**

```bash
git add scripts/ci-detect-userfacing.sh
git commit -m "ci: add feat/fix detection script for image-build gating

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Add the `build-push` job to `ci.yml`

**Files:**
- Modify: `.github/workflows/ci.yml` (append a new job under `jobs:`)

- [ ] **Step 1: Append the job**

Add this job to `.github/workflows/ci.yml`, indented under `jobs:` (same level as `gate` and `changelog-guard`):

```yaml
  build-push:
    name: Build & push image to GHCR
    runs-on: ubuntu-latest
    needs: [gate, changelog-guard]
    if: github.ref == 'refs/heads/main'
    permissions:
      contents: read
      packages: write
    steps:
      - name: Checkout
        uses: actions/checkout@v5
        with:
          fetch-depth: 0

      - name: Detect user-facing (feat/fix) changes
        id: detect
        env:
          BEFORE: ${{ github.event.before }}
          AFTER: ${{ github.event.after }}
        run: echo "build=$(sh scripts/ci-detect-userfacing.sh)" >> "$GITHUB_OUTPUT"

      - name: Set up Node
        if: steps.detect.outputs.build == 'true'
        uses: actions/setup-node@v5
        with:
          node-version: '22'

      - name: Regenerate changelog from git
        if: steps.detect.outputs.build == 'true'
        run: node scripts/gen-changelog.mjs

      - name: Compute short SHA
        if: steps.detect.outputs.build == 'true'
        id: vars
        run: echo "sha=$(git rev-parse --short=7 HEAD)" >> "$GITHUB_OUTPUT"

      - name: Log in to GHCR
        if: steps.detect.outputs.build == 'true'
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Set up Buildx
        if: steps.detect.outputs.build == 'true'
        uses: docker/setup-buildx-action@v3

      - name: Build and push
        if: steps.detect.outputs.build == 'true'
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            ghcr.io/saintedrogue/roguemeso:latest
            ghcr.io/saintedrogue/roguemeso:${{ steps.vars.outputs.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 2: Validate the YAML structure**

Run:
```bash
node -e "const s=require('fs').readFileSync('.github/workflows/ci.yml','utf8');for(const j of ['gate:','changelog-guard:','build-push:'])if(!s.includes(j))throw new Error('missing '+j);if(!s.includes('packages: write'))throw new Error('missing packages perm');console.log('ci.yml jobs OK')"
```
Expected: prints `ci.yml jobs OK`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: build and push image to GHCR on feat/fix merges to main

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Commit the redacted reference template

A version-controlled copy of the Unraid template with secret values blanked. No live data needed — written from the known structure.

**Files:**
- Create: `deploy/unraid-roguemeso.xml`

- [ ] **Step 1: Write the redacted template**

Create `deploy/unraid-roguemeso.xml`:

```xml
<?xml version="1.0"?>
<!-- Reference copy of the Unraid dockerMan template for roguemeso.
     The LIVE copy lives on the Unraid flash at
     /boot/config/plugins/dockerMan/templates-user/my-roguemeso.xml and is
     generated from the running container so the secret values below are real
     there. Secret values are intentionally blank here. -->
<Container version="2">
  <Name>roguemeso</Name>
  <Repository>ghcr.io/saintedrogue/roguemeso:latest</Repository>
  <Registry>https://ghcr.io/saintedrogue/roguemeso</Registry>
  <Network>br0</Network>
  <MyIP>10.0.0.232</MyIP>
  <Shell>sh</Shell>
  <Privileged>false</Privileged>
  <Support/>
  <Project/>
  <Overview>RogueMeso hypertrophy training app (Next.js standalone + Prisma).</Overview>
  <Category>HomeAutomation:</Category>
  <WebUI>http://[IP]:3000/</WebUI>
  <Icon>https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/dumbbell.svg</Icon>
  <ExtraParams/>
  <PostArgs/>
  <CPUset/>
  <DateInstalled>0</DateInstalled>
  <DonateText/>
  <DonateLink/>
  <Requires/>
  <Config Name="Node Env" Target="NODE_ENV" Default="" Mode="" Description="" Type="Variable" Display="always" Required="true" Mask="false">production</Config>
  <Config Name="Port" Target="PORT" Default="" Mode="" Description="" Type="Variable" Display="always" Required="true" Mask="false">3000</Config>
  <Config Name="Hostname" Target="HOSTNAME" Default="" Mode="" Description="" Type="Variable" Display="always" Required="true" Mask="false">0.0.0.0</Config>
  <Config Name="Next Telemetry Disabled" Target="NEXT_TELEMETRY_DISABLED" Default="" Mode="" Description="" Type="Variable" Display="advanced" Required="false" Mask="false">1</Config>
  <Config Name="Auth Secret" Target="AUTH_SECRET" Default="" Mode="" Description="NextAuth secret" Type="Variable" Display="always" Required="true" Mask="true"></Config>
  <Config Name="Database URL" Target="DATABASE_URL" Default="" Mode="" Description="Postgres connection string" Type="Variable" Display="always" Required="true" Mask="true"></Config>
  <Config Name="VAPID Private Key" Target="VAPID_PRIVATE_KEY" Default="" Mode="" Description="Web Push private key" Type="Variable" Display="always" Required="true" Mask="true"></Config>
  <Config Name="VAPID Public Key" Target="VAPID_PUBLIC_KEY" Default="" Mode="" Description="Web Push public key" Type="Variable" Display="always" Required="true" Mask="false"></Config>
  <Config Name="VAPID Subject" Target="VAPID_SUBJECT" Default="" Mode="" Description="Web Push subject (mailto:)" Type="Variable" Display="always" Required="true" Mask="false"></Config>
</Container>
```

- [ ] **Step 2: Verify it is well-formed XML**

Run:
```bash
node -e "const s=require('fs').readFileSync('deploy/unraid-roguemeso.xml','utf8');const o=(s.match(/<Config /g)||[]).length;if(o!==9)throw new Error('expected 9 Config, got '+o);if(!s.includes('<MyIP>10.0.0.232</MyIP>'))throw new Error('missing MyIP');console.log('reference template OK ('+o+' config entries)')"
```
Expected: prints `reference template OK (9 config entries)`

- [ ] **Step 3: Commit**

```bash
git add deploy/unraid-roguemeso.xml
git commit -m "deploy: add redacted reference copy of Unraid dockerMan template

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Ship the pipeline — merge to main and verify image in GHCR

The `build-push` job only runs on `main`, so the real end-to-end test is a merge. The branch `ci/image-build-push` already contains the spec/plan commits plus Tasks 1–3.

**Files:** none (integration)

- [ ] **Step 1: Push the branch and open a PR**

```bash
git push -u origin ci/image-build-push
gh pr create --base main --head ci/image-build-push \
  --title "ci: build+push image to GHCR + Unraid one-click deploy template" \
  --body "Adds the build-push job (feat/fix-gated, GHCR) and the redacted Unraid template reference. See docs/superpowers/specs/2026-06-14-image-build-push-cd-design.md"
```

- [ ] **Step 2: Wait for the PR's CI to be green, then merge**

```bash
gh pr checks --watch
gh pr merge ci/image-build-push --merge --delete-branch
git checkout main && git pull --ff-only
```
Expected: PR's `gate` + `changelog-guard` pass; merge succeeds.

- [ ] **Step 3: Watch the `build-push` job on the merge commit**

The merge commit's first-line subject is `Merge pull request ... ` but the range `before..after` includes the branch's `feat`/`fix`-less commits — they are all `ci:`/`deploy:`/`docs:`. **This merge will NOT trigger a build** (correct: no user-facing change). Confirm the job ran the detect step and skipped the rest:

```bash
RID=$(gh run list --workflow=ci.yml --branch main --limit=1 --json databaseId --jq '.[0].databaseId')
gh run view "$RID" --json jobs --jq '.jobs[] | select(.name=="Build & push image to GHCR") | {name, conclusion, steps: [.steps[] | {name, conclusion}]}'
```
Expected: the `Detect user-facing (feat/fix) changes` step is `success`; the Node/build/push steps are `skipped`.

- [ ] **Step 4: Force a real image build with a trivial feat commit**

To exercise the full build+push path and produce the first GHCR image, make a no-op `feat` commit on main (a comment touch is enough; the changelog guard requires a real feat/fix to publish anyway):

```bash
git commit --allow-empty -m "feat(deploy): publish first GHCR image via CI"
git push origin main
```

- [ ] **Step 5: Watch the build+push run to green**

```bash
RID=$(gh run list --workflow=ci.yml --branch main --limit=1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RID" --exit-status
```
Expected: exits 0; the `Build and push` step succeeds.

- [ ] **Step 6: Confirm the image and both tags exist in GHCR**

```bash
gh api -H "Accept: application/vnd.github+json" \
  "/user/packages/container/roguemeso/versions" \
  --jq '.[0].metadata.container.tags' 2>/dev/null \
  || gh api "/orgs/SaintedRogue/packages/container/roguemeso/versions" --jq '.[0].metadata.container.tags'
```
Expected: a list including `latest` and a 7-char short-SHA tag.

---

## Task 5: Generate the Unraid template on the flash (secret-safe)

Runs on the live box via the devbox. Reads env from the running container and writes the template straight to the flash — **secret values never print to stdout or enter the repo**.

**Files:**
- Create (on flash): `/boot/config/plugins/dockerMan/templates-user/my-roguemeso.xml`

- [ ] **Step 1: Generate the template on the flash**

Run from this workstation (sources devbox creds, runs the generator remotely):

```bash
. /home/rogue/devbox.env
sshpass -p "$pass" ssh -o StrictHostKeyChecking=no "$user@$host" '
set -e
TPL=/boot/config/plugins/dockerMan/templates-user
ENVDUMP=$(docker inspect roguemeso --format "{{range .Config.Env}}{{println .}}{{end}}")
val() { printf "%s\n" "$ENVDUMP" | grep "^$1=" | head -1 | cut -d= -f2-; }
esc() { printf "%s" "$1" | sed -e "s/&/\&amp;/g" -e "s/</\&lt;/g" -e "s/>/\&gt;/g"; }
cfg() { printf "  <Config Name=\"%s\" Target=\"%s\" Default=\"\" Mode=\"\" Description=\"\" Type=\"Variable\" Display=\"always\" Required=\"true\" Mask=\"%s\">%s</Config>\n" "$1" "$2" "$4" "$(esc "$3")"; }
{
  cat <<HEAD
<?xml version="1.0"?>
<Container version="2">
  <Name>roguemeso</Name>
  <Repository>ghcr.io/saintedrogue/roguemeso:latest</Repository>
  <Registry>https://ghcr.io/saintedrogue/roguemeso</Registry>
  <Network>br0</Network>
  <MyIP>10.0.0.232</MyIP>
  <Shell>sh</Shell>
  <Privileged>false</Privileged>
  <Support/>
  <Project/>
  <Overview>RogueMeso hypertrophy training app (Next.js standalone + Prisma).</Overview>
  <Category>HomeAutomation:</Category>
  <WebUI>http://[IP]:3000/</WebUI>
  <Icon>https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/dumbbell.svg</Icon>
  <ExtraParams/>
  <PostArgs/>
  <CPUset/>
  <DateInstalled>0</DateInstalled>
  <DonateText/>
  <DonateLink/>
  <Requires/>
HEAD
  cfg "Node Env" NODE_ENV "$(val NODE_ENV)" false
  cfg "Port" PORT "$(val PORT)" false
  cfg "Hostname" HOSTNAME "$(val HOSTNAME)" false
  cfg "Next Telemetry Disabled" NEXT_TELEMETRY_DISABLED "$(val NEXT_TELEMETRY_DISABLED)" false
  cfg "Auth Secret" AUTH_SECRET "$(val AUTH_SECRET)" true
  cfg "Database URL" DATABASE_URL "$(val DATABASE_URL)" true
  cfg "VAPID Private Key" VAPID_PRIVATE_KEY "$(val VAPID_PRIVATE_KEY)" true
  cfg "VAPID Public Key" VAPID_PUBLIC_KEY "$(val VAPID_PUBLIC_KEY)" false
  cfg "VAPID Subject" VAPID_SUBJECT "$(val VAPID_SUBJECT)" false
  echo "</Container>"
} > /tmp/my-roguemeso.xml
docker run --rm -i -v "$TPL":/d busybox sh -c "cat > /d/my-roguemeso.xml" < /tmp/my-roguemeso.xml
shred -u /tmp/my-roguemeso.xml 2>/dev/null || rm -f /tmp/my-roguemeso.xml
echo "TEMPLATE WRITTEN"
'
```
Expected: prints `TEMPLATE WRITTEN`. No secret values appear in the output.

- [ ] **Step 2: Validate the flash template structurally (no secrets printed)**

```bash
. /home/rogue/devbox.env
sshpass -p "$pass" ssh -o StrictHostKeyChecking=no "$user@$host" '
docker run --rm -v /boot/config/plugins/dockerMan/templates-user:/d:ro busybox sh -c "
  f=/d/my-roguemeso.xml
  echo \"Config entries: $(grep -c "<Config " \$f)\"
  echo \"closes Container: $(grep -c "</Container>" \$f)\"
  grep -oE \"<(Name|Repository|Network|MyIP|WebUI|Icon)>[^<]*\" \$f
  echo \"env Targets present:\"; grep -oE \"Target=\\\"[A-Z_]+\\\"\" \$f | sort -u
"'
```
Expected: `Config entries: 9`, `closes Container: 1`, the Name/Repository/Network/MyIP/WebUI/Icon lines match the spec values, and 9 distinct env Targets (`NODE_ENV`, `PORT`, `HOSTNAME`, `NEXT_TELEMETRY_DISABLED`, `AUTH_SECRET`, `DATABASE_URL`, `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`). No secret *values* are printed.

---

## Task 6: Adopt the template and verify one-click update (user + verify)

This is the only step requiring the Unraid GUI (template adoption is a PHP/GUI action, not scriptable). Requires Task 4 (an image in GHCR) and Task 5 (the template) complete.

**Files:** none (verification)

- [ ] **Step 1 (USER, in the Unraid web GUI):** Docker → **Add Container** → in the *Template* dropdown select **roguemeso** (user templates) → **Apply**. Unraid recreates the `roguemeso` container from the template, pulling `ghcr.io/saintedrogue/roguemeso:latest` (the CI-built image — this is the cutover from the locally-built image to the registry image). Brief downtime during recreate.

- [ ] **Step 2: Confirm the container is healthy on the GHCR image**

```bash
. /home/rogue/devbox.env
sshpass -p "$pass" ssh -o StrictHostKeyChecking=no "$user@$host" '
docker ps --filter name=^/roguemeso$ --format "{{.Names}} {{.Status}} {{.Image}}"
docker exec roguemeso wget -qO- http://127.0.0.1:3000/login >/dev/null && echo "HTTP 200 /login OK" || echo "VERIFY FAILED"
'
```
Expected: container `Up`, image `ghcr.io/saintedrogue/roguemeso:latest`, and `HTTP 200 /login OK`. (Use `127.0.0.1`, not `localhost` — server binds IPv4.)

- [ ] **Step 3: Confirm the Update button now reflects registry state**

In the Unraid Docker page, roguemeso should show as template-managed with version **"up-to-date"** (local digest now equals the GHCR digest just pulled). On the next CI image push it will flip to **"update ready"**, and clicking **Update** performs pull + recreate. No further repo changes needed.

---

## Self-Review

**Spec coverage:**
- `build-push` job, `needs: [gate, changelog-guard]`, `if: main` → Task 2. ✓
- feat/fix gate (env-passed SHAs, all-zeros fallback, injection-safe) → Task 1 + Task 2 detect step. ✓
- Checkout `fetch-depth: 0`, regenerate changelog, GHCR login, build+push `:latest` + `:<short-sha>`, gha cache → Task 2. ✓
- "No build for docs/ci-only merges" → Task 1 Step 4 (unit) + Task 4 Step 3 (real merge). ✓
- Image + tags exist in GHCR → Task 4 Step 6. ✓
- dockerMan template on flash, generated from live container, secret-safe → Task 5. ✓
- Redacted reference copy at `deploy/unraid-roguemeso.xml` → Task 3. ✓
- Secrets never enter repo/assistant context → Task 5 (write-to-flash, redacted confirmation only); Task 3 (blank values). ✓
- One-click Update works → Task 6. ✓

**Placeholder scan:** No TBD/TODO. `[IP]`/`<short-sha>` are Unraid/tag syntax, not placeholders. All steps have exact commands or full file content. ✓

**Type/name consistency:** image `ghcr.io/saintedrogue/roguemeso` (lowercase) everywhere; template `<Name>roguemeso</Name>` matches the running container name; the 9 env Targets are identical across Task 3 (redacted), Task 5 (generator), and Task 5 Step 2 (validation). Script name `scripts/ci-detect-userfacing.sh` matches between Task 1 and Task 2. ✓

**Note on Task 4 Step 4:** publishing the first image needs a `feat`/`fix` commit by design (the gate's whole point). An `--allow-empty feat(deploy)` commit is the minimal honest trigger and also produces a real "What's new" entry for the deploy capability — appropriate, not a hack.
