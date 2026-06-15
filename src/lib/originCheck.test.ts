import { describe, it, expect } from "vitest";
import { isSameOrigin } from "./originCheck";

describe("isSameOrigin", () => {
  it("accepts a matching Origin host", () => {
    expect(isSameOrigin("https://meso.example.com", null, "meso.example.com")).toBe(true);
  });

  it("rejects a cross-origin Origin host", () => {
    expect(isSameOrigin("https://evil.com", null, "meso.example.com")).toBe(false);
  });

  it("falls back to Referer when Origin is absent", () => {
    expect(isSameOrigin(null, "https://meso.example.com/adhd-mode", "meso.example.com")).toBe(true);
    expect(isSameOrigin(null, "https://evil.com/x", "meso.example.com")).toBe(false);
  });

  it("rejects when neither Origin nor Referer is present", () => {
    expect(isSameOrigin(null, null, "meso.example.com")).toBe(false);
  });

  it("rejects when Host is missing", () => {
    expect(isSameOrigin("https://meso.example.com", null, null)).toBe(false);
  });

  it("rejects malformed Origin / Referer", () => {
    expect(isSameOrigin("garbage", null, "meso.example.com")).toBe(false);
    expect(isSameOrigin(null, "garbage", "meso.example.com")).toBe(false);
  });
});
