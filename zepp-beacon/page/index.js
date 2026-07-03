import * as hmUI from "@zos/ui";
import { HeartRate } from "@zos/sensor";
import { createTimer, deleteTimer } from "@zos/timer";
import * as appService from "@zos/app-service";
import { queryPermission, requestPermission } from "@zos/app";
import { BasePage } from "@zeppos/zml/base-page";
import { listBatchFiles, readBatchFile, removeBatchFile, readStatus } from "../utils/recorderStore";
import { TITLE_TEXT, RECORD_BUTTON, PING_BUTTON, STATUS_TEXT } from "zosLoader:./index.[pf].layout.js";

// Recorder control surface (spec: R2). The App Service does the recording; this page
// starts/stops it, shows status, and drains sealed batch files to the server while
// open (the guaranteed sync path). v0.4.1 lessons: transient messages must survive the
// status tick, every tick is exception-guarded (a throwing tick looked like a dead
// page), and "is it running" comes from getAllAppServices(), not just the status file.

const SERVICE_FILE = "app-service/recorder";
const BG_PERMISSION = ["device:os.bg_service"];
const NOTICE_MS = 6000;

let statusWidget;
let recordBtn;
let pollTimer = null;
let draining = false;
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
