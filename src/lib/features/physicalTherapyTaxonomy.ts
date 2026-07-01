// Physical Therapy Lens — taxonomy value sets + a pure classifier. Single source of truth for:
//   • movement patterns and how they group into push / pull / horizontal (analytics),
//   • the primary joints a lift loads (Joint/tissue-load view),
//   • the capture vocabularies (pain regions, quality tags, ROM, timing, side).
//
// `inferTaxonomy` heuristically maps an exercise (name + muscle group) to a pattern + joints.
// It is deterministic and unit-tested; the deploy seed (prisma/exercise-taxonomy.sql) is
// GENERATED from it (scripts/gen-taxonomy-seed.ts) so there is exactly one classifier. The
// result is stored as EDITABLE columns, so an approximate guess can always be corrected later.
// Anything it can't place stays null and is bucketed as "Unclassified" everywhere — never a crash.

// ----- Movement patterns -----

export const MOVEMENT_PATTERNS = [
  "horizontal-push",
  "vertical-push",
  "horizontal-pull",
  "vertical-pull",
  "squat",
  "hinge",
  "lunge",
  "core",
  "isolation",
] as const;
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

export const PATTERN_LABELS: Record<MovementPattern, string> = {
  "horizontal-push": "Horizontal push",
  "vertical-push": "Vertical push",
  "horizontal-pull": "Horizontal pull",
  "vertical-pull": "Vertical pull",
  squat: "Squat",
  hinge: "Hinge",
  lunge: "Lunge / unilateral",
  core: "Core",
  isolation: "Calves / isolation",
};

/** Label for a possibly-null pattern; null/unknown → "Unclassified". */
export function patternLabel(pattern: string | null | undefined): string {
  if (pattern && pattern in PATTERN_LABELS) return PATTERN_LABELS[pattern as MovementPattern];
  return "Unclassified";
}

const PUSH_PATTERNS = new Set<MovementPattern>(["horizontal-push", "vertical-push"]);
const PULL_PATTERNS = new Set<MovementPattern>(["horizontal-pull", "vertical-pull"]);

/** Push / pull / neither — the axis the push:pull ratio is built on. */
export function pushPullOf(pattern: string | null | undefined): "push" | "pull" | null {
  if (pattern && PUSH_PATTERNS.has(pattern as MovementPattern)) return "push";
  if (pattern && PULL_PATTERNS.has(pattern as MovementPattern)) return "pull";
  return null;
}

/** True for the two horizontal patterns (the shoulder-health-relevant push:pull sub-ratio). */
export function isHorizontal(pattern: string | null | undefined): boolean {
  return pattern === "horizontal-push" || pattern === "horizontal-pull";
}

// ----- Joints -----

export const JOINTS = ["shoulder", "elbow", "wrist", "hip", "knee", "ankle", "spine"] as const;
export type Joint = (typeof JOINTS)[number];

export const JOINT_LABELS: Record<Joint, string> = {
  shoulder: "Shoulder",
  elbow: "Elbow",
  wrist: "Wrist",
  hip: "Hip",
  knee: "Knee",
  ankle: "Ankle",
  spine: "Spine / low back",
};

// ----- Capture vocabularies (pain / quality / ROM / timing / side) -----

export const PAIN_REGIONS = [
  "neck",
  "shoulder",
  "elbow",
  "wrist",
  "upper-back",
  "low-back",
  "hip",
  "knee",
  "ankle",
  "other",
] as const;
export type PainRegion = (typeof PAIN_REGIONS)[number];

export const PAIN_REGION_LABELS: Record<PainRegion, string> = {
  neck: "Neck",
  shoulder: "Shoulder",
  elbow: "Elbow",
  wrist: "Wrist",
  "upper-back": "Upper back",
  "low-back": "Low back",
  hip: "Hip",
  knee: "Knee",
  ankle: "Ankle",
  other: "Other",
};

export const PAIN_TIMINGS = ["during", "after", "next-day"] as const;
export type PainTiming = (typeof PAIN_TIMINGS)[number];
export const PAIN_TIMING_LABELS: Record<PainTiming, string> = {
  during: "During",
  after: "After",
  "next-day": "Next day",
};

