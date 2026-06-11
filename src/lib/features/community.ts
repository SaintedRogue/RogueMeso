import { prisma } from "@/lib/prisma";
import { estimated1RM } from "@/lib/features/insights";

// Community (instance-local social) logic. Split like insights.ts:
//   1. PURE transforms below — no I/O, deterministic, unit-tested.
//   2. Async Prisma wrappers further down — fetch rows, feed the pure half, write feed
//      activities. The "is this user opted in" gate lives in the wrappers, once each.

// ----- Reactions -----

/** The curated kudos set. Anything else is rejected at the action layer. */
export const REACTION_EMOJI = ["💪", "🔥", "👏"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJI)[number];

export function isAllowedEmoji(e: string): e is ReactionEmoji {
  return (REACTION_EMOJI as readonly string[]).includes(e);
}

// ----- Activity identity -----

export type ActivityKind = "workout_complete" | "pr_hit" | "meso_complete";

/**
 * Stable idempotency key for an activity. The unique constraint on Activity.dedupeKey
 * turns "create the post for this event" into an upsert: re-editing a completed set,
 * a retry, or a double-tap can't produce a duplicate feed item. The key must be unique
 * across the whole instance, so PR keys are scoped by userId (exerciseId is a shared
 * catalog id; dayId/mesoId already belong to exactly one user).
 *  - workout_complete:{mesoDayId}      - one post per finished day
 *  - meso_complete:{mesoId}            - one post per finished block
 *  - pr_hit:{userId}:{exerciseId}      - one "current PR" post per user per exercise
 */
export function dedupeKey(kind: ActivityKind, ...parts: number[]): string {
  return [kind, ...parts].join(":");
}

// ----- PR detection -----

export type PrResult = { oneRm: number } | null;

/**
 * Decide whether a just-logged set is a new estimated-1RM PR for its exercise.
 * `priorBestOneRm` is the best est-1RM across all the user's earlier completed sets of
 * that exercise (null if none). A tie is NOT a PR (avoids feed spam on a repeat lift).
 * Returns the new rounded 1RM to snapshot onto the activity.
 */
export function detectPR(weight: number, reps: number, priorBestOneRm: number | null): PrResult {
  const oneRm = estimated1RM(weight, reps);
  if (priorBestOneRm != null && oneRm <= priorBestOneRm) return null;
  return { oneRm: Math.round(oneRm) };
}

// ----- Streaks & leaderboard -----

/** Integer calendar-day index (UTC) for a timestamp, so streaks are simple arithmetic. */
export function dayIndex(d: Date): number {
  return Math.floor(d.getTime() / 86_400_000);
}

/**
 * Consecutive-day workout streak ending today or yesterday. `days` are day indices
 * (see dayIndex); order/dupes don't matter. A streak whose latest day is older than
 * yesterday is dead (returns 0).
 */
export function currentStreak(days: number[], today: number): number {
  const sorted = [...new Set(days)].sort((a, b) => b - a);
  if (sorted.length === 0) return 0;
  let cursor = sorted[0];
  if (cursor !== today && cursor !== today - 1) return 0;
  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === cursor - 1) {
      streak++;
      cursor--;
    } else break;
  }
  return streak;
}

export type LeaderboardInput = {
  userId: number;
  name: string;
  workouts: number;
  sets: number;
  volume: number;
  workoutDayIndices: number[];
};
export type LeaderboardRow = {
  userId: number;
  name: string;
  workouts: number;
  sets: number;
  volume: number;
  streak: number;
};

/** Rank members by workouts → sets → volume → name, attaching each one's live streak. */
export function aggregateLeaderboard(input: LeaderboardInput[], today: number): LeaderboardRow[] {
  return input
    .map((r) => ({
      userId: r.userId,
      name: r.name,
      workouts: r.workouts,
      sets: r.sets,
      volume: r.volume,
      streak: currentStreak(r.workoutDayIndices, today),
    }))
    .sort(
      (a, b) =>
        b.workouts - a.workouts ||
        b.sets - a.sets ||
        b.volume - a.volume ||
        a.name.localeCompare(b.name),
    );
}

// ----- Async Prisma wrappers. Opt-in gate + "complete" filter live here, once. -----

/** Display name for the feed/leaderboard: chosen name, else the email local-part. */
function actorName(u: { name: string | null; email: string }): string {
  return u.name?.trim() || u.email.split("@")[0];
}

/** Whether a user participates in the community. The single gate every writer checks. */
async function isOptedIn(userId: number): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { communityOptIn: true } });
  return !!u?.communityOptIn;
}

