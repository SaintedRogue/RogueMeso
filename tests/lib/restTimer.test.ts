import { describe, it, expect } from "vitest";
import {
  restDurationFor,
  remainingSeconds,
  restoreTimer,
  adjustEndsAt,
  fmtCountdown,
  type RestTimerState,
} from "@/lib/restTimer";

const NOW = 1_750_000_000_000;
const timer = (secondsLeft: number): RestTimerState => ({
  endsAt: NOW + secondsLeft * 1000,
  exerciseName: "Bench Press",
});

describe("restDurationFor", () => {
  it("gives heavy compounds 3:00", () => {
    expect(restDurationFor("barbell")).toBe(180);
    expect(restDurationFor("smithMachine")).toBe(180);
  });

  it("gives machine/dumbbell/cable/freemotion/kettlebell 2:00", () => {
    for (const t of ["machine", "dumbbell", "cable", "freemotion", "kettlebell"]) {
      expect(restDurationFor(t)).toBe(120);
    }
  });

  it("gives bodyweight and assistance work 1:30", () => {
    for (const t of ["bodyweightOnly", "bodyweightLoadable", "machineAssistance"]) {
      expect(restDurationFor(t)).toBe(90);
    }
  });

  it("matches the @map value and the enum identifier interchangeably (house compact rule)", () => {
    expect(restDurationFor("bodyweight-only")).toBe(90);
    expect(restDurationFor("smith-machine")).toBe(180);
  });

  it("falls back to 2:00 for unknown or missing types", () => {
    expect(restDurationFor("trapeze")).toBe(120);
    expect(restDurationFor(null)).toBe(120);
    expect(restDurationFor(undefined)).toBe(120);
  });
});

describe("remainingSeconds", () => {
  it("counts down whole seconds, rounding up so 0 means truly done", () => {
    expect(remainingSeconds(timer(90), NOW)).toBe(90);
    expect(remainingSeconds(timer(90), NOW + 500)).toBe(90);
    expect(remainingSeconds(timer(90), NOW + 1000)).toBe(89);
  });

  it("clamps at 0 once past the end", () => {
    expect(remainingSeconds(timer(5), NOW + 5000)).toBe(0);
    expect(remainingSeconds(timer(5), NOW + 60_000)).toBe(0);
  });
});

describe("restoreTimer", () => {
  it("restores a still-running timer from its stored JSON", () => {
    const raw = JSON.stringify(timer(60));
    expect(restoreTimer(raw, NOW)).toEqual(timer(60));
  });

  it("discards a timer that expired while away", () => {
    expect(restoreTimer(JSON.stringify(timer(-1)), NOW)).toBeNull();
  });

  it("discards missing, corrupt, or wrong-shape payloads without throwing", () => {
    expect(restoreTimer(null, NOW)).toBeNull();
    expect(restoreTimer("not json{", NOW)).toBeNull();
    expect(restoreTimer(JSON.stringify({ endsAt: "soon" }), NOW)).toBeNull();
    expect(restoreTimer(JSON.stringify({ exerciseName: "Squat" }), NOW)).toBeNull();
  });
});

describe("adjustEndsAt", () => {
  it("+30s extends the countdown", () => {
    const t = adjustEndsAt(timer(60), 30, NOW);
    expect(t && remainingSeconds(t, NOW)).toBe(90);
  });

  it("-30s shortens the countdown", () => {
    const t = adjustEndsAt(timer(60), -30, NOW);
    expect(t && remainingSeconds(t, NOW)).toBe(30);
  });

  it("returns null (end the timer) when the adjustment would drop remaining to 0 or below", () => {
    expect(adjustEndsAt(timer(20), -30, NOW)).toBeNull();
    expect(adjustEndsAt(timer(30), -30, NOW)).toBeNull();
  });
});

describe("fmtCountdown", () => {
  it("formats M:SS with zero-padded seconds", () => {
    expect(fmtCountdown(180)).toBe("3:00");
    expect(fmtCountdown(90)).toBe("1:30");
    expect(fmtCountdown(5)).toBe("0:05");
    expect(fmtCountdown(0)).toBe("0:00");
  });
});
