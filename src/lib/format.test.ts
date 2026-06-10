import { describe, it, expect } from "vitest";
import { toKg, fromKg } from "@/lib/format";

describe("weight unit converters", () => {
  it("passes kg through unchanged", () => {
    expect(toKg(80, "kg")).toBe(80);
    expect(fromKg(80, "kg")).toBe(80);
  });
  it("round-trips lb -> kg -> lb", () => {
    expect(fromKg(toKg(176, "lb"), "lb")).toBeCloseTo(176, 6);
  });
  it("converts a known lb value to kg", () => {
    expect(toKg(220.462, "lb")).toBeCloseTo(100, 3);
  });
});
