import { describe, it, expect } from "vitest";
import { toKg, fromKg, cmToFtIn, ftInToCm } from "@/lib/format";

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

describe("height unit converters", () => {
  it("converts feet+inches to cm", () => {
    expect(ftInToCm(5, 10)).toBeCloseTo(177.8, 6); // 70 in × 2.54
    expect(ftInToCm(6, 0)).toBeCloseTo(182.88, 6);
  });
  it("treats blank/NaN inch or foot parts as zero", () => {
    expect(ftInToCm(5, NaN)).toBeCloseTo(152.4, 6); // 60 in
    expect(ftInToCm(NaN, 10)).toBeCloseTo(25.4, 6); // 10 in
  });
  it("splits cm into feet + inches", () => {
    expect(cmToFtIn(177.8)).toEqual({ ft: 5, in: 10 });
    expect(cmToFtIn(182.88)).toEqual({ ft: 6, in: 0 });
  });
  it("round-trips ft/in -> cm -> ft/in", () => {
    for (const [ft, inches] of [[5, 6], [5, 11], [6, 2], [4, 0]]) {
      expect(cmToFtIn(ftInToCm(ft, inches))).toEqual({ ft, in: inches });
    }
  });
});