export const ROM_OPTIONS = ["full", "partial", "short"] as const;
export type RangeOfMotion = (typeof ROM_OPTIONS)[number];
export const ROM_LABELS: Record<RangeOfMotion, string> = {
  full: "Full",
  partial: "Partial",
  short: "Cut short",
};

export const QUALITY_TAGS = [
  "clean",
  "form-breakdown",
  "joint-pinch",
  "cut-rom",
  "grinder",
  "tweak",
  "felt-strong",
  "felt-weak",
] as const;
export type QualityTag = (typeof QUALITY_TAGS)[number];
export const QUALITY_TAG_LABELS: Record<QualityTag, string> = {
  clean: "Clean",
  "form-breakdown": "Form breakdown",
  "joint-pinch": "Joint pinch",
  "cut-rom": "Cut ROM",
  grinder: "Grinder",
  tweak: "Tweak / flare",
  "felt-strong": "Felt strong",
  "felt-weak": "Felt weak",
};

export const SIDES = ["bilateral", "left", "right"] as const;
export type Side = (typeof SIDES)[number];
export const SIDE_LABELS: Record<Side, string> = {
  bilateral: "Both",
  left: "Left",
  right: "Right",
};
/** A stored side (null == bilateral) normalized to a concrete Side. */
export function normalizeSide(side: string | null | undefined): Side {
  return side === "left" || side === "right" ? side : "bilateral";
}

// ----- Inference (name + muscle group → pattern + joints) -----

export type InferredTaxonomy = { pattern: MovementPattern | null; joints: Joint[] };

// Ordered name-keyword rules: the FIRST whose test matches wins, so put the more specific
// patterns (split squat, close-grip bench) ahead of the general ones (squat, bench). Keeping
// this as data keeps the generator and any future auto-classify path identical.
type Rule = { test: (n: string) => boolean; pattern: MovementPattern; joints: Joint[] };
const has = (n: string, ...words: string[]) => words.some((w) => n.includes(w));

