import { describe, it, expect } from "vitest";
import { pickHomeDay } from "@/lib/homeDay";

// Local-date stringifier that treats the Date as-is (UTC), matching how the page builds it.
const toLocal = (d: Date) => d.toISOString().slice(0, 10);
const day = (over: Partial<{ week: number; position: number; status: string; finishedAt: Date | null }> = {}) => ({
  week: 0,
  position: 0,
  status: "pending",
  finishedAt: null,
  ...over,
});

describe("pickHomeDay", () => {
  const today = "2026-07-01";

  it("shows the first non-done day when nothing is completed", () => {
    const days = [day({ position: 0, status: "ready" }), day({ position: 1, status: "pending" })];
    const { current, next } = pickHomeDay(days, today, toLocal);
    expect(current?.position).toBe(0);
    expect(next).toBeNull();
  });

  it("stays on a session completed today and points next at the upcoming workout", () => {
    const days = [
      day({ position: 0, status: "complete", finishedAt: new Date("2026-07-01T18:00:00Z") }),
      day({ position: 1, status: "ready" }),
    ];
    const { current, next } = pickHomeDay(days, today, toLocal);
    expect(current?.position).toBe(0); // parked on the completed session
    expect(next?.position).toBe(1); // "Start next workout" target
  });

  it("advances to the next workout once the completed session is no longer today", () => {
    const days = [
      day({ position: 0, status: "complete", finishedAt: new Date("2026-06-30T18:00:00Z") }),
      day({ position: 1, status: "ready" }),
    ];
    const { current, next } = pickHomeDay(days, today, toLocal);
    expect(current?.position).toBe(1); // auto-advanced next day
    expect(next).toBeNull();
  });

  it("prefers an in-progress (partial) day over a same-day completed one", () => {
    const days = [
      day({ position: 0, status: "complete", finishedAt: new Date("2026-07-01T09:00:00Z") }),
      day({ position: 1, status: "partial" }),
    ];
    const { current, next } = pickHomeDay(days, today, toLocal);
    expect(current?.position).toBe(1);
    expect(next).toBeNull();
  });

  it("picks the latest of multiple sessions completed today", () => {
    const days = [
      day({ position: 0, status: "complete", finishedAt: new Date("2026-07-01T08:00:00Z") }),
      day({ position: 1, status: "complete", finishedAt: new Date("2026-07-01T19:00:00Z") }),
    ];
    const { current } = pickHomeDay(days, today, toLocal);
    expect(current?.position).toBe(1);
  });
});
