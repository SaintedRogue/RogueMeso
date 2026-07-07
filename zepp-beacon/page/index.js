import * as hmUI from "@zos/ui";
import { HeartRate, Time } from "@zos/sensor";
import { createTimer, deleteTimer } from "@zos/timer";
import * as appService from "@zos/app-service";
import * as alarmMgr from "@zos/alarm";
import { queryPermission, requestPermission } from "@zos/app";
import { BasePage } from "@zeppos/zml/base-page";
import { listBatchFiles, readBatchFile, removeBatchFile, readStatus, readJsonFile, writeJsonFile, sealOpenBatch } from "../utils/recorderStore";
import { collectWellnessSnapshot } from "../utils/wellness-collector";
import { listWellnessFiles, readWellnessRecords, removeWellnessFile } from "../utils/wellnessStore";
import {
  ICON_IMG,
  TITLE_TEXT,
  STATUS_CARD,
  STATUS_TEXT,
  SYNC_BUTTON,
  RECORD_BUTTON,
  PING_BUTTON,
  WELLNESS_BUTTON,
  TRACK_BUTTON,
} from "zosLoader:./index.[pf].layout.js";

// Recorder control surface (spec: R2). The App Service does the recording; this page
// starts/stops it, shows status, and drains sealed batch files to the server while
// open (the guaranteed sync path). v0.4.1 lessons: transient messages must survive the
// status tick, every tick is exception-guarded (a throwing tick looked like a dead
// page), and "is it running" comes from getAllAppServices(), not just the status file.

const SERVICE_FILE = "app-service/recorder";
const LOGGER_SERVICE_FILE = "app-service/minute-logger";
// Track toggle state survives page restarts here; the alarm itself survives reboots
// via store: true, so this file is the page's view of "did I arm one?".
const TRACK_CFG_FILE = "hrtrack_cfg.json";
// Heartbeat the minute-logger writes each sample (keep in sync with its TRACK_STATUS_FILE).
const TRACK_STATUS_FILE = "hrtrack.json";
// The minute-logger's unsealed batch (keep in sync with its OPEN_BATCH_FILE).
const TRACK_OPEN_FILE = "hrtrack_open.json";
// If the open batch hasn't grown in this long, tracking has stopped — seal it so the
// samples can drain even if the user never pressed Stop (they synced via the wrong
// button, closed the app mid-workout, etc.). ~2.5 missed one-minute wakes.
const TRACK_OPEN_STALE_MS = 150_000;
// Workout-scoped: tracking self-terminates after this long (matches the recorder's
// old battery guard). Long enough for any gym session, short enough that a forgotten
// toggle costs an afternoon, not a week.
const TRACK_MAX_MS = 3 * 60 * 60 * 1000;
const BG_PERMISSION = ["device:os.bg_service"];
const NOTICE_MS = 6000;
// On-demand sync: the watch's own all-day monitoring keeps per-minute HR regardless of
// our recorder (the OS kills background services within minutes — field-proven). "Sync
// HR" asks the SERVER for the latest workout's set-log bounds (±5 min) and sends only
// those minutes — deliberate, session-scoped, no automatic behavior.
const SYNC_CHUNK = 350;

let statusWidget;
let recordBtn;
let trackBtn;
let pollTimer = null;
let collectTimer = null;
let draining = false;
let syncing = false;
let wellnessBusy = false;
let notice = null;
let noticeUntil = 0;

function setStatusText(text) {
  if (statusWidget) statusWidget.setProperty(hmUI.prop.TEXT, text);
}
function setRecordLabel(text) {
  if (recordBtn) recordBtn.setProperty(hmUI.prop.TEXT, text);
}
/** Show a message that survives the tick for a few seconds (start/stop/errors). */
function notify(text, ms) {
  notice = text;
  noticeUntil = Date.now() + (ms || NOTICE_MS);
  setStatusText(text);
}

function serviceRunning() {
  try {
    const services = appService.getAllAppServices();
    return Array.isArray(services) && services.indexOf(SERVICE_FILE) >= 0;
  } catch (e) {
    return null; // API unavailable — fall back to the status file
  }
}

const errText = (e) => (e && e.message ? String(e.message) : String(e)).slice(0, 80);

