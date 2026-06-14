// "What's new" data layer. The running image is built with a baked changelog (the git log
// of the built commit — see scripts/gen-changelog.mjs + lib/changelog.ts). The current
// version is the newest baked SHA; each user carries lastSeenVersion (the SHA they last
// acknowledged). The commits between the two, filtered to user-facing feat/fix subjects,
// are the changelog the sidebar panel shows. No network, no token — fully self-contained.
import { cache } from "react";
import { getCurrentUser } from "@/lib/auth";
import { loadChangelog, type RawCommit } from "@/lib/changelog";

const REPO = "SaintedRogue/RogueMeso";
const commitUrl = (sha: string) => `https://github.com/${REPO}/commit/${sha}`;

/** A single user-facing change, parsed from a conventional-commit subject line. */
export type UpdateItem = {
  type: "feat" | "fix";
  scope: string | null; // e.g. "meso" from "feat(meso): ..."
  summary: string; // the message after the prefix
  sha: string; // short (7-char) SHA
  url: string; // GitHub commit page (viewable by the repo owner)
  date: string; // ISO commit date
};

/**
 * The four states the panel renders from:
 *  - dev:      no baked changelog (local `next dev` before a gen) — nothing to show.
 *  - baseline: user has never acknowledged a version — the client silently records the
 *              current one so they only see changes shipped from here forward.
 *  - current:  nothing new since the user last looked.
 *  - updates:  one or more feat/fix commits since the user's last seen version.
 */
export type UpdatesState =
  | { kind: "dev" }
  | { kind: "baseline"; version: string }
  | { kind: "current"; version: string }
  | { kind: "updates"; version: string; items: UpdateItem[] };

// feat / fix conventional-commit subject: "feat(scope)!: summary" → type, scope, summary.
// Other types (chore, docs, refactor, merge commits) don't match and are dropped.
const CONVENTIONAL = /^(feat|fix)(?:\(([^)]+)\))?!?:\s*(.+)$/;

/**
 * Resolve what's changed for the current user since they last looked. Wrapped in
 * React.cache so the layout renders it once per request.
 */
export const getUpdates = cache(async (): Promise<UpdatesState> => {
  const commits = await loadChangelog();
  if (!commits.length) return { kind: "dev" };
  const version = commits[0].sha;

  const me = await getCurrentUser();
  if (!me) return { kind: "dev" }; // layout requires a user before this runs; defensive.

  const base = me.lastSeenVersion;
  if (!base) return { kind: "baseline", version };
  if (base === version) return { kind: "current", version };

  // Commits newer than the user's last-seen version. If their base SHA isn't in the baked
  // window (their last build aged out past the limit), fall back to the whole window so
  // they still see recent changes rather than nothing.
  const idx = commits.findIndex((c) => c.sha === base);
  const newer = idx === -1 ? commits : commits.slice(0, idx);

  const items = newer.map(parseCommit).filter((c): c is UpdateItem => c !== null);
  return items.length ? { kind: "updates", version, items } : { kind: "current", version };
});

/** Map a baked commit to an UpdateItem, or null if its subject isn't a feat/fix. */
function parseCommit(c: RawCommit): UpdateItem | null {
  const m = CONVENTIONAL.exec(c.subject);
  if (!m) return null;
  return {
    type: m[1] as "feat" | "fix",
    scope: m[2] ?? null,
    summary: m[3],
    sha: c.sha.slice(0, 7),
    url: commitUrl(c.sha),
    date: c.date,
  };
}
