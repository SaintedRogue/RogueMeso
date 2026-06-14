# GitHub Actions Full-Gate CI + README Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single GitHub Actions workflow that runs the full validation gate (lint, typecheck, tests, `next build`) on every branch push and PR to `main`, plus a CI status badge in the README.

**Architecture:** One workflow file (`.github/workflows/ci.yml`) with one `gate` job running 8 sequential steps in fail-fast order (cheap checks first, slow `next build` last). The build step gets a dummy `DATABASE_URL` so Prisma can parse the schema. No DB service, no deploy automation.

**Tech Stack:** GitHub Actions, Node 22 LTS, npm, Prisma, vitest, ESLint, TypeScript, Next.js 16.

---

## File Structure

- **Create:** `.github/workflows/ci.yml` — the CI workflow (triggers + single `gate` job).
- **Modify:** `README.md` — add CI status badge at the top.
- **Reference (no change):** `package.json` (scripts: `test`, `lint`, `build`), `prisma/schema.prisma` (reads `env("DATABASE_URL")`).

---

## Task 0: Establish a green local baseline

The first CI run will gate whatever is committed. There are currently uncommitted changes in the working tree. Confirm the full gate passes locally on the current tree **before** wiring up CI, so the first run isn't red for unrelated reasons.

**Files:** none (verification only)

- [ ] **Step 1: Run the full gate locally, exactly as CI will**

```bash
npx prisma generate \
  && npx eslint \
  && npx tsc --noEmit \
  && npm test \
  && DATABASE_URL="postgresql://user:pass@localhost:5432/db" npm run build
```

Expected: every command exits 0; final line is a successful Next.js build summary.

- [ ] **Step 2: If anything fails, stop and report**

Do not proceed to create the workflow until the gate is green locally. Report which step failed and its output. (Fixing pre-existing failures is out of scope for this plan — surface it to the user for a decision.)

---

## Task 1: Create the CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow file**

Create `.github/workflows/ci.yml` with exactly this content:

```yaml
name: CI

on:
  push:
    branches: ['**']
  pull_request:
    branches: [main]

jobs:
  gate:
    name: Full gate (lint, typecheck, test, build)
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Generate Prisma client
        run: npx prisma generate

      - name: Lint
        run: npx eslint

      - name: Typecheck
        run: npx tsc --noEmit

      - name: Test
        run: npm test

      - name: Build
        run: npm run build
        env:
          DATABASE_URL: postgresql://user:pass@localhost:5432/db
```

- [ ] **Step 2: Validate the YAML parses**

Run:

```bash
node -e "const fs=require('fs');const s=fs.readFileSync('.github/workflows/ci.yml','utf8');if(!s.includes('jobs:')||!s.includes('gate:'))throw new Error('missing job');console.log('yaml structure OK')"
```

Expected: prints `yaml structure OK`. (Validates the file exists and has the job; full schema validation happens on GitHub.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add full-gate workflow (lint, typecheck, test, build)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Add the README status badge

**Files:**
- Modify: `README.md` (top of file)

- [ ] **Step 1: Read the current README top**

Run:

```bash
head -5 README.md
```

Note the exact first line (the H1 title) so the badge can be inserted directly under it.

- [ ] **Step 2: Insert the badge directly under the H1 title**

Add this line as its own paragraph immediately below the first `#` heading line, separated by blank lines:

```markdown
[![CI](https://github.com/SaintedRogue/RogueMeso/actions/workflows/ci.yml/badge.svg)](https://github.com/SaintedRogue/RogueMeso/actions/workflows/ci.yml)
```

Use the Edit tool: match the existing H1 line and append the blank line + badge after it. Do not change any other README content.

- [ ] **Step 3: Verify the badge line is present**

Run:

```bash
grep -F "actions/workflows/ci.yml/badge.svg" README.md && echo "badge present"
```

Expected: prints the badge line followed by `badge present`.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add CI status badge to README

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Push and confirm the first run is green

This validates the workflow against real GitHub Actions — the only place the full schema and runner behavior are exercised.

**Files:** none (verification only)

- [ ] **Step 1: Determine the current branch**

```bash
git branch --show-current
```

Note the branch name (used in the next step).

- [ ] **Step 2: Push the current branch**

```bash
git push -u origin "$(git branch --show-current)"
```

Expected: push succeeds over HTTPS. (Per project notes, push uses HTTPS.)

- [ ] **Step 3: Watch the run to a pass/fail result**

```bash
gh run watch --exit-status $(gh run list --workflow=ci.yml --limit=1 --json databaseId --jq '.[0].databaseId')
```

Expected: streams the `gate` job and exits 0 on success. If it exits non-zero, report which step failed with `gh run view --log-failed`.

- [ ] **Step 4: Confirm the badge resolves**

```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://github.com/SaintedRogue/RogueMeso/actions/workflows/ci.yml/badge.svg"
```

Expected: `200`.

---

## Self-Review

**Spec coverage:**
- Triggers (push any branch + PR to main) → Task 1 Step 1. ✓
- Full gate, fail-fast order, dummy `DATABASE_URL` → Task 1 Step 1. ✓
- `prisma generate` before build → Task 1 Step 1. ✓
- Node 22 pinned → Task 1 Step 1. ✓
- README badge → Task 2. ✓
- Out of scope (no deploy/DB/matrix) → honored; none added. ✓
- Success criteria "gate passes green" → Task 0 (local) + Task 3 (CI). ✓

**Placeholder scan:** No TBD/TODO; all steps contain exact commands or full file content. ✓

**Type/name consistency:** Workflow name `CI`, job id `gate`, file path `.github/workflows/ci.yml`, and badge URL all match across Tasks 1–3 and the badge in Task 2. ✓
