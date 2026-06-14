// Integrity guard for the "What's new" changelog feature. Fails (exit 1) if any of the
// plumbing that the feature depends on has rotted — the kind of silent breakage the
// general lint/typecheck/test/build gate does NOT catch (a malformed changelog.json still
// builds; a removed Dockerfile COPY still builds; a dropped migration still builds).
//
// Runnable locally (`npm run check:changelog`) and in CI (.github/workflows/ci.yml).
// Read-only: regenerates into a temp file so it never clobbers the working changelog.json.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const problems = [];
const fail = (msg) => problems.push(msg);

// 1. changelog.json exists, parses, and has the shape lib/changelog.ts expects.
function validateShape(label, raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    fail(`${label}: not valid JSON (${e.message})`);
    return;
  }
  if (typeof data.generatedFromSha !== "string" || !data.generatedFromSha) {
    fail(`${label}: missing/invalid "generatedFromSha"`);
  }
  if (!Array.isArray(data.commits) || data.commits.length === 0) {
    fail(`${label}: "commits" must be a non-empty array`);
    return;
  }
  const bad = data.commits.find(
    (c) => !c || typeof c.sha !== "string" || typeof c.subject !== "string" || typeof c.date !== "string",
  );
  if (bad) fail(`${label}: every commit needs string sha/subject/date — offending entry: ${JSON.stringify(bad)}`);
}

if (!existsSync("changelog.json")) {
  fail("changelog.json is missing (run `npm run gen:changelog`)");
} else {
  validateShape("changelog.json", readFileSync("changelog.json", "utf8"));
}

// 2. The generator runs and produces a structurally valid changelog (non-destructively).
const tmp = path.join(tmpdir(), `changelog-check-${process.pid}.json`);
try {
  execFileSync("node", ["scripts/gen-changelog.mjs", tmp], { stdio: "pipe" });
  validateShape("gen-changelog.mjs output", readFileSync(tmp, "utf8"));
} catch (e) {
  fail(`gen-changelog.mjs failed to run: ${e.message}`);
} finally {
  rmSync(tmp, { force: true });
}

// 3. Core source files still exist.
for (const f of [
  "src/lib/changelog.ts",
  "src/lib/updates.ts",
  "src/lib/updatesActions.ts",
  "src/components/UpdatesPanel.tsx",
  "scripts/gen-changelog.mjs",
]) {
  if (!existsSync(f)) fail(`required feature file missing: ${f}`);
}

// 4. The Dockerfile still copies the baked changelog into the image.
const dockerfile = existsSync("Dockerfile") ? readFileSync("Dockerfile", "utf8") : "";
if (!/COPY\s+--from=builder\s+\/app\/changelog\.json/.test(dockerfile)) {
  fail('Dockerfile is missing the `COPY --from=builder /app/changelog.json` line');
}

// 5. The per-user version column + its migration are present.
const schema = existsSync("prisma/schema.prisma") ? readFileSync("prisma/schema.prisma", "utf8") : "";
if (!/lastSeenVersion/.test(schema)) {
  fail("prisma/schema.prisma no longer declares `lastSeenVersion`");
}
let migrationHasColumn = false;
try {
  const out = execFileSync("grep", ["-rl", "lastSeenVersion", "prisma/migrations"], { encoding: "utf8" });
  migrationHasColumn = out.trim().length > 0;
} catch {
  migrationHasColumn = false; // grep exits 1 when no match
}
if (!migrationHasColumn) fail("no migration under prisma/migrations adds `lastSeenVersion`");

// Report.
if (problems.length) {
  console.error(`✗ changelog integrity check failed (${problems.length}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("✓ changelog integrity check passed");
