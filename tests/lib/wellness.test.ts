import { describe, it, expect } from "vitest";
import { parseWellnessSnapshot, WELLNESS_MAX_BYTES, WELLNESS_DOMAINS } from "@/lib/wellness";

const NOW = 1_780_000_000_000;

/** Minimal valid body the Side Service would POST after reassembling watch parts. */
function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "wellness",
    collectedAt: NOW - 60_000,
    watchNow: NOW,
    sections: { activity: { steps: 4200, stepGoal: 8000 }, stress: null },
    errors: {},
    ...overrides,
  };
}

describe("parseWellnessSnapshot", () => {
  it("accepts a normal snapshot and preserves whitelisted sections", () => {
    const parsed = parseWellnessSnapshot(body(), NOW);
    expect(parsed).not.toBeNull();
    expect(parsed!.sections.activity).toEqual({ steps: 4200, stepGoal: 8000 });
    // null data (sensor unavailable on-watch) is a valid, meaningful value.
    expect(parsed!.sections.stress).toBeNull();
    expect(parsed!.collectedAt).toBe(NOW - 60_000);
  });

  it("rejects bodies without a usable sections object", () => {
    expect(parseWellnessSnapshot(body({ sections: undefined }), NOW)).toBeNull();
    expect(parseWellnessSnapshot(body({ sections: "junk" }), NOW)).toBeNull();
    expect(parseWellnessSnapshot(body({ sections: [1, 2] }), NOW)).toBeNull();
    expect(parseWellnessSnapshot(body({ sections: {} }), NOW)).toBeNull();
  });

  it("strips unknown domains so a crafted payload can't smuggle arbitrary keys", () => {
    const parsed = parseWellnessSnapshot(
      body({ sections: { activity: { steps: 1 }, __proto__pollution: { evil: true }, notADomain: 1 } }),
      NOW,
    );
    expect(parsed).not.toBeNull();
    expect(Object.keys(parsed!.sections)).toEqual(["activity"]);
  });

  it("rejects a snapshot whose sections are only unknown domains", () => {
    expect(parseWellnessSnapshot(body({ sections: { bogus: 1 } }), NOW)).toBeNull();
  });

  it("rejects oversized payloads", () => {
    const big = { activity: { blob: "x".repeat(WELLNESS_MAX_BYTES) } };
    expect(parseWellnessSnapshot(body({ sections: big }), NOW)).toBeNull();
  });

  it("applies watch clock-skew correction to collectedAt", () => {
    // Watch clock 10 minutes behind the server: watchNow lags, so skew shifts forward.
    const skew = 10 * 60_000;
    const parsed = parseWellnessSnapshot(
      body({ collectedAt: NOW - skew - 30_000, watchNow: NOW - skew }),
      NOW,
    );
    expect(parsed!.collectedAt).toBe(NOW - 30_000);
  });

  it("clamps unusable collectedAt values to the server clock", () => {
    for (const collectedAt of ["soon", NaN, NOW - 8 * 24 * 60 * 60_000, NOW + 60 * 60_000]) {
      const parsed = parseWellnessSnapshot(body({ collectedAt, watchNow: NOW }), NOW);
      expect(parsed).not.toBeNull();
      expect(parsed!.collectedAt).toBe(NOW);
    }
  });

  it("bounds per-domain error strings and drops non-string entries", () => {
    const parsed = parseWellnessSnapshot(
      body({ errors: { bodyTemp: "e".repeat(500), sleep: 42, bogus: "nope" } }),
      NOW,
    );
    expect(parsed!.errors.bodyTemp).toHaveLength(200);
    expect(parsed!.errors.sleep).toBeUndefined();
    expect(Object.keys(parsed!.errors)).toEqual(["bodyTemp"]);
  });

  it("covers every domain the on-watch collector emits", () => {
    const sections = Object.fromEntries(WELLNESS_DOMAINS.map((d) => [d, { ok: true }]));
    const parsed = parseWellnessSnapshot(body({ sections }), NOW);
    expect(Object.keys(parsed!.sections)).toHaveLength(WELLNESS_DOMAINS.length);
  });
});
