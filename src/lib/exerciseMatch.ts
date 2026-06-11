// Pure fuzzy matcher that maps our RP-style catalog names ("Pulldown (Wide Grip)") to
// free-exercise-db entries ("Wide-Grip Lat Pulldown") to borrow their step-by-step
// instructions. Name similarity (Dice coefficient over normalized tokens) plus an
// equipment-agreement nudge to break ties between equipment variants of the same lift.
// Pure + unit-tested; the fetch/DB/file I/O lives in the seed scripts that consume this.

const STOP = new Set(["the", "with", "a", "an", "of", "to", "and", "on", "for", "your", "up", "in"]);

/** Lowercase, drop parens/punctuation/hyphens, split to significant tokens. */
export function normalizeTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/[/\-]/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOP.has(t));
}

const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Collapse both vocabularies (our Prisma exerciseType + free-exercise-db `equipment`)
// onto one coarse class. Unknown/irrelevant values map to "" (no signal, no penalty).
const EQUIP: Record<string, string> = {
  machine: "machine", machineassistance: "machine", medicineball: "machine",
  barbell: "barbell", ezcurlbar: "barbell",
  dumbbell: "dumbbell",
  cable: "cable", freemotion: "cable",
  smithmachine: "smith",
  bodyweightonly: "bodyweight", bodyweightloadable: "bodyweight", bodyonly: "bodyweight",
  exerciseball: "bodyweight", foamroll: "bodyweight",
  kettlebells: "kettlebell", kettlebell: "kettlebell",
  bands: "bands",
};

export function equipClass(raw: string | null | undefined): string {
  if (!raw) return "";
  return EQUIP[compact(raw)] ?? "";
}

/**
 * Inverse-document-frequency weight per token over a corpus of token lists. Rare,
 * distinctive words (the movement: "shrug", "skullcrusher") score high; ubiquitous ones
 * (equipment/position: "cable", "bent", "press") score low. This is what stops a shared
 * "cable bent over" from outscoring a shared movement word. Tokens unseen in the corpus
 * get the max weight (they're maximally distinctive).
 */
export function buildTokenWeights(tokenLists: string[][]): Map<string, number> {
  const df = new Map<string, number>();
  for (const toks of tokenLists) for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);
  const n = tokenLists.length;
  const weights = new Map<string, number>();
  for (const [t, c] of df) weights.set(t, Math.log(1 + n / c));
  return weights;
}

const weightOf = (t: string, w?: Map<string, number>) => (w ? (w.get(t) ?? Math.log(1 + (w.size || 1))) : 1);

/** Dice coefficient over two token sets, optionally weighted by IDF (2·Σwᵢ∩ / (Σwₐ+Σᵦ)). */
export function diceScore(a: string[], b: string[], weights?: Map<string, number>): number {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 || B.size === 0) return 0;
  let wA = 0;
  let wB = 0;
  let shared = 0;
  for (const t of A) wA += weightOf(t, weights);
  for (const t of B) {
    const w = weightOf(t, weights);
    wB += w;
    if (A.has(t)) shared += w;
  }
  return wA + wB === 0 ? 0 : (2 * shared) / (wA + wB);
}

export type Candidate = { name: string; equipment: string; instructions: string[]; tokens: string[] };

/**
 * Score = IDF-weighted name similarity, nudged by equipment agreement (a small ±, so it
 * ranks ties but can't rescue a poor name match). `minNameDice` is a hard gate: a
 * candidate whose raw name similarity is below it scores 0 regardless of equipment — this
 * is what stops "Cable Bent Over Shrug" from matching a "…Side Lateral" just because both
 * are cable. The movement has to actually overlap.
 */
export function scoreMatch(
  ourTokens: string[],
  ourEquip: string,
  cand: Candidate,
  weights?: Map<string, number>,
  minNameDice = 0,
): number {
  const base = diceScore(ourTokens, cand.tokens, weights);
  if (base < minNameDice) return 0;
  const ce = equipClass(cand.equipment);
  if (ourEquip && ce) return base + (ourEquip === ce ? 0.06 : -0.08);
  return base;
}

/** Best free-exercise-db candidate for one of our exercises, with its score. */
export function bestMatch(
  ourName: string,
  ourType: string,
  candidates: Candidate[],
  weights?: Map<string, number>,
  minNameDice = 0,
): { match: Candidate | null; score: number } {
  const toks = normalizeTokens(ourName);
  const eq = equipClass(ourType);
  let best: Candidate | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const sc = scoreMatch(toks, eq, c, weights, minNameDice);
    if (sc > bestScore) {
      bestScore = sc;
      best = c;
    }
  }
  return { match: best, score: bestScore };
}