// === Activity writers (fire-and-forget from the set-logging hot path) ===
// All three early-return unless the author has opted in, and use dedupeKey upserts so
// they're safe to call repeatedly. No backfill: the feed starts empty and accrues from
// the moment a member opts in.

/** Post (or refresh) the "finished a workout" activity when a day completes. Also posts
 *  the "finished a mesocycle" activity once every day in the block is complete. */
export async function maybePostWorkoutActivity(dayId: number, userId: number): Promise<void> {
  if (!(await isOptedIn(userId))) return;

  const day = await prisma.mesoDay.findUnique({
    where: { id: dayId },
    select: {
      status: true,
      finishedAt: true,
      meso: { select: { id: true, key: true, name: true, weeksCount: true, userId: true } },
    },
  });
  if (!day || day.status !== "complete" || day.meso.userId !== userId) return;

  const setsCount = await prisma.exerciseSet.count({
    where: { status: "complete", dayExercise: { dayId } },
  });
  const occurredAt = day.finishedAt ?? new Date();

  await prisma.activity.upsert({
    where: { dedupeKey: dedupeKey("workout_complete", dayId) },
    create: {
      userId,
      type: "workoutComplete",
      dedupeKey: dedupeKey("workout_complete", dayId),
      occurredAt,
      mesoKey: day.meso.key,
      mesoName: day.meso.name,
      setsCount,
    },
    update: { setsCount }, // a re-edit may change the count; headline/time stay put
  });

  // Whole block finished? (no remaining incomplete days)
  const remaining = await prisma.mesoDay.count({
    where: { mesoId: day.meso.id, status: { not: "complete" } },
  });
  if (remaining === 0) {
    await prisma.activity.upsert({
      where: { dedupeKey: dedupeKey("meso_complete", day.meso.id) },
      create: {
        userId,
        type: "mesoComplete",
        dedupeKey: dedupeKey("meso_complete", day.meso.id),
        occurredAt: new Date(),
        mesoKey: day.meso.key,
        mesoName: day.meso.name,
        weeksCount: day.meso.weeksCount,
      },
      update: {},
    });
  }
}

/** Post (or raise) the "new PR" activity if a just-logged set beats this exercise's best. */
export async function maybePostPrActivity(setId: number, userId: number): Promise<void> {
  if (!(await isOptedIn(userId))) return;

  const set = await prisma.exerciseSet.findUnique({
    where: { id: setId },
    select: {
      weight: true,
      reps: true,
      status: true,
      finishedAt: true,
      unit: true,
      dayExercise: {
        select: {
          exerciseId: true,
          exercise: { select: { name: true } },
          day: { select: { meso: { select: { userId: true, unit: true } } } },
        },
      },
    },
  });
  if (!set || set.status !== "complete" || set.weight == null || set.reps == null) return;
  if (set.dayExercise.day.meso.userId !== userId) return;

  const exerciseId = set.dayExercise.exerciseId;
  const priorSets = await prisma.exerciseSet.findMany({
    where: {
      status: "complete",
      weight: { not: null },
      reps: { not: null },
      id: { not: setId },
      dayExercise: { exerciseId, day: { meso: { userId } } },
    },
    select: { weight: true, reps: true },
  });
  const priorBest =
    priorSets.reduce((m, s) => Math.max(m, estimated1RM(s.weight!, s.reps!)), 0) || null;

  const pr = detectPR(set.weight, set.reps, priorBest);
  if (!pr) return;

  const unit = set.unit ?? set.dayExercise.day.meso.unit;
  const occurredAt = set.finishedAt ?? new Date();
  const prKey = dedupeKey("pr_hit", userId, exerciseId); // user-scoped: keys are instance-unique
  await prisma.activity.upsert({
    where: { dedupeKey: prKey },
    create: {
      userId,
      type: "prHit",
      dedupeKey: prKey,
      occurredAt,
      exerciseName: set.dayExercise.exercise.name,
      prWeight: set.weight,
      prReps: set.reps,
      prOneRm: pr.oneRm,
      unit,
    },
    update: { prWeight: set.weight, prReps: set.reps, prOneRm: pr.oneRm, occurredAt },
  });
}

// === Reads (consumed by the /community page) ===

export type FeedReaction = { emoji: ReactionEmoji; count: number; mine: boolean };
export type FeedItem = {
  id: number;
  type: "workoutComplete" | "prHit" | "mesoComplete";
  actor: string;
  isMine: boolean;
  occurredAt: string; // ISO — formatted relative on render
  mesoKey: string | null;
  mesoName: string | null;
  exerciseName: string | null;
  setsCount: number | null;
  weeksCount: number | null;
  prWeight: number | null;
  prReps: number | null;
  prOneRm: number | null;
  unit: string | null;
  reactions: FeedReaction[];
};