Page(
  BasePage({
    state: {},

    build() {
      hmUI.createWidget(hmUI.widget.IMG, ICON_IMG);
      hmUI.createWidget(hmUI.widget.TEXT, TITLE_TEXT);
      hmUI.createWidget(hmUI.widget.FILL_RECT, STATUS_CARD);
      statusWidget = hmUI.createWidget(hmUI.widget.TEXT, { ...STATUS_TEXT, text: "Ready" });
      hmUI.createWidget(hmUI.widget.BUTTON, {
        ...SYNC_BUTTON,
        click_func: () => {
          try {
            this.syncHr();
          } catch (e) {
            notify(`sync err:\n${errText(e)}`);
          }
        },
      });
      recordBtn = hmUI.createWidget(hmUI.widget.BUTTON, {
        ...RECORD_BUTTON,
        click_func: () => {
          try {
            this.toggleRecording();
          } catch (e) {
            notify(`record err:\n${errText(e)}`);
          }
        },
      });
      hmUI.createWidget(hmUI.widget.BUTTON, {
        ...PING_BUTTON,
        click_func: () => this.sendPing(),
      });
      hmUI.createWidget(hmUI.widget.BUTTON, {
        ...WELLNESS_BUTTON,
        click_func: () => {
          try {
            this.syncWellness();
          } catch (e) {
            notify(`wellness err:\n${errText(e)}`);
          }
        },
      });
      trackBtn = hmUI.createWidget(hmUI.widget.BUTTON, {
        ...TRACK_BUTTON,
        text: this.trackingArmed() ? "Stop Tracking" : "Track Workout",
        click_func: () => {
          try {
            this.toggleTracking();
          } catch (e) {
            notify(`track err:\n${errText(e)}`);
          }
        },
      });
      pollTimer = createTimer(1000, 1000, () => {
        try {
          this.tick();
        } catch (e) {
          notify(`tick err:\n${errText(e)}`);
        }
      });
      // Buffer a wellness snapshot on every open (off the build path so first paint
      // isn't blocked by ~12 sensor reads). Sync stays deliberate — button only.
      collectTimer = createTimer(1500, 0, () => {
        try {
          collectWellnessSnapshot();
        } catch (e) {
          /* a failed background collection must never mark the page broken */
        }
      });
    },

    onDestroy() {
      if (pollTimer != null) deleteTimer(pollTimer);
      if (collectTimer != null) deleteTimer(collectTimer);
    },

    /**
     * Recover a stuck tracking batch: if the open (unsealed) file has samples but has
     * gone stale (tracking stopped without the final batch being sealed), seal it into
     * a drainable file. Runs on app open and each tick, so simply opening the app after
     * a workout syncs the data — no reliance on pressing Stop or the right button.
     * Won't touch an actively-growing open batch (last sample < stale threshold).
     */
    flushStaleTrackBatch() {
      const open = readJsonFile(TRACK_OPEN_FILE);
      if (!open || !Array.isArray(open.s) || open.s.length === 0 || !(open.t0 > 0)) return;
      const lastAt = open.t0 + open.s[open.s.length - 1][0] * 1000;
      if (Date.now() - lastAt > TRACK_OPEN_STALE_MS) sealOpenBatch(TRACK_OPEN_FILE);
    },

    tick() {
      this.flushStaleTrackBatch(); // recover any stuck partial batch before draining
      const pending = listBatchFiles(); // null = fs listing broken (shown, not hidden)
      const running = serviceRunning();
      const st = readStatus();
      const isRecording = running != null ? running : !!(st && st.recording);
      setRecordLabel(isRecording ? "Stop" : "Record");
      // trackingArmed() also clears an expired auto-off config, so the primary CTA
      // label heals itself if the 3h deadline passes while the page is open.
      const tracking = this.trackingArmed();
      if (trackBtn) trackBtn.setProperty(hmUI.prop.TEXT, tracking ? "Stop Tracking" : "Track Workout");

      if (pending && pending.length > 0) this.drain(pending);
      if (Date.now() < noticeUntil) return; // let start/stop/error messages be read

      const pendingLabel = pending == null ? "fs?" : `${pending.length} pending`;
      if (isRecording && st) {
        const mins = Math.floor((Date.now() - st.startAt) / 60000);
        setStatusText(`● Recording ${mins}m · ${st.total || 0} samples\n♥ ${st.bpm || "—"} · ${pendingLabel}`);
      } else if (isRecording) {
        setStatusText(`● Recording…\n${pendingLabel}`);
      } else if (tracking) {
        const cfg = readJsonFile(TRACK_CFG_FILE);
        const ts = readJsonFile(TRACK_STATUS_FILE);
        const mins = cfg && cfg.armedAt ? Math.floor((Date.now() - cfg.armedAt) / 60000) : 0;
        const fresh = ts && ts.at && Date.now() - ts.at < 180_000; // ~3 missed wakes = stale
        setStatusText(`● Tracking ${mins}m${fresh ? ` · ♥ ${ts.bpm}` : ""}\n${pendingLabel}`);
      } else {
        setStatusText(pending && pending.length > 0 ? `Syncing…\n${pendingLabel}` : `Ready · ${pendingLabel}`);
      }
    },

    /** Send sealed batches oldest-first, deleting each only on a server-confirmed ack. */
    drain(pending) {
      if (draining || pending.length === 0) return;
      draining = true;
      const name = pending[0];
      const batch = readBatchFile(name);
      if (!batch) {
        removeBatchFile(name); // unreadable file is unrecoverable — drop, don't wedge the queue
        draining = false;
        return;
      }
      // watchNow is stamped at SEND time (not seal time): skew correction measures clock
      // offset, and a batch drained 20 minutes late must not be shifted by its own delay.
      this.request({ method: "HR_BATCH", ...batch, watchNow: Date.now() })
        .then((res) => {
          if (res && res.ok) removeBatchFile(name);
          else notify(`sync failed: ${(res && (res.error || res.status)) || "?"}`);
        })
        .catch(() => {})
        .finally(() => {
          draining = false;
        });
    },

    /**
     * On-demand "Sync HR": ask the server for the latest workout's set-log bounds
     * (±5 min), then send exactly the watch's per-minute readings inside that window.
     * Deliberate and session-scoped — nothing happens unless this button is pressed.
     * Resends are harmless (the server dedups per second at read time).
     */
    syncHr() {
      if (syncing) return;
      syncing = true;
      notify("Finding your workout…");
      this.request({ method: "GET_WINDOW" })
        .then((res) => {
          const w = res && res.ok && res.body ? res.body : null;
          if (!w || typeof w.from !== "number" || typeof w.to !== "number") {
            syncing = false;
            notify(w ? "No workout in the last 36h" : `Lookup failed\n(check settings in Zepp app)`);
            return;
          }
          this.sendWindow(w.from, w.to);
        })
        .catch(() => {
          syncing = false;
          notify("No reply from phone.\nIs the Zepp app running?");
        });
    },

    sendWindow(from, to) {
      let entries;
      let midnight;
      try {
        entries = new HeartRate().getToday();
        const t = new Time();
        midnight = Date.now() - (t.getHours() * 3600 + t.getMinutes() * 60 + t.getSeconds()) * 1000;
      } catch (e) {
        syncing = false;
        notify(`HR history unavailable\n${errText(e)}`);
        return;
      }
      if (!Array.isArray(entries)) entries = [];

      // Field lesson (2026-07-03): on the Active 2 this array is NOT the documented
      // minute grid — 102 entries covered a 1h workout (~9s apart, denser in workout
      // mode). Characterize the real shape server-side before trusting any mapping.
      let firstIdx = -1;
      let lastIdx = -1;
      let nonzero = 0;
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const v = typeof e === "number" ? e : e && typeof e === "object" ? e.value ?? e.hr ?? e.bpm : 0;
        if (v > 0) {
          nonzero++;
          if (firstIdx < 0) firstIdx = i;
          lastIdx = i;
        }
      }
      this.request({
        method: "DIAG",
        kind: "getToday",
        len: entries.length,
        nonzero,
        firstIdx,
        lastIdx,
        head: entries.slice(0, 3),
        tail: entries.slice(-3),
        midnight,
        watchNow: Date.now(),
        windowFrom: from,
        windowTo: to,
      }).catch(() => {});

      // Timestamped entries ({time,value}-ish objects) are trustworthy; bare numbers
      // are NOT minute-indexed on this device, so refuse to fabricate times for them.
      const rows = [];
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (!e || typeof e !== "object") continue;
        const rawT = e.time ?? e.timestamp ?? e.t;
        const bpm = e.value ?? e.hr ?? e.bpm;
        if (!Number.isFinite(rawT) || !Number.isFinite(bpm) || bpm <= 25 || bpm > 250) continue;
        // Timestamps may be epoch-ms, epoch-s, or seconds-since-midnight — normalize.
        const at = rawT > 1e12 ? rawT : rawT > 1e9 ? rawT * 1000 : midnight + rawT * 1000;
        if (at < from || at > to || at > Date.now()) continue;
        rows.push([Math.round((at - midnight) / 1000), bpm]);
      }
      if (rows.length === 0) {
        // Bare numbers we refuse to timestamp — but ship the WHOLE array to the server
        // (chunked) so the log characterizes the real cadence offline.
        this.dumpEntries(entries, 0);
        return;
      }
      notify(`Syncing ${rows.length} min…`);
      const sendChunk = (offset) => {
        if (offset >= rows.length) {
          syncing = false;
          notify(`Synced ${rows.length} min ✓\ncheck the workout page`);
          return;
        }
        const chunk = rows.slice(offset, offset + SYNC_CHUNK);
        this.request({ method: "HR_BATCH", seq: 900_000 + offset, t0: midnight, watchNow: Date.now(), s: chunk })
          .then((res) => {
            if (res && res.ok) sendChunk(offset + SYNC_CHUNK);
            else {
              syncing = false;
              notify(`Sync failed: ${(res && (res.error || res.status)) || "?"}`);
            }
          })
          .catch(() => {
            syncing = false;
            notify("Sync: no reply from phone");
          });
      };
      sendChunk(0);
    },

    /** Send the raw getToday() array to the server log, 200 values per chunk. */
    dumpEntries(entries, offset) {
      const CHUNK = 200;
      if (offset >= entries.length) {
        syncing = false;
        notify(`Dumped ${entries.length} raw values ✓\n(server has the full array)`);
        return;
      }
      notify(`Dumping raw data… ${offset}/${entries.length}`);
      this.request({
        method: "DUMP",
        offset,
        total: entries.length,
        watchNow: Date.now(),
        values: entries.slice(offset, offset + CHUNK),
      })
        .then((res) => {
          if (res && res.ok) this.dumpEntries(entries, offset + CHUNK);
          else {
            syncing = false;
            notify(`Dump failed at ${offset}`);
          }
        })
        .catch(() => {
          syncing = false;
          notify("Dump: no reply from phone");
        });
    },

    /**
     * "Wellness" button: seal a fresh snapshot of every wellness stream, then drain
     * ALL buffered snapshots (this one plus any earlier failed sends) oldest-first.
     * Same durability contract as HR batches — a snapshot file is deleted only after
     * the server ack comes back through the Side Service.
     */
    syncWellness() {
      if (wellnessBusy) return;
      wellnessBusy = true;
      notify("Collecting wellness…");
      const sealed = collectWellnessSnapshot();
      if (!sealed) {
        wellnessBusy = false;
        notify("Wellness: storage unavailable");
        return;
      }
      this.drainWellnessFiles(sealed.failed);
    },

    drainWellnessFiles(failedDomains) {
      const files = listWellnessFiles();
      if (!files || files.length === 0) {
        wellnessBusy = false;
        notify(files ? "Wellness: nothing to sync" : "Wellness: fs?");
        return;
      }
      let sent = 0;
      const nextFile = () => {
        const name = files[sent];
        if (!name) {
          wellnessBusy = false;
          const suffix = failedDomains ? `\n(${failedDomains} sensors unavailable)` : "";
          notify(`Wellness synced ✓ ${sent} snapshot${sent === 1 ? "" : "s"}${suffix}`);
          return;
        }
        const records = readWellnessRecords(name);
        if (!records || records.length === 0) {
          removeWellnessFile(name); // unreadable/empty file is unrecoverable — drop it
          sent++;
          nextFile();
          return;
        }
        this.sendWellnessParts(name, records, () => {
          sent++;
          nextFile();
        });
      };
      nextFile();
    },

    /**
     * Ship one snapshot's domain records as sequential parts. The Side Service
     * reassembles by syncId and POSTs the whole snapshot once the last part lands;
     * only that final ack (server-confirmed) deletes the file. Per-domain parts keep
     * every BLE message small — same reasoning as SYNC_CHUNK for HR rows.
     */
    sendWellnessParts(name, records, onDone) {
      const syncId = `${name}-${Date.now()}`;
      const sendPart = (index) => {
        notify(`Wellness: sending ${index + 1}/${records.length}…`);
        this.request({
          method: "WELLNESS",
          syncId,
          index,
          total: records.length,
          record: records[index],
          watchNow: Date.now(),
        })
          .then((res) => {
            if (!res || !res.ok) {
              wellnessBusy = false;
              notify(`Wellness failed: ${(res && (res.error || res.status)) || "?"}`);
              return;
            }
            if (index + 1 < records.length) sendPart(index + 1);
            else {
              removeWellnessFile(name); // final part carried the server ack
              onDone();
            }
          })
          .catch(() => {
            wellnessBusy = false;
            notify("Wellness: no reply from phone");
          });
      };
      sendPart(0);
    },

    toggleRecording() {
      const running = serviceRunning();
      const st = readStatus();
      if (running === true || (running == null && st && st.recording)) {
        notify("Stopping — syncing…");
        appService.stop({
          url: SERVICE_FILE,
          param: "action=stop",
          complete_func: (info) => notify(info && info.result ? "Stopped ✓" : "Stop failed — retry"),
        });
        return;
      }
      notify("Checking permission…");
      const [granted] = queryPermission({ permissions: BG_PERMISSION });
      if (granted === 2) this.startService();
      else {
        requestPermission({
          permissions: BG_PERMISSION,
          callback: ([result]) => {
            if (result === 2) this.startService();
            else notify(`Permission not granted (${result})\ntap Record to retry`);
          },
        });
      }
    },

    startService() {
      notify("Starting recorder…");
      appService.start({
        url: SERVICE_FILE,
        param: "action=start",
        complete_func: (info) => {
          if (info && info.result) notify("Recording started ●", 3000);
          else notify(`Start failed (${info && info.file ? info.file : "?"})\nanother service running?`);
        },
      });
    },

    trackingArmed() {
      const cfg = readJsonFile(TRACK_CFG_FILE);
      if (!cfg || !cfg.alarmId) return false;
      // Auto-off: past the deadline the logger service disarms itself; treat the
      // config as expired here too so the button never shows a stale "Track ●".
      if (cfg.until && Date.now() > cfg.until) {
        writeJsonFile(TRACK_CFG_FILE, { alarmId: 0 });
        return false;
      }
      return true;
    },

    /**
     * Workout HR tracking toggle. Arms a repeating one-minute alarm targeting the
     * minute-logger App Service (Single Execution mode — no long-lived process for
     * the battery manager to kill). This is the trusted alternative to getToday(),
     * whose gap-compacted array has no recoverable index→time mapping on this device:
     * every logged sample is timestamped at capture instead.
     *
     * Workout-scoped by design: auto-disarms TRACK_MAX_MS after arming (alarm-level
     * end_time + a service-side self-disarm guard, in case end_time is firmware-
     * flaky), so a forgotten toggle can't burn all-day battery. Press at the start
     * of a session; press again to stop early.
     */
    toggleTracking() {
      if (this.trackingArmed()) {
        const cfg = readJsonFile(TRACK_CFG_FILE);
        try {
          alarmMgr.cancel(cfg.alarmId);
        } catch (e) {
          /* stale id — clearing the config is what matters */
        }
        // Seal the final partial batch so this workout's tail syncs on the next tick.
        const sealed = sealOpenBatch(TRACK_OPEN_FILE);
        writeJsonFile(TRACK_CFG_FILE, { alarmId: 0 });
        if (trackBtn) trackBtn.setProperty(hmUI.prop.TEXT, "Track Workout");
        notify(sealed ? `Tracking off · ${sealed} samples queued` : "Tracking off");
        return;
      }
      // Defensive: clear any orphaned alarms from a previous install before arming,
      // so a re-sideload can't end up with two loggers firing per minute.
      try {
        const ids = alarmMgr.getAllAlarms();
        if (Array.isArray(ids)) for (const id of ids) alarmMgr.cancel(id);
      } catch (e) {
        /* none to clear */
      }
      const now = Date.now();
      const until = now + TRACK_MAX_MS;
      const alarmId = alarmMgr.set({
        url: LOGGER_SERVICE_FILE,
        delay: 60,
        repeat_type: alarmMgr.REPEAT_MINUTE,
        store: true, // survive a mid-workout reboot
        end_time: Math.floor(until / 1000), // docs: repeat only effective within window
      });
      if (!alarmId) {
        notify("Track failed\n(alarm not granted?)");
        return;
      }
      writeJsonFile(TRACK_CFG_FILE, { alarmId, armedAt: now, until });
      if (trackBtn) trackBtn.setProperty(hmUI.prop.TEXT, "Stop Tracking");
      notify("Workout tracking ●\n1/min · auto-off in 3h");
    },

    sendPing() {
      notify("Pinging…");
      let hr = null;
      try {
        hr = new HeartRate().getLast() || null;
      } catch (e) {
        /* sensor optional for a ping */
      }
      const startedAt = Date.now();
      this.request({ method: "PING", hr, watchAt: startedAt })
        .then((data) => {
          if (data && data.ok) notify(`Server OK · ${Date.now() - startedAt} ms`);
          else notify(`Ping failed: ${(data && data.error) || (data && data.status)}\n(check settings in Zepp app)`);
        })
        .catch(() => notify("No reply from phone.\nIs the Zepp app running?"));
    },
  }),
);
