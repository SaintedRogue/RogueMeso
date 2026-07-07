// All-day HR minute logger. Woken once per minute by a repeating @zos/alarm (armed by
// the page's Track toggle) and runs in Single Execution mode: sample, persist, exit —
// all inside the system's 600 ms budget. This exists because the Active 2's
// getToday() is a gap-compacted array with no recoverable index→time mapping
// (characterized 2026-07-04 from the raw dumps), and a continuous recorder service
// gets killed by the OS within minutes. A per-minute wake-up has no long-lived process
// to kill, and every sample is timestamped at capture — the one mapping we can trust.
//
// Data path: samples accumulate in an open-batch file, sealed every SEAL_AT samples
// into the SAME {seq, t0, s: [[secSinceT0, bpm]]} batch files the session recorder
// writes — so the page drain → Side Service → server pipeline is reused unchanged.
//
// Resolution note: getLast() returns the system's most recent measurement (denser in
// workout mode, sparser idle), sampled here on a 1-minute clock. Consecutive repeats
// of one system measurement are recorded as-is — an honest 1-minute staircase.
//
// Constraint (app-service guide): fs WRITES only work when the screen is off or in
// AOD. A wake-up while the screen is on may fail to persist — that's one lost minute,
// caught and ignored; the alarm fires again next minute.

import { HeartRate } from "@zos/sensor";
import * as appServiceMgr from "@zos/app-service";
import * as alarmMgr from "@zos/alarm";
import {
  writeBatchFile,
  listBatchFiles,
  removeBatchFile,
  readJsonFile,
  writeJsonFile,
  sealOpenBatch,
} from "../utils/recorderStore";

const OPEN_BATCH_FILE = "hrtrack_open.json";
export const TRACK_STATUS_FILE = "hrtrack.json";
// Must match the page's TRACK_CFG_FILE — the toggle writes it, this service enforces it.
const TRACK_CFG_FILE = "hrtrack_cfg.json";
// 10 samples ≈ 10 min per sealed file. Kept small so an in-progress workout banks
// drainable data often (little sits unsealed if the app is opened mid-session); the
// seal-on-stop + stale-flush recovery catches whatever remains.
const SEAL_AT = 10;
// Rolling cap on unsynced sealed batches (~50 h at one per 30 min). If the app isn't
// opened for days, oldest HR drops first rather than exhausting mini-app storage.
const MAX_PENDING_BATCHES = 100;

function sampleOnce() {
  let bpm = 0;
  try {
    bpm = new HeartRate().getLast();
  } catch (e) {
    return; // sensor unavailable this minute — the alarm will try again
  }
  if (!bpm || bpm < 25 || bpm > 250) return; // off-body/junk — nothing to record

  const now = Date.now();
  let open = readJsonFile(OPEN_BATCH_FILE);
  // t0 must be a real epoch (a freshly-sealed file is written with t0: 0 on purpose).
  if (!open || !(open.t0 > 0) || !Array.isArray(open.s)) {
    open = { t0: now, s: [] };
  }
  open.s.push([Math.round((now - open.t0) / 1000), bpm]);

  if (open.s.length >= SEAL_AT) {
    const seq = now % 1_000_000; // same uniqueness scheme as the session recorder
    writeBatchFile(seq, { seq, t0: open.t0, watchSealedAt: now, s: open.s });
    open = { t0: 0, s: [] };
    pruneSealedBatches();
  }
  writeJsonFile(OPEN_BATCH_FILE, open);
  // Heartbeat for the page UI ("Track ●" + last sample). Distinct from the session
  // recorder's hrstatus.json — the two services must not clobber each other.
  writeJsonFile(TRACK_STATUS_FILE, { bpm, at: now, pending: open.s.length });
}

function pruneSealedBatches() {
  const files = listBatchFiles();
  if (!files) return;
  for (let i = 0; i < files.length - MAX_PENDING_BATCHES; i++) removeBatchFile(files[i]);
}

/**
 * Workout-scoped auto-off: past the toggle's deadline, cancel the alarm and clear the
 * config instead of sampling. The alarm's own end_time should make this unreachable,
 * but end_time is a documented-yet-unproven field on this firmware — this guard makes
 * "forgot to toggle off" cost at most one extra wake-up either way.
 */
function pastDeadline() {
  const cfg = readJsonFile(TRACK_CFG_FILE);
  if (!cfg || !cfg.alarmId || !cfg.until || Date.now() <= cfg.until) return false;
  sealOpenBatch(OPEN_BATCH_FILE); // flush the final partial batch so it can drain
  try {
    alarmMgr.cancel(cfg.alarmId);
  } catch (e) {
    /* alarm already gone (end_time honored) — clearing the config still matters */
  }
  writeJsonFile(TRACK_CFG_FILE, { alarmId: 0 });
  return true;
}

AppService({
  onInit() {
    try {
      if (!pastDeadline()) sampleOnce();
    } catch (e) {
      /* one lost minute; never leave the service hanging */
    }
    appServiceMgr.exit(); // Single Execution: done means gone
  },
  onDestroy() {},
});
