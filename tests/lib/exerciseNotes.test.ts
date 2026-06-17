import { describe, it, expect } from "vitest";
import { parseInstructions } from "@/lib/exerciseNotes";

describe("parseInstructions", () => {
  it("returns [] for null/empty/whitespace", () => {
    expect(parseInstructions(null)).toEqual([]);
    expect(parseInstructions(undefined)).toEqual([]);
    expect(parseInstructions("")).toEqual([]);
    expect(parseInstructions("   ")).toEqual([]);
  });

  it("splits a JSON array into trimmed, non-empty steps", () => {
    expect(parseInstructions('["Set up.", "  Pull down.  ", ""]')).toEqual(["Set up.", "Pull down."]);
  });

  it("treats plain text as a single step", () => {
    expect(parseInstructions("Keep elbows tucked.")).toEqual(["Keep elbows tucked."]);
  });

  it("falls back to plain text when a [-leading string isn't valid JSON", () => {
    expect(parseInstructions("[warmup] then go heavy")).toEqual(["[warmup] then go heavy"]);
  });

  it("coerces non-string array elements", () => {
    expect(parseInstructions('[1, 2]')).toEqual(["1", "2"]);
  });
});