/** The chronological feed across all opted-in members, shaped for display. */
export async function getFeed(viewerId: number, limit = 60): Promise<FeedItem[]> {
  const rows = await prisma.activity.findMany({
    where: { user: { communityOptIn: true, active: true } },
    orderBy: { occurredAt: "desc" },
    take: limit,
    include: {
      user: { select: { id: true, name: true, email: true } },
      reactions: { select: { emoji: true, userId: true } },
    },
  });
  return rows.map((a) => ({
    id: a.id,
    type: a.type,
    actor: actorName(a.user),
    isMine: a.userId === viewerId,
    occurredAt: a.occurredAt.toISOString(),
    mesoKey: a.mesoKey,
    mesoName: a.mesoName,
    exerciseName: a.exerciseName,
    setsCount: a.setsCount,
    weeksCount: a.weeksCount,
    prWeight: a.prWeight,
    prReps: a.prReps,
    prOneRm: a.prOneRm,
    unit: a.unit,
    reactions: REACTION_EMOJI.map((emoji) => {
      const hits = a.reactions.filter((r) => r.emoji === emoji);
      return { emoji, count: hits.length, mine: hits.some((r) => r.userId === viewerId) };
    }),
  }));
}

/** Weekly (rolling 7-day) leaderboard among opted-in members. Streak uses a 30-day lookback. */
export async function getLeaderboard(now = new Date()): Promise<LeaderboardRow[]> {
  const since7 = new Date(now.getTime() - 7 * 86_400_000);
  const since30 = new Date(now.getTime() - 30 * 86_400_000);

  const members = await prisma.user.findMany({
    where: { communityOptIn: true, active: true },
    select: { id: true, name: true, email: true },
  });
  if (members.length === 0) return [];

  const days = await prisma.mesoDay.findMany({
    where: { status: "complete", finishedAt: { gte: since30 }, meso: { user: { communityOptIn: true, active: true } } },
    select: { finishedAt: true, meso: { select: { userId: true } } },
  });
  const sets = await prisma.exerciseSet.findMany({
    where: {
      status: "complete",
      finishedAt: { gte: since7 },
      dayExercise: { day: { meso: { user: { communityOptIn: true, active: true } } } },
    },
    select: { weight: true, reps: true, dayExercise: { select: { day: { select: { meso: { select: { userId: true } } } } } } },
  });

  const today = dayIndex(now);
  const input: LeaderboardInput[] = members.map((m) => {
    const myDays = days.filter((d) => d.meso.userId === m.id && d.finishedAt);
    const workouts = myDays.filter((d) => d.finishedAt! >= since7).length;
    const mySets = sets.filter((s) => s.dayExercise.day.meso.userId === m.id);
    const volume = mySets.reduce((v, s) => v + (s.weight ?? 0) * (s.reps ?? 0), 0);
    return {
      userId: m.id,
      name: actorName(m),
      workouts,
      sets: mySets.length,
      volume: Math.round(volume),
      workoutDayIndices: myDays.map((d) => dayIndex(d.finishedAt!)),
    };
  });
  return aggregateLeaderboard(input, today);
}

export type SharedTemplate = {
  key: string;
  name: string;
  emphasis: string;
  sex: string;
  frequency: number | null;
  days: number;
  author: string;
};

/** Templates other opted-in members have shared with the instance. */
export async function getSharedTemplates(viewerId: number): Promise<SharedTemplate[]> {
  const rows = await prisma.template.findMany({
    // user-owned (not the seeded library), shared, by an active member who isn't the viewer and is opted in
    where: { sharedWithInstance: true, userId: { not: null }, NOT: { userId: viewerId }, user: { communityOptIn: true, active: true } },
    orderBy: [{ name: "asc" }, { frequency: "asc" }],
    select: {
      key: true,
      name: true,
      emphasis: true,
      sex: true,
      frequency: true,
      _count: { select: { days: true } },
      user: { select: { name: true, email: true } },
    },
  });
  return rows.map((t) => ({
    key: t.key,
    name: t.name,
    emphasis: t.emphasis,
    sex: t.sex,
    frequency: t.frequency,
    days: t._count.days,
    author: t.user ? actorName(t.user) : "—",
  }));
}

/** Count of opted-in members, for the page subtitle. */
export function getCommunityMemberCount(): Promise<number> {
  return prisma.user.count({ where: { communityOptIn: true, active: true } });
}
