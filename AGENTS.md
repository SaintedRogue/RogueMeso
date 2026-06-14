<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Development process: validate in CI, not locally

There is a GitHub Actions full gate at `.github/workflows/ci.yml` (lint → typecheck → test → `next build`) that runs on every branch push and PR to `main`. Use it as the source of truth for full validation instead of running the heavy gate locally — the goal is to keep verbose `tsc`/`eslint`/`next build` output out of the session.

- **Full validation:** push the branch and check the result with `gh run watch --exit-status` (one pass/fail line). Do **not** run `tsc --noEmit`, `eslint`, or `next build` locally as routine pre-merge verification.
- **Tight loops only:** the fast local unit tests (`npm test`, ~0.6s, no DB/browser) are fine for TDD and debugging. CI complements them; it does not replace them.
- **Before merge:** the CI `gate` check must be green.
- CI is GitHub-side only — deploys to Unraid remain a separate manual step.
