// Wellness snapshot collector: reads every wellness/biometric stream the Zepp OS
// public API exposes on this device and seals one NDJSON snapshot file (wellnessStore)
// for the page to drain to the server. API surface verified against the live docs on
// 2026-07-03 — see docs/api-capability-map.md for signatures, units, and gaps.
//
// Timestamp policy (the hard-won rule from the HR getToday() saga): a record only gets
// an epoch timestamp when the API provides one (UTC seconds) or the docs pin the slot
// grid (BodyTemperature's 5-minute buckets). HR per-minute history is NOT collected —
// this device's getToday() violates the documented minute grid, so the recorder
// service and Sync HR remain the only trusted HR history paths. Current-value reads
// carry `at` = collection time, which is a real timestamp, not a fabricated one.

import {
  HeartRate,
  BloodOxygen,
  Sleep,
  Stress,
  Step,
  Calorie,
  Distance,
  Pai,
  Workout,
  BodyTemperature,
  Barometer,
  Battery,
  Time,
} from "@zos/sensor";
import { getDeviceInfo } from "@zos/device";
import { createSnapshotWriter, pruneWellnessFiles } from "./wellnessStore";

// Keep in sync with app.json version.name (surfaced in every payload for server triage).
export const APP_VERSION = "0.8.1";
export const WELLNESS_SCHEMA_VERSION = 1;

const DAY_MS = 86_400_000;
const MIN_MS = 60_000;

/** Epoch ms of local midnight, derived the same way the HR sync path does. */
function localMidnight() {
  const t = new Time();
  return Date.now() - (t.getHours() * 3600 + t.getMinutes() * 60 + t.getSeconds()) * 1000;
}

/** Normalize an epoch-looking value to ms; null when it isn't plausibly an epoch. */
function epochMs(v) {
  if (!Number.isFinite(v) || v <= 0) return null;
  if (v > 1e12) return Math.round(v);
  if (v > 1e9) return Math.round(v * 1000);
  return null;
}

const errText = (e) => (e && e.message ? String(e.message) : String(e)).slice(0, 120);

// ---- per-domain collectors ----------------------------------------------------------
// Each returns the domain's `data` object; throws bubble to the caller which records
// { data: null, err } instead — a missing sensor degrades that one domain only.

function collectDevice() {
  const info = getDeviceInfo();
  let battery = null;
  try {
    battery = new Battery().getCurrent();
  } catch (e) {
    /* battery is decoration on the metadata record */
  }
  return {
    model: info && info.deviceName != null ? info.deviceName : null,
    deviceSource: info && info.deviceSource != null ? info.deviceSource : null,
    // The public API exposes no firmware-version field (capability map §device).
    firmware: null,
    battery,
    appVersion: APP_VERSION,
    screen: info ? { w: info.width, h: info.height } : null,
  };
}

function collectHeartRate(now) {
  const hr = new HeartRate();
  let current = null;
  try {
    const bpm = hr.getLast();
    if (Number.isFinite(bpm) && bpm > 0) current = { bpm, at: now };
  } catch (e) {
    /* fall through with current: null */
  }
  let resting = null;
  try {
    const r = hr.getResting();
    if (Number.isFinite(r) && r > 0) resting = r;
  } catch (e) {
    /* resting HR simply absent */
  }
  let dailyMax = null;
  try {
    const s = hr.getDailySummary();
    if (s && s.maximum && Number.isFinite(s.maximum.hr_value) && s.maximum.hr_value > 0) {
      // maximum.time unit is undocumented; ship raw alongside a best-effort epoch.
      dailyMax = { bpm: s.maximum.hr_value, at: epochMs(s.maximum.time), rawTime: s.maximum.time };
    }
  } catch (e) {
    /* summary absent */
  }
  return {
    current,
    resting,
    dailyMax,
    // Deliberately null: this device's getToday() is not the documented minute grid
    // (field-proven 2026-07-03), so per-minute history comes only from the recorder
    // service / Sync HR paths where every sample is timestamped at capture.
    history: null,
    historyNote: "per-minute HR ships via recorder/Sync HR; getToday() untrusted on this device",
    zones: null, // no HR-zone-distribution API exists
  };
}

function collectBloodOxygen(now) {
  const spo2 = new BloodOxygen();
  let latest = null;
  try {
    const cur = spo2.getCurrent();
    // retCode 2 = success per the docs' code table; other codes are not measurements.
    if (cur && cur.retCode === 2 && Number.isFinite(cur.value) && cur.value > 0) {
      latest = { percent: cur.value, at: epochMs(cur.time) || now, rawTime: cur.time };
    }
  } catch (e) {
    /* no current reading */
  }
  // getLastFewHour is the only SpO2 history with real timestamps (UTC seconds).
  let history = null;
  try {
    const rows = spo2.getLastFewHour(24);
    if (Array.isArray(rows)) {
      history = [];
      for (const r of rows) {
        const at = r && epochMs(r.time);
        if (at && Number.isFinite(r.spo2) && r.spo2 > 0) history.push([at, r.spo2]);
      }
    }
  } catch (e) {
    /* API_LEVEL or firmware without getLastFewHour */
  }
  return { latest, history, historyFormat: "[epochMs, percent]" };
}

