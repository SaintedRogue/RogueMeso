// Pure logic for live heart-rate capture (Web Bluetooth, standard GATT Heart Rate
// service 0x180D). Everything stateful — the BLE connection, the store, batch flushing —
// lives in HeartRateProvider; this module stays unit-testable, mirroring restTimer.ts.

/** One captured reading: epoch-ms timestamp + beats per minute. */
export type HrSamplePoint = { at: number; bpm: number };

/** Client-side buffer cap: ~10 min at 1 Hz. Older samples drop first (bounded memory). */
export const HR_MAX_BUFFER = 600;

/** Flush the buffer to the server roughly this often while connected. */
export const HR_FLUSH_INTERVAL_MS = 30_000;

/**
 * Decode a Heart Rate Measurement characteristic value (0x2A37).
 * Layout: flags uint8, then HR as uint8 (flags bit0=0) or uint16 LE (bit0=1), then an
 * optional uint16 energy-expended field (bit3), then 0..n uint16 LE RR-intervals (bit4)
 * in units of 1/1024 s. Returns null for packets too short to hold what the flags claim.
 */
export function parseHeartRateMeasurement(view: DataView): { bpm: number; rrMs: number[] } | null {
  if (view.byteLength < 2) return null;
  const flags = view.getUint8(0);
  const is16Bit = (flags & 0x01) !== 0;
  let offset = 1;

  if (is16Bit && view.byteLength < 3) return null;
  const bpm = is16Bit ? view.getUint16(offset, true) : view.getUint8(offset);
  offset += is16Bit ? 2 : 1;

  if ((flags & 0x08) !== 0) offset += 2; // energy expended, unused

  const rrMs: number[] = [];
  if ((flags & 0x10) !== 0) {
    for (; offset + 2 <= view.byteLength; offset += 2) {
      rrMs.push(Math.round((view.getUint16(offset, true) / 1024) * 1000));
    }
  }
  return { bpm, rrMs };
}

/**
 * Estimated max heart rate: the classic 220 − age, from the profile birth date when set
 * (User.birthDate already exists for body tuning), else a middle-of-the-road 190.
 * Clamped to a sane band so an implausible birth date can't wreck the zone scale.
 */
export function maxHrFor(birthDate: Date | null | undefined, now: Date): number {
  if (!birthDate) return 190;
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const hadBirthday =
    now.getUTCMonth() > birthDate.getUTCMonth() ||
    (now.getUTCMonth() === birthDate.getUTCMonth() && now.getUTCDate() >= birthDate.getUTCDate());
  if (!hadBirthday) age -= 1;
  return Math.max(120, Math.min(200, 220 - age));
}

/** Standard five training zones by %max: Z1 50–60 … Z5 90+. 0 = below Z1 (resting). */
export function zoneFor(bpm: number, maxHr: number): 0 | 1 | 2 | 3 | 4 | 5 {
  const pct = (bpm / maxHr) * 100;
  if (pct >= 90) return 5;
  if (pct >= 80) return 4;
  if (pct >= 70) return 3;
  if (pct >= 60) return 2;
  if (pct >= 50) return 1;
  return 0;
}

/**
 * Gate a raw reading to plausible on-body values (straps report 0 when off-body; junk
 * spikes happen mid-connect). Shared by the client buffer and the server action, so the
 * same rule guards both ends of the pipe.
 */
export function sanitizeBpm(raw: number): number | null {
  if (!Number.isFinite(raw)) return null;
  const bpm = Math.round(raw);
  return bpm >= 25 && bpm <= 250 ? bpm : null;
}

/** Server-side cap per logHrBatch call (~6.5 min at 1 Hz — above the 30s flush cadence). */
export const HR_MAX_BATCH = 400;

