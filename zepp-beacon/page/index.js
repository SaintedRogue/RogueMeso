import * as hmUI from "@zos/ui";
import { HeartRate, Time } from "@zos/sensor";
import { createTimer, deleteTimer } from "@zos/timer";
import * as appService from "@zos/app-service";
import { queryPermission, requestPermission } from "@zos/app";
import { BasePage } from "@zeppos/zml/base-page";
import {
  listBatchFiles,
  readBatchFile,
  removeBatchFile,
  readStatus,
  readBackfillMark,
  writeBackfillMark,
} from "../utils/recorderStore";
import { TITLE_TEXT, RECORD_BUTTON, PING_BUTTON, STATUS_TEXT } from "zosLoader:./index.[pf].layout.js";

// Recorder control surface (spec: R2). The App Service does the recording; this page
// starts/stops it, shows status, and drains sealed batch files to the server while
// open (the guaranteed sync path). v0.4.1 lessons: transient messages must survive the
// status tick, every tick is exception-guarded (a throwing tick looked like a dead
// page), and "is it running" comes from getAllAppServices(), not just the status file.

const SERVICE_FILE = "app-service/recorder";
const BG_PERMISSION = ["device:os.bg_service"];
const NOTICE_MS = 6000;
// Backfill: the watch's own all-day monitoring keeps per-minute HR regardless of our
// recorder (field lesson 2026-07-03: the OS killed the App Service ~2 min in — the
// 1 Hz stream is a bonus, the minute data is the guarantee). Look back at most 8h,
// chunk under the server's 400-row batch cap.
const BACKFILL_LOOKBACK_MS = 8 * 60 * 60 * 1000;
const BACKFILL_CHUNK = 350;

let statusWidget;
let recordBtn;
let pollTimer = null;
let draining = false;
let notice = null;
let noticeUntil = 0;
let backfillTriedAt = 0; // once per page visit (and at most every 5 min)

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
      hmUI.createWidget(hmUI.widget.TEXT, TITLE_TEXT);
      statusWidget = hmUI.createWidget(hmUI.widget.TEXT, { ...STATUS_TEXT, text: "Ready" });
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
      pollTimer = createTimer(1000, 1000, () => {
        try {
          this.tick();
        } catch (e) {
          notify(`tick err:\n${errText(e)}`);
        }
      });
    },

    onDestroy() {
      if (pollTimer != null) deleteTimer(pollTimer);
    },

    tick() {
      const pending = listBatchFiles(); // null = fs listing broken (shown, not hidden)
      const running = serviceRunning();
      const st = readStatus();
      const isRecording = running != null ? running : !!(st && st.recording);
      setRecordLabel(isRecording ? "Stop" : "Record");

      if (pending && pending.length > 0) this.drain(pending);
      if (Date.now() < noticeUntil) return; // let start/stop/error messages be read

      // Idle with nothing queued: opportunistically backfill today's per-minute HR.
      if (!isRecording && pending != null && pending.length === 0 && Date.now() - backfillTriedAt > 5 * 60_000) {
        backfillTriedAt = Date.now();
        this.backfill();
      }

      const pendingLabel = pending == null ? "fs?" : `${pending.length} pending`;
      if (isRecording && st) {
        const mins = Math.floor((Date.now() - st.startAt) / 60000);
        setStatusText(`● Recording ${mins}m · ${st.total || 0} samples\n♥ ${st.bpm || "—"} · ${pendingLabel}`);
      } else if (isRecording) {
        setStatusText(`● Recording…\n${pendingLabel}`);
      } else {
        setStatusText(pending && pending.length > 0 ? `Not recording\n${pendingLabel} — syncing…` : `Ready · ${pendingLabel}`);
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
     * Send today's per-minute HR (the watch's own all-day record) that we haven't sent
     * yet — the guaranteed coverage when the 1 Hz service gets killed. Chunked under
     * the server batch cap; the watermark advances only on a confirmed ack, and the
     * server's read-time per-second dedup makes any overlap harmless.
     */
    backfill() {
      let minutes;
      let midnight;
      try {
        minutes = new HeartRate().getToday();
        const t = new Time();
        midnight = Date.now() - (t.getHours() * 3600 + t.getMinutes() * 60 + t.getSeconds()) * 1000;
      } catch (e) {
        return; // sensor/history unavailable — nothing to do
      }
      if (!Array.isArray(minutes) || minutes.length === 0) return;

      const since = Math.max(readBackfillMark(), midnight, Date.now() - BACKFILL_LOOKBACK_MS);
      const rows = [];
      for (let i = 0; i < minutes.length; i++) {
        const bpm = minutes[i];
        const at = midnight + i * 60_000;
        if (!bpm || bpm <= 25 || bpm > 250 || at <= since || at > Date.now()) continue;
        rows.push([Math.round((at - midnight) / 1000), bpm]);
      }
      if (rows.length === 0) return;

      notify(`Backfilling ${rows.length} min…`);
      const sendChunk = (offset) => {
        if (offset >= rows.length) {
          const lastAt = midnight + rows[rows.length - 1][0] * 1000;
          writeBackfillMark(lastAt);
          notify(`Backfilled ${rows.length} min ✓`);
          return;
        }
        const chunk = rows.slice(offset, offset + BACKFILL_CHUNK);
        this.request({ method: "HR_BATCH", seq: 900_000 + offset, t0: midnight, watchNow: Date.now(), s: chunk })
          .then((res) => {
            if (res && res.ok) sendChunk(offset + BACKFILL_CHUNK);
            else notify(`Backfill failed: ${(res && (res.error || res.status)) || "?"}`);
          })
          .catch(() => notify("Backfill: no reply from phone"));
      };
      sendChunk(0);
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