function collectSleep(midnight) {
  const sleep = new Sleep();
  try {
    sleep.updateInfo(); // system refreshes every 30 min; force a fresh read
  } catch (e) {
    /* stale-but-present beats absent */
  }
  const info = sleep.getInfo();
  if (!info || !Number.isFinite(info.totalTime) || info.totalTime <= 0) {
    return { lastNight: null, note: "no sleep recorded for the current sleep day" };
  }
  // All Sleep times are minutes relative to 0:00 "of the day" (docs), with cross-midnight
  // semantics undocumented. Derivation heuristic: minutes >= 1440 count from the PREVIOUS
  // day's midnight; else if start > end the sleep began yesterday evening. Raw values
  // always ship so the server can re-derive if the heuristic proves wrong on-device.
  const minutesToEpoch = (m) => {
    if (!Number.isFinite(m)) return null;
    if (m >= 1440) return midnight - DAY_MS + m * MIN_MS;
    return midnight + m * MIN_MS;
  };
  const startedYesterday = info.startTime < 1440 && info.startTime > info.endTime;
  const startAt = startedYesterday ? midnight - DAY_MS + info.startTime * MIN_MS : minutesToEpoch(info.startTime);
  let stages = null;
  try {
    const consts = sleep.getStageConstantObj();
    const names = {};
    if (consts) {
      names[consts.WAKE_STAGE] = "awake";
      names[consts.REM_STAGE] = "rem";
      names[consts.LIGHT_STAGE] = "light";
      names[consts.DEEP_STAGE] = "deep";
    }
    const rows = sleep.getStage();
    if (Array.isArray(rows)) {
      stages = rows.map((s) => ({
        stage: names[s.model] || `model_${s.model}`,
        startAt: startedYesterday && s.start > info.endTime ? midnight - DAY_MS + s.start * MIN_MS : minutesToEpoch(s.start),
        durationMinutes: Number.isFinite(s.stop) && Number.isFinite(s.start) ? s.stop - s.start : null,
        raw: { start: s.start, stop: s.stop, model: s.model },
      }));
    }
  } catch (e) {
    /* stages optional */
  }
  let naps = null;
  try {
    const rows = sleep.getNap();
    if (Array.isArray(rows) && rows.length) {
      naps = rows.map((n) => ({
        startAt: minutesToEpoch(n.start),
        durationMinutes: n.length,
        raw: { start: n.start, stop: n.stop },
      }));
    }
  } catch (e) {
    /* naps optional (API_LEVEL 3.0) */
  }
  return {
    lastNight: {
      score: Number.isFinite(info.score) ? info.score : null,
      totalMinutes: info.totalTime,
      deepMinutes: Number.isFinite(info.deepTime) ? info.deepTime : null,
      startAt,
      endAt: minutesToEpoch(info.endTime),
      raw: { startTime: info.startTime, endTime: info.endTime },
      timesDerived: true, // epochs derived from minute offsets + local midnight
      stages,
    },
    naps,
  };
}

function collectStress(now) {
  const stress = new Stress();
  let current = null;
  try {
    const cur = stress.getCurrent();
    if (cur && Number.isFinite(cur.value) && cur.value > 0) {
      current = { level: cur.value, at: epochMs(cur.time) || now, rawTime: cur.time };
    }
  } catch (e) {
    /* no current stress */
  }
  // getLastWeekByHour is the ONLY stress history with real timestamps (UTC seconds);
  // per docs, stress === 0 marks invalid slots.
  let history = null;
  try {
    const rows = stress.getLastWeekByHour();
    if (Array.isArray(rows)) {
      history = [];
      for (const r of rows) {
        const at = r && epochMs(r.second);
        if (at && Number.isFinite(r.stress) && r.stress > 0) history.push([at, r.stress]);
      }
    }
  } catch (e) {
    /* history unavailable */
  }
  return { current, history, historyFormat: "[epochMs, level]", historySpan: "7d hourly" };
}

function collectActivity() {
  // Step/Calorie/Distance are current-value-only APIs — no hourly breakdown exists
  // (capability map: verified twice against the live docs). Distance units are
  // undocumented; the raw device value ships unconverted.
  const step = new Step();
  const calorie = new Calorie();
  const distance = new Distance();
  const grab = (fn) => {
    try {
      const v = fn();
      return Number.isFinite(v) ? v : null;
    } catch (e) {
      return null;
    }
  };
  return {
    steps: grab(() => step.getCurrent()),
    stepGoal: grab(() => step.getTarget()),
    // Single figure only — the API has no active/total split.
    calories: { total: grab(() => calorie.getCurrent()), active: null },
    calorieGoal: grab(() => calorie.getTarget()),
    distanceRaw: grab(() => distance.getCurrent()),
    distanceUnit: "device-raw (undocumented; observed meters)",
    hourlySteps: null, // no such API
    activeMinutes: null, // no such API
  };
}

