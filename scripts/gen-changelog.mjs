// Generate changelog.json from git history, for the sidebar "What's new" panel.
//
// Run on the BUILD HOST (the repo is private and .git is excluded from the Docker context,
// so this can't run inside the build). The Dockerfile then COPYs the resulting file into
// the image, where lib/changelog.ts reads it at runtime.
//
//   node scripts/gen-changelog.mjs            → writes ./changelog.json
//   node scripts/gen-changelog.mjs <outPath>  → writes <outPath> (used by the CI guard
//                                               to validate non-destructively)
//
// The file is committed as a baseline so `docker build` never fails on a missing COPY
// source; the deploy step regenerates it so the shipped image reflects the built commit.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const OUT = process.argv[2] ?? "changelog.json";
const LIMIT = 200; // bounds the committed file; far more than any realistic version gap.

// NUL-ish delimiters keep arbitrary commit subjects intact: \x1f between fields, \x1e
// between records. Merges are INCLUDED so any deployed SHA can be located for diffing —
// non-feat/fix subjects are filtered out at render time, not here.
let raw = "";
try {
  raw = execFileSync(
    "git",
    ["log", `-n${LIMIT}`, "--pretty=format:%H%x1f%s%x1f%cI%x1e"],
    { encoding: "utf8" },
  );
} catch (e) {
  // No git / not a repo: emit an empty changelog rather than failing the build.
  console.error(`gen-changelog: git log failed (${e.message}); writing empty changelog.`);
}

const commits = raw
  .split("\x1e")
  .map((r) => r.trim())
  .filter(Boolean)
  .map((rec) => {
    const [sha, subject, date] = rec.split("\x1f");
    return { sha, subject, date };
  });

const out = { generatedFromSha: commits[0]?.sha ?? null, commits };
writeFileSync(OUT, JSON.stringify(out) + "\n");
console.log(`gen-changelog: wrote ${commits.length} commits to ${OUT}`);
