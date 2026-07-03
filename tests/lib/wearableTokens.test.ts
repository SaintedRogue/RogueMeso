import { describe, it, expect } from "vitest";
import { generateBeaconToken, hashBeaconToken } from "@/lib/wearableTokens";

describe("generateBeaconToken", () => {
  it("mints a recognizable, high-entropy token", () => {
    const t = generateBeaconToken();
    expect(t).toMatch(/^rgm_[0-9a-f]{48}$/);
    expect(generateBeaconToken()).not.toBe(t);
  });
});

describe("hashBeaconToken", () => {
  it("is deterministic and never echoes the token", () => {
    const t = "rgm_" + "ab".repeat(24);
    const h = hashBeaconToken(t);
    expect(h).toBe(hashBeaconToken(t));
    expect(h).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
    expect(h).not.toContain(t);
  });

  it("differs for different tokens", () => {
    expect(hashBeaconToken("rgm_" + "aa".repeat(24))).not.toBe(hashBeaconToken("rgm_" + "bb".repeat(24)));
  });
});