function collectPai(midnight) {
  const pai = new Pai();
  const total = pai.getTotal();
  let today = null;
  try {
    today = pai.getToday();
  } catch (e) {
    /* today optional */
  }
  let trend = null;
  try {
    const week = pai.getLastWeek();
    if (Array.isArray(week)) {
      // Docs: index 0 = today, 1 = yesterday, … — the REVERSE of Stress.getLastWeek().
      trend = week.map((v, i) => [midnight - i * DAY_MS, Number.isFinite(v) ? v : null]);
    }
  } catch (e) {
    /* trend optional */
  }
  return { total: Number.isFinite(total) ? total : null, today, trend, trendFormat: "[dayStartMs, pai]" };
}

function collectBodyTemp(midnight, now) {
  const temp = new BodyTemperature();
  let latest = null;
  try {
    const cur = temp.getCurrent();
    if (cur && Number.isFinite(cur.current) && cur.current > -100) {
      latest = { celsius: cur.current, at: now };
    }
  } catch (e) {
    /* no current temp */
  }
  let history = null;
  try {
    const grid = temp.getToday();
    if (Array.isArray(grid)) {
      // Documented fixed grid: 288 five-minute buckets from 0:00; -1000 = unmeasured.
      // Unlike HR's getToday(), this grid IS the documented contract, so deriving slot
      // timestamps is reading the API, not fabricating data.
      history = [];
      for (let i = 0; i < grid.length; i++) {
        const c = grid[i];
        if (Number.isFinite(c) && c > -100) history.push([midnight + i * 5 * MIN_MS, c]);
      }
    }
  } catch (e) {
    /* history unavailable */
  }
  return { latest, history, historyFormat: "[epochMs, celsius]", timesDerived: true };
}

function collectWorkouts() {
  const workout = new Workout();
  let history = null;
  try {
    const rows = workout.getHistory();
    if (Array.isArray(rows)) {
      history = rows.map((w) => ({
        // The ONLY documented fields. startTime's epoch unit is undocumented — ship
        // both the raw value and the plausible-epoch normalization.
        startAt: epochMs(w.startTime),
        rawStartTime: w.startTime,
        durationSeconds: Number.isFinite(w.duration) ? w.duration : null,
        // Not readable from a mini-app (capability map §Workout):
        type: null,
        calories: null,
        avgHR: null,
        maxHR: null,
        distanceMeters: null,
      }));
    }
  } catch (e) {
    /* workout history unavailable */
  }
  let training = null;
  try {
    const s = workout.getStatus();
    if (s) {
      training = {
        vo2Max: Number.isFinite(s.vo2Max) ? s.vo2Max : null,
        trainingLoad: Number.isFinite(s.trainingLoad) ? s.trainingLoad : null,
        fullRecoveryTime: Number.isFinite(s.fullRecoveryTime) ? s.fullRecoveryTime : null,
      };
    }
  } catch (e) {
    /* training status unavailable */
  }
  return { history, training, note: "API exposes only startTime+duration per workout" };
}

function collectEnvironment(now) {
  const baro = new Barometer();
  const pressure = baro.getAirPressure();
  const altitude = baro.getAltitude();
  return {
    pressure: Number.isFinite(pressure) ? { hpa: pressure, at: now } : null,
    altitude: Number.isFinite(altitude) ? { meters: altitude, at: now } : null,
  };
}

// ---- snapshot orchestration ---------------------------------------------------------

const DOMAINS = [
  ["device", (ctx) => collectDevice()],
  ["heartRate", (ctx) => collectHeartRate(ctx.now)],
  ["bloodOxygen", (ctx) => collectBloodOxygen(ctx.now)],
  ["sleep", (ctx) => collectSleep(ctx.midnight)],
  ["stress", (ctx) => collectStress(ctx.now)],
  ["activity", () => collectActivity()],
  ["pai", (ctx) => collectPai(ctx.midnight)],
  ["bodyTemp", (ctx) => collectBodyTemp(ctx.midnight, ctx.now)],
  ["workouts", () => collectWorkouts()],
  ["environment", (ctx) => collectEnvironment(ctx.now)],
];

/**
 * Collect every domain and seal one snapshot file. Domains are collected and written
 * one at a time (never all in memory at once); a failing sensor records
 * `{data: null, err}` for that domain and the rest proceed. Returns a small summary
 * for the UI, or null when the filesystem refused a writer.
 */
export function collectWellnessSnapshot() {
  const now = Date.now();
  const ctx = { now, midnight: localMidnight() };
  const writer = createSnapshotWriter(Math.floor(now / 1000));
  if (!writer) return null;
  let ok = 0;
  let failed = 0;
  for (const [domain, collect] of DOMAINS) {
    let record;
    try {
      record = { v: WELLNESS_SCHEMA_VERSION, domain, at: Date.now(), data: collect(ctx) };
      ok++;
    } catch (e) {
      record = { v: WELLNESS_SCHEMA_VERSION, domain, at: Date.now(), data: null, err: errText(e) };
      failed++;
    }
    writer.writeRecord(record);
  }
  writer.close();
  pruneWellnessFiles();
  return { file: writer.path, domains: ok, failed };
}
