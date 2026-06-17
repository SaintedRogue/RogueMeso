import { describe, it, expect } from "vitest";
import { normalizeTokens, equipClass, diceScore, bestMatch, type Candidate } from "@/lib/exerciseMatch";

const cand = (name: string, equipment: string): Candidate => ({
  name,
  equipment,
  instructions: [`do ${name}`],
  tokens: normalizeTokens(name),
});

describe("normalizeTokens", () => {
  it("lowercases, strips parens/hyphens, drops stopwords", () => {
    expect(normalizeTokens("Pulldown (Wide Grip)")).toEqual(["pulldown", "wide", "grip"]);
    expect(normalizeTokens("Wide-Grip Lat Pulldown")).toEqual(["wide", "grip", "lat", "pulldown"]);
  });
});

describe("equipClass", () => {
  it("folds both vocabularies onto one class", () => {
    expect(equipClass("smithMachine")).toBe("smith");
    expect(equipClass("smith machine")).toBe("smith");
    expect(equipClass("body only")).toBe("bodyweight");
    expect(equipClass("e-z curl bar")).toBe("barbell");
    expect(equipClass("freemotion")).toBe("cable");
    expect(equipClass("other")).toBe(""); // no signal
    expect(equipClass(null)).toBe("");
  });
});

describe("diceScore", () => {
  it("is 1 for identical token sets and 0 for disjoint", () => {
    expect(diceScore(["a", "b"], ["a", "b"])).toBe(1);
    expect(diceScore(["a"], ["b"])).toBe(0);
  });
});

describe("bestMatch", () => {
  const candidates = [
    cand("Wide-Grip Lat Pulldown", "cable"),
    cand("Barbell Shrug", "barbell"),
    cand("Dumbbell Shrug", "dumbbell"),
    cand("Seated Dumbbell Press", "dumbbell"),
  ];

  it("matches a parenthetical variant to its reordered name", () => {
    const { match } = bestMatch("Pulldown (Wide Grip)", "cable", candidates);
    expect(match?.name).toBe("Wide-Grip Lat Pulldown");
  });

  it("uses equipment to pick the right variant of a shared movement", () => {
    expect(bestMatch("Dumbbell Shrug", "dumbbell", candidates).match?.name).toBe("Dumbbell Shrug");
    expect(bestMatch("Barbell Shrug", "barbell", candidates).match?.name).toBe("Barbell Shrug");
  });

  it("returns a score that reflects similarity", () => {
    const { score } = bestMatch("Dumbbell Shoulder Press (Seated)", "dumbbell", candidates);
    expect(score).toBeGreaterThan(0.6);
  });
});
