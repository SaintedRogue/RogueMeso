// DEV-TIME generator (not run in prod). Matches our catalog (parsed from the committed
// seed-data.sql, so no DB needed) against a local copy of free-exercise-db, then prints a
// coverage report. With --write it emits prisma/seed/data/descriptions.json — a reviewable
// sourceId -> {ourName, match, score, instructions} map that applyDescriptions consumes.
//
//   curl -sL https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json -o /tmp/fedb.json
//   npx tsx prisma/seed/buildDescriptions.ts [--threshold=0.5] [--write]
import fs from "node:fs";
import path from "node:path";
import { bestMatch, normalizeTokens, buildTokenWeights, type Candidate } from "../../src/lib/exerciseMatch";

const FEDB = process.env.FEDB_JSON ?? "/tmp/fedb.json";
const SQL = path.join(__dirname, "..", "seed-data.sql");
const OUT = path.join(__dirname, "data", "descriptions.json");
const SQL_OUT = path.join(__dirname, "..", "descriptions.sql");

const threshold = Number((process.argv.find((a) => a.startsWith("--threshold=")) ?? "").split("=")[1] || 0.5);
const write = process.argv.includes("--write");

/** Split one SQL VALUES tuple on commas, respecting '' -escaped single-quoted strings. */
function splitValues(tuple: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inStr = false;
  for (let i = 0; i < tuple.length; i++) {
    const c = tuple[i];
    if (inStr) {
      if (c === "'" && tuple[i + 1] === "'") { cur += "'"; i++; }
      else if (c === "'") inStr = false;
      else cur += c;
    } else if (c === "'") inStr = true;
    else if (c === ",") { out.push(cur.trim()); cur = ""; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

type Cat = { sourceId: number; name: string; type: string };
function parseCatalog(): Cat[] {
  const sql = fs.readFileSync(SQL, "utf8");
  const rows: Cat[] = [];
  for (const line of sql.split("\n")) {
    if (!line.includes('INSERT INTO public."Exercise"')) continue;
    const m = line.match(/VALUES \((.*)\);\s*$/);
    if (!m) continue;
    const v = splitValues(m[1]); // [id, sourceId, name, muscleGroupId, exerciseType, ...]
    const sourceId = Number(v[1]);
    if (v[1] === "NULL" || Number.isNaN(sourceId)) continue; // custom rows have no sourceId
    rows.push({ sourceId, name: v[2], type: v[4] });
  }
  return rows;
}

type Fedb = { name: string; equipment: string | null; instructions: string[] };
function loadCandidates(): Candidate[] {
  const data = JSON.parse(fs.readFileSync(FEDB, "utf8")) as Fedb[];
  return data
    .filter((d) => Array.isArray(d.instructions) && d.instructions.length > 0)
    .map((d) => ({
      name: d.name,
      equipment: d.equipment ?? "",
      instructions: d.instructions.map((s) => s.trim()).filter(Boolean),
      tokens: normalizeTokens(d.name),
    }));
}

function main() {
  const catalog = parseCatalog();
  const candidates = loadCandidates();
  console.log(`catalog: ${catalog.length} exercises · candidates: ${candidates.length} (with instructions)\n`);

  const weights = buildTokenWeights(candidates.map((c) => c.tokens));
  const MIN_NAME_DICE = 0.4; // hard gate: real name overlap required, equipment can't rescue
  const scored = catalog.map((c) => ({ ...c, ...bestMatch(c.name, c.type, candidates, weights, MIN_NAME_DICE) }));

  // Score histogram
  const bands = [0, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1.01];
  console.log("score distribution:");
  for (let i = 0; i < bands.length - 1; i++) {
    const n = scored.filter((s) => s.score >= bands[i] && s.score < bands[i + 1]).length;
    console.log(`  ${bands[i].toFixed(2)}–${bands[i + 1] >= 1 ? "1.00" : bands[i + 1].toFixed(2)}: ${"█".repeat(Math.ceil(n / 2))} ${n}`);
  }
  const accepted = scored.filter((s) => s.score >= threshold && s.match);
  console.log(`\nat threshold ${threshold}: ${accepted.length}/${catalog.length} matched (${Math.round((accepted.length / catalog.length) * 100)}%)\n`);

  // Samples around the threshold so we can judge quality
  const near = [...scored].filter((s) => s.match).sort((a, b) => a.score - b.score);
  const show = (label: string, list: typeof near) => {
    console.log(label);
    for (const s of list) console.log(`  ${s.score.toFixed(2)}  "${s.name}" (${s.type})  ->  "${s.match!.name}" (${s.match!.equipment})`);
    console.log();
  };
  show("— weakest accepted (just above threshold):", accepted.sort((a, b) => a.score - b.score).slice(0, 12));
  show("— strongest rejected (just below threshold):", near.filter((s) => s.score < threshold).slice(-10));

  if (write) {
    const byId = [...accepted].sort((a, b) => a.sourceId - b.sourceId);

    // (1) Reviewable JSON map — sourceId -> {ourName, matched source, score, steps}.
    const map: Record<string, { ourName: string; match: string; score: number; instructions: string[] }> = {};
    for (const s of byId) {
      map[s.sourceId] = { ourName: s.name, match: s.match!.name, score: Number(s.score.toFixed(3)), instructions: s.match!.instructions };
    }
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(map, null, 2) + "\n");
    console.log(`wrote ${Object.keys(map).length} entries -> ${path.relative(process.cwd(), OUT)}`);

    // (2) Idempotent backfill SQL the entrypoint runs every start. notes is stored as a
    //     JSON array string (matches the seed convention; lib/exerciseNotes parses it back).
    //     `WHERE notes IS NULL` makes it safe to re-run and never clobbers a hand-edited note.
    const sqlEsc = (v: string) => v.replace(/'/g, "''");
    const lines = [
      "-- Generated by prisma/seed/buildDescriptions.ts — do not edit by hand.",
      "-- Step-by-step form cues sourced from free-exercise-db (public domain, Unlicense),",
      "-- fuzzy-matched to our catalog by name + equipment. Idempotent: fills only NULL notes.",
      "",
    ];
    for (const s of byId) {
      const json = JSON.stringify(s.match!.instructions);
      lines.push(`UPDATE public."Exercise" SET notes = '${sqlEsc(json)}' WHERE "sourceId" = ${s.sourceId} AND notes IS NULL;`);
    }
    fs.writeFileSync(SQL_OUT, lines.join("\n") + "\n");
    console.log(`wrote ${byId.length} UPDATEs -> ${path.relative(process.cwd(), SQL_OUT)}`);
  } else {
    console.log("(report only — pass --write to emit descriptions.json + descriptions.sql)");
  }
}

main();
