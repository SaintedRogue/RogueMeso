// Reads the changelog baked into the image at build time (see scripts/gen-changelog.mjs
// and the Dockerfile COPY). Server-only; the file lives at the app root, never under
// public/, so commit history is not exposed to clients. Wrapped in React.cache so the
// layout's render reads + parses it once per request.
import { cache } from "react";
import { readFile } from "node:fs/promises";
import path from "node:path";

/** One commit as baked by gen-changelog.mjs: full SHA, raw subject line, ISO date. */
export type RawCommit = { sha: string; subject: string; date: string };

export const loadChangelog = cache(async (): Promise<RawCommit[]> => {
  try {
    const file = path.join(process.cwd(), "changelog.json");
    const data = JSON.parse(await readFile(file, "utf8")) as { commits?: RawCommit[] };
    return Array.isArray(data.commits) ? data.commits : [];
  } catch {
    return []; // missing/unreadable (e.g. local dev before first gen) — treated as a dev build.
  }
});

/** The current app version = the newest baked commit's SHA, or null if there's no changelog. */
export async function currentVersion(): Promise<string | null> {
  const commits = await loadChangelog();
  return commits[0]?.sha ?? null;
}