const NAME_RULES: Rule[] = [
  // Unilateral / lunge — must precede "squat" (a split squat is not a squat pattern).
  { test: (n) => has(n, "split squat", "bulgarian", "lunge", "step up", "step-up", "stepup", "pistol", "single-leg", "single leg", "shrimp", "curtsy"), pattern: "lunge", joints: ["hip", "knee", "ankle"] },
  // Squat
  { test: (n) => has(n, "squat", "hack squat", "leg press", "sissy"), pattern: "squat", joints: ["hip", "knee", "ankle"] },
  // Hinge — deadlift family, hip extension, glute work, swings.
  { test: (n) => has(n, "deadlift", "romanian", "rdl", "stiff-leg", "stiff leg", "good morning", "hip thrust", "glute bridge", "hip hinge", "swing", "kettlebell swing", "pull through", "pull-through", "back extension", "hyperextension", "hyper extension"), pattern: "hinge", joints: ["hip", "spine"] },
  // Core / abs
  { test: (n) => has(n, "crunch", "sit up", "sit-up", "situp", "plank", "leg raise", "knee raise", "hanging", "rollout", "roll out", "russian twist", "woodchop", "wood chop", "pallof", "dead bug", "hollow", "ab wheel", "toes to bar", "windmill", "turkish"), pattern: "core", joints: ["spine", "hip"] },
  // Vertical pull — pulldowns / pull-ups / chin-ups.
  { test: (n) => has(n, "pulldown", "pull down", "pull-down", "pull up", "pull-up", "pullup", "chin up", "chin-up", "chinup", "lat pull"), pattern: "vertical-pull", joints: ["shoulder", "elbow"] },
  // Horizontal pull — rows, face pulls, rear delts. Must precede press-based rules.
  { test: (n) => has(n, "row", "face pull", "facepull", "rear delt", "rear-delt", "pull apart", "pull-apart", "inverted row"), pattern: "horizontal-pull", joints: ["shoulder", "elbow"] },
  // Vertical push — overhead pressing.
  { test: (n) => has(n, "overhead press", "shoulder press", "military", "push press", "ohp", "arnold press", "z press", "landmine press"), pattern: "vertical-push", joints: ["shoulder", "elbow"] },
  // Horizontal push — bench, chest press, dips, push-ups. (Fly is isolation, handled below.)
  { test: (n) => has(n, "bench", "chest press", "push up", "push-up", "pushup", "dip", "floor press", "close grip", "close-grip", "jm press"), pattern: "horizontal-push", joints: ["shoulder", "elbow"] },
  // Shoulder isolation raises.
  { test: (n) => has(n, "lateral raise", "side raise", "front raise", "upright row", "rear raise", "reverse fly", "reverse flye"), pattern: "isolation", joints: ["shoulder"] },
  // Chest isolation (fly).
  { test: (n) => has(n, "fly", "flye", "pec deck", "pec dec", "cable crossover", "crossover"), pattern: "isolation", joints: ["shoulder"] },
  // Elbow isolation — curls & triceps extensions/pushdowns.
  { test: (n) => has(n, "curl") && !has(n, "leg curl", "hamstring curl", "nordic"), pattern: "isolation", joints: ["elbow"] },
  { test: (n) => has(n, "pushdown", "push down", "tricep", "triceps", "skull", "kickback", "overhead extension", "french press"), pattern: "isolation", joints: ["elbow"] },
  // Knee isolation.
  { test: (n) => has(n, "leg extension", "knee extension"), pattern: "isolation", joints: ["knee"] },
  { test: (n) => has(n, "leg curl", "hamstring curl", "nordic", "ham curl"), pattern: "isolation", joints: ["knee"] },
  // Calves.
  { test: (n) => has(n, "calf", "calves", "raise (standing)", "toe raise", "tibialis"), pattern: "isolation", joints: ["ankle"] },
  // Traps.
  { test: (n) => has(n, "shrug"), pattern: "isolation", joints: ["shoulder"] },
  // Forearm / wrist.
  { test: (n) => has(n, "wrist", "forearm", "reverse curl", "hammer curl"), pattern: "isolation", joints: ["wrist", "elbow"] },
];

// Fallback by muscle group when the name matched nothing.
const MUSCLE_FALLBACK: Record<string, InferredTaxonomy> = {
  Chest: { pattern: "horizontal-push", joints: ["shoulder", "elbow"] },
  Back: { pattern: "horizontal-pull", joints: ["shoulder", "elbow"] },
  Shoulders: { pattern: "vertical-push", joints: ["shoulder", "elbow"] },
  Traps: { pattern: "isolation", joints: ["shoulder"] },
  Biceps: { pattern: "isolation", joints: ["elbow"] },
  Triceps: { pattern: "isolation", joints: ["elbow"] },
  Forearms: { pattern: "isolation", joints: ["wrist", "elbow"] },
  Quads: { pattern: "squat", joints: ["hip", "knee", "ankle"] },
  Glutes: { pattern: "hinge", joints: ["hip", "knee"] },
  Hamstrings: { pattern: "hinge", joints: ["hip", "knee"] },
  Calves: { pattern: "isolation", joints: ["ankle"] },
  Abs: { pattern: "core", joints: ["spine", "hip"] },
};

/**
 * Best-effort classification of an exercise into a movement pattern + primary joints. Tries
 * name keywords first (most specific wins), then falls back to the muscle group. Returns
 * `{ pattern: null, joints: [] }` when nothing matches — the caller stores null ("Unclassified").
 */
export function inferTaxonomy(name: string, muscleGroup: string | null | undefined): InferredTaxonomy {
  const n = name.toLowerCase();
  for (const rule of NAME_RULES) {
    if (rule.test(n)) return { pattern: rule.pattern, joints: [...rule.joints] };
  }
  const fb = muscleGroup ? MUSCLE_FALLBACK[muscleGroup] : undefined;
  if (fb) return { pattern: fb.pattern, joints: [...fb.joints] };
  return { pattern: null, joints: [] };
}
