// Background HR recorder (spec §"Watch app behavior"). Runs as the system's one
// continuous App Service while a session is being recorded: subscribes the HR sensor
// at its native ~1 Hz, seals a compact batch every 30 samples to the filesystem, and
// opportunistically tries to relay it immediately. No timers here — App Services lack
// setTimeout, so the sensor callback itself is the clock (spec §3).

import { HeartRate } from "@zos/sensor";
import * as appServiceMgr from "@zos/app-service";
import { writeBatchFile, writeStatus } from "../utils/recorderStore";

const BATCH_SIZE = 30;
const MAX_SESSION_MS = 3 * 60 * 60 * 1000; // battery guard: hard stop after 3h

let sensor = null;
let startAt = 0;
let seq = 0;
let total = 0;
let t0 = 0;
let samples = []; // current open batch: [secondsSinceT0, bpm]

function sealBatch() {
  if (samples.length === 0) return;
  const batch = { seq, t0, watchSealedAt: Date.now(), s: samples };
  writeBatchFile(seq, batch);
  seq += 1;
  samples = [];
  t0 = 0;
  // Opportunistic immediate relay: zml's bridge is only documented for pages, but if
  // the app-level messaging happens to be live in this context, batches sync mid-set
  // with the screen off. Failure is fine — the page drains the files on open/stop.
  try {
    const app = getApp();
    if (app && typeof app.request === "function") {
      app.request({ method: "HR_BATCH", ...batch }).catch(() => {});
    }
  } catch (e) {
    /* page-drain path covers it */
  }
}

function onChange() {
  let bpm = 0;
  try {
    bpm = sensor.getCurrent();
  } catch (e) {
    return;
  }
  if (!bpm || bpm < 25 || bpm > 250) return; // off-body/junk — server re-validates anyway
  const now = Date.now();
  if (samples.length === 0) t0 = now;
  samples.push([Math.round((now - t0) / 1000), bpm]);
  if (samples.length >= BATCH_SIZE) sealBatch();
  writeStatus({ recording: true, startAt, total: ++total, pendingSeq: seq, bpm, at: now });
  if (now - startAt > MAX_SESSION_MS) stop();
}

function stop() {
  try {
    sensor && sensor.offCurrentChange(onChange);
  } catch (e) {
    /* already off */
  }
  sealBatch(); // whatever is left becomes the final file
  writeStatus({ recording: false, startAt, total, pendingSeq: seq, at: Date.now() });
  appServiceMgr.exit();
}

AppService({
  onInit(e) {
    startAt = Date.now();
    seq = Date.now() % 1_000_000; // per-session uniqueness without persisted state
    writeStatus({ recording: true, startAt, total: 0, pendingSeq: seq, at: startAt });
    try {
      sensor = new HeartRate();
      sensor.onCurrentChange(onChange);
    } catch (err) {
      writeStatus({ recording: false, error: "sensor unavailable", at: Date.now() });
      appServiceMgr.exit();
    }
  },
  onEvent(e) {
    if (typeof e === "string" && e.indexOf("action=stop") >= 0) stop();
  },
  onDestroy() {
    try {
      sensor && sensor.offCurrentChange(onChange);
    } catch (e) {
      /* fine */
    }
    sealBatch();
    writeStatus({ recording: false, startAt, total, pendingSeq: seq, at: Date.now() });
  },
});
