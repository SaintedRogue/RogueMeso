import { describe, it, expect } from "vitest";
import {
  REACTION_EMOJI,
  isAllowedEmoji,
  dedupeKey,
  detectPR,
  currentStreak,
  aggregateLeaderboard,
  dayIndex,
} from "@/lib/features/community";

describe("isAllowedEmoji", () => {
  it("accepts only the curated reaction set", () => {
    for (const e of REACTION_EMOJI) expect(isAllowedEmoji(e)).toBe(true);
    expect(isAllowedEmoji("🍕")).toBe(false);
    expect(isAllowedEmoji("")).toBe(false);
    expect(isAllowedEmoji("<script>")).toBe(false);
  });
});

describe("dedupeKey", () => {
  it("builds a stable per-type key from an id", () => {
    expect(dedupeKey("workout_complete", 42)).toBe("workout_complete:42");
    expect(dedupeKey("meso_complete", 3)).toBe("meso_complete:3");
  });
  it("scopes PR keys by user so two members' PRs on the same exercise don't collide", () => {
    expect(dedupeKey("pr_hit", 3, 7)).toBe("pr_hit:3:7");
    expect(dedupeKey("pr_hit", 4, 7)).not.toBe(dedupeKey("pr_hit", 3, 7));
  });
});

describe("detectPR", () => {
  it("is a PR when there is no prior best", () => {
    expect(detectPR(100, 5, null)).toEqual({ oneRm: Math.round(100 * (1 + 5 / 30)) });
  });
  it("is a PR when the estimated 1RM strictly beats the prior best", () => {
    // 100x5 -> 116.67 est 1RM
    expect(detectPR(100, 5, 110)).toEqual({ oneRm: 117 });
  });
  it("is NOT a PR when it merely ties the prior best", () => {
    const oneRm = 100 * (1 + 5 / 30);
    expect(detectPR(100, 5, oneRm)).toBeNull();
  });
  it("is NOT a PR when it is below the prior best", () => {
    expect(detectPR(100, 5, 200)).toBeNull();
  });
  it("treats a true single as the weight itself", () => {
    expect(detectPR(225, 1, 224)).toEqual({ oneRm: 225 });
    expect(detectPR(225, 1, 225)).toBeNull();
  });
});

describe("currentStreak", () => {
  const today = 20000; // arbitrary epoch-day index

  it("is 0 with no workout days", () => {
    expect(currentStreak([], today)).toBe(0);
  });
  it("counts consecutive days ending today", () => {
    expect(currentStreak([today, today - 1, today - 2], today)).toBe(3);
  });
  it("counts a streak ending yesterday (today not yet trained)", () => {
    expect(currentStreak([today - 1, today - 2], today)).toBe(2);
  });
  it("breaks the streak when the latest day is older than yesterday", () => {
    expect(currentStreak([today - 2, today - 3], today)).toBe(0);
  });
  it("stops at the first gap", () => {
    expect(currentStreak([today, today - 1, today - 3, today - 4], today)).toBe(2);
  });
  it("ignores duplicate days and unordered input", () => {
    expect(currentStreak([today - 1, today, today, today - 1, today - 2], today)).toBe(3);
  });
});

describe("dayIndex", () => {
  it("maps a Date to a stable integer day and is monotonic", () => {
    const d1 = new Date("2026-06-10T08:00:00Z");
    const d2 = new Date("2026-06-11T23:30:00Z");
    expect(dayIndex(d2) - dayIndex(d1)).toBe(1);
  });
  it("gives the same index for two times on the same UTC day", () => {
    expect(dayIndex(new Date("2026-06-11T00:01:00Z"))).toBe(dayIndex(new Date("2026-06-11T22:00:00Z")));
  });
});

describe("aggregateLeaderboard", () => {
  const today = 20000;
  const rows = [
    { userId: 1, name: "Sarah", workouts: 4, sets: 60, volume: 12000, workoutDayIndices: [today, today - 1] },
    { userId: 2, name: "Mike", workouts: 4, sets: 72, volume: 9000, workoutDayIndices: [today - 5] },
    { userId: 3, name: "Alex", workouts: 2, sets: 30, volume: 5000, workoutDayIndices: [today] },
  ];

  it("ranks by workouts, then sets, then volume, then name; and computes streaks", () => {
    const board = aggregateLeaderboard(rows, today);
    expect(board.map((r) => r.name)).toEqual(["Mike", "Sarah", "Alex"]); // Mike & Sarah tie on workouts; Mike wins on sets
    expect(board[1].streak).toBe(2); // Sarah: today + yesterday
    expect(board[0].streak).toBe(0); // Mike: last workout 5 days ago
    expect(board[2].streak).toBe(1); // Alex: today only
  });

  it("returns an empty board for no members", () => {
    expect(aggregateLeaderboard([], today)).toEqual([]);
  });
});