/** Readings older than this are not from the session being logged; reject them. */
const HR_MAX_SAMPLE_AGE_MS = 6 * 60 * 60 * 1000;
/**
 * Wider gate for the watch's all-day minute logger: batches buffer on the watch and
 * may drain a full day late (open the app once per evening), so "same session" aging
 * doesn't apply — but anything past ~a day is stale enough to reject.
 */
export const HR_WATCH_MAX_AGE_MS = 26 * 60 * 60 * 1000;
/** Small allowance for client clocks running slightly ahead of the server. */
const HR_CLOCK_SKEW_MS = 2 * 60 * 1000;

/**
 * Validate a client batch before insert: plausible bpm, finite timestamps inside the
 * [now − 6h, now + 2min] window, newest HR_MAX_BATCH rows. The shared gate between the
 * browser's flush and the DB — a hand-crafted payload can't write junk analytics.
 */
export function sanitizeBatch(
  samples: HrSamplePoint[],
  now: number,
  maxAgeMs: number = HR_MAX_SAMPLE_AGE_MS,
): HrSamplePoint[] {
  const clean = samples.flatMap((s) => {
    const bpm = sanitizeBpm(s.bpm);
    if (bpm == null || !Number.isFinite(s.at)) return [];
    if (now - s.at > maxAgeMs || s.at - now > HR_CLOCK_SKEW_MS) return [];
    return [{ at: s.at, bpm }];
  });
  if (clean.length <= HR_MAX_BATCH) return clean;
  // Over cap: keep the newest rows, returned in chronological order.
  clean.sort((a, b) => a.at - b.at);
  return clean.slice(clean.length - HR_MAX_BATCH);
}

/** Ignore watch-clock drift below this; beyond it, correct every sample (spec §5). */
const SKEW_TOLERANCE_MS = 5000;

/**
 * Per-batch clock correction for the on-watch recorder: how far to shift the watch's
 * timestamps onto server time. Small disagreements (network transit, honest jitter)
 * pass through untouched; real drift gets corrected so set markers still line up.
 */
export function clockSkewMs(watchNow: number | undefined, serverNow: number): number {
  if (watchNow == null || !Number.isFinite(watchNow)) return 0;
  const skew = serverNow - watchNow;
  return Math.abs(skew) <= SKEW_TOLERANCE_MS ? 0 : skew;
}

/**
 * Expand the recorder's compact batch — `t0` epoch ms + `[secondsSinceT0, bpm]` pairs
 * (BLE-payload economy) — into timestamped samples, applying the skew correction.
 * Malformed pairs are dropped; bpm plausibility is sanitizeBatch's job downstream.
 */
export function decodeHrBatch(t0: number, s: [number, number][], skewMs: number): HrSamplePoint[] {
  if (!Array.isArray(s) || !Number.isFinite(t0)) return [];
  return s.flatMap((pair) => {
    if (!Array.isArray(pair) || pair.length < 2) return [];
    const [sec, bpm] = pair;
    if (!Number.isFinite(sec) || !Number.isFinite(bpm)) return [];
    return [{ at: t0 + sec * 1000 + skewMs, bpm }];
  });
}

/** Exponential reconnect backoff: 1s, 2s, 4s, 8s, then 15s forever. */
export function reconnectDelayMs(attempt: number): number {
  return Math.min(15_000, 1000 * 2 ** attempt);
}

/** A connection-lifecycle diagnostic event (shown in the pill's log, mirrored server-side). */
export type HrDiagEvent = { at: number; step: string; detail?: string };

/** Immutable ring-buffer push for the diagnostics log (snapshot-friendly for the store). */
export function pushEvent<T>(list: T[], event: T, cap = 50): T[] {
  const next = [...list, event];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

/** Append to the capture buffer, dropping the oldest past HR_MAX_BUFFER. */
export function appendSample(buffer: HrSamplePoint[], sample: HrSamplePoint): HrSamplePoint[] {
  const next = [...buffer, sample];
  return next.length > HR_MAX_BUFFER ? next.slice(next.length - HR_MAX_BUFFER) : next;
}
