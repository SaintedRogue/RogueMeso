// Pure validation for wellness snapshot ingestion (/api/wearables/zepp, type:"wellness").
// The watch collects one NDJSON record per sensor domain; the Side Service reassembles
// them into { collectedAt, sections, errors } and POSTs. Everything stateful (auth,
// Prisma) lives in the route — this module stays unit-testable, mirroring heartRate.ts.

import { clockSkewMs } from "@/lib/heartRate";

/** The domains the on-watch collector emits (zepp-beacon/utils/wellness-collector.js). */
export const WELLNESS_DOMAINS = [
  "device",
  "heartRate",
  "bloodOxygen",
  "sleep",
  "stress",
  "activity",
  "pai",
  "bodyTemp",
  "workouts",
  "environment",
] as const;
export type WellnessDomain = (typeof WELLNESS_DOMAINS)[number];

/**
 * Serialized-payload cap. A full snapshot observed in design is ~15–25 KB (stress 168
 * hourly rows + body temp 288 slots dominate); 128 KB leaves generous headroom while
 * keeping a hand-crafted payload from bloating the JSONB column.
 */
export const WELLNESS_MAX_BYTES = 128 * 1024;

/** Snapshots older than this are not a sync backlog worth keeping; reject them. */
const WELLNESS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Small allowance for watch clocks running slightly ahead (same spirit as HR path). */
const WELLNESS_CLOCK_SKEW_MS = 2 * 60 * 1000;

export type WellnessSnapshotInput = {
  /** Skew-corrected epoch ms the snapshot was collected on the watch. */
  collectedAt: number;
  /** Whitelisted domain → collector output (null when that sensor was unavailable). */
  sections: Partial<Record<WellnessDomain, unknown>>;
  /** Domain → on-watch error string, for triage of persistently-null sections. */
  errors: Partial<Record<WellnessDomain, string>>;
};

/**
 * Validate a reassembled snapshot body before insert. Returns null when the payload is
 * structurally unusable (no recognizable sections, or oversized); otherwise strips
 * unknown domains, bounds error strings, and skew-corrects collectedAt into
 * [now − 7d, now + 2min] — clamping to `now` when the watch clock is unusable, so a
 * bad clock degrades to "received time" rather than dropping health data.
 */
export function parseWellnessSnapshot(
  body: Record<string, unknown>,
  now: number,
): WellnessSnapshotInput | null {
  const rawSections = body.sections;
  if (rawSections == null || typeof rawSections !== "object" || Array.isArray(rawSections)) return null;

  const sections: Partial<Record<WellnessDomain, unknown>> = {};
  for (const domain of WELLNESS_DOMAINS) {
    if (domain in (rawSections as Record<string, unknown>)) {
      sections[domain] = (rawSections as Record<string, unknown>)[domain] ?? null;
    }
  }
  if (Object.keys(sections).length === 0) return null;
  if (JSON.stringify(sections).length > WELLNESS_MAX_BYTES) return null;

  const errors: Partial<Record<WellnessDomain, string>> = {};
  const rawErrors = body.errors;
  if (rawErrors != null && typeof rawErrors === "object" && !Array.isArray(rawErrors)) {
    for (const domain of WELLNESS_DOMAINS) {
      const err = (rawErrors as Record<string, unknown>)[domain];
      if (typeof err === "string" && err) errors[domain] = err.slice(0, 200);
    }
  }

  const skew = clockSkewMs(typeof body.watchNow === "number" ? body.watchNow : undefined, now);
  const rawAt = typeof body.collectedAt === "number" ? body.collectedAt + skew : NaN;
  const collectedAt =
    Number.isFinite(rawAt) && now - rawAt <= WELLNESS_MAX_AGE_MS && rawAt - now <= WELLNESS_CLOCK_SKEW_MS
      ? rawAt
      : now;

  return { collectedAt, sections, errors };
}
