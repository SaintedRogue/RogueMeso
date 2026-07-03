import * as hmUI from "@zos/ui";
import { HeartRate } from "@zos/sensor";
import { createTimer, deleteTimer } from "@zos/timer";
import * as appService from "@zos/app-service";
import { queryPermission, requestPermission } from "@zos/app";
import { BasePage } from "@zeppos/zml/base-page";
import { listBatchFiles, readBatchFile, removeBatchFile, readStatus } from "../utils/recorderStore";
import { TITLE_TEXT, RECORD_BUTTON, PING_BUTTON, STATUS_TEXT } from "zosLoader:./index.[pf].layout.js";

// Recorder control surface (spec: R2). The App Service does the recording; this page
// starts/stops it, shows the heartbeat status, and — critically — DRAINS sealed batch
// files to the server whenever it is open (the guaranteed sync path; the service's own
// in-background relay is opportunistic). Tap Stop and keep the app open a few seconds:
// that is the moment everything left lands.

const SERVICE_FILE = "app-service/recorder";
const BG_PERMISSION = ["device:os.bg_service"];

let statusWidget;
let recordBtn;
let pollTimer = null;
let draining = false;

function setStatus(text) {
  if (statusWidget) statusWidget.setProperty(hmUI.prop.TEXT, text);
}
function setRecordLabel(text) {
  if (recordBtn) recordBtn.setProperty(hmUI.prop.TEXT, text);
}

const fmtAgo = (ms) => (ms < 2000 ? "now" : `${Math.round(ms / 1000)}s ago`);

Page(
  BasePage({
    state: { pendingShown: 0 },

    build() {
      hmUI.createWidget(hmUI.widget.TEXT, TITLE_TEXT);
      statusWidget = hmUI.createWidget(hmUI.widget.TEXT, { ...STATUS_TEXT, text: "Ready" });
      recordBtn = hmUI.createWidget(hmUI.widget.BUTTON, {
        ...RECORD_BUTTON,
        click_func: () => this.toggleRecording(),
      });
      hmUI.createWidget(hmUI.widget.BUTTON, {
        ...PING_BUTTON,
        click_func: () => this.sendPing(),
      });
      // 1s heartbeat: refresh status + drain pending batches while the page is open.
      pollTimer = createTimer(1000, 1000, () => this.tick());
      this.tick();
    },

    onDestroy() {
      if (pollTimer != null) deleteTimer(pollTimer);
    },

    tick() {
      const st = readStatus();
      const pending = listBatchFiles();
      this.state.pendingShown = pending.length;
      if (st && st.recording) {
        setRecordLabel("Stop");
        const mins = Math.floor((Date.now() - st.startAt) / 60000);
        setStatus(`● Recording ${mins}m · ${st.total || 0} samples\n♥ ${st.bpm || "—"} · ${pending.length} batch${pending.length === 1 ? "" : "es"} pending`);
      } else {
        setRecordLabel("Record");
        setStatus(pending.length > 0 ? `Not recording\n${pending.length} pending — syncing…` : "Ready");
      }
      void this.drain(pending);
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
        })
        .catch(() => {})
        .finally(() => {
          draining = false;
        });
    },

    toggleRecording() {
      const st = readStatus();
      if (st && st.recording) {
        appService.stop({
          url: SERVICE_FILE,
          param: "action=stop",
          complete_func: () => this.tick(),
        });
        setStatus("Stopping — syncing…");
        return;
      }
      const [granted] = queryPermission({ permissions: BG_PERMISSION });
      if (granted === 2) this.startService();
      else {
        requestPermission({
          permissions: BG_PERMISSION,
          callback: ([result]) => {
            if (result === 2) this.startService();
            else setStatus("Background permission denied");
          },
        });
      }
    },

    startService() {
      appService.start({
        url: SERVICE_FILE,
        param: "action=start",
        complete_func: (info) => {
          if (!info || !info.result) setStatus("Couldn't start recorder\n(another service running?)");
          else this.tick();
        },
      });
    },

    sendPing() {
      setStatus("Pinging…");
      let hr = null;
      try {
        hr = new HeartRate().getLast() || null;
      } catch (e) {
        /* sensor optional for a ping */
      }
      const startedAt = Date.now();
      this.request({ method: "PING", hr, watchAt: startedAt })
        .then((data) => {
          if (data && data.ok) setStatus(`Server OK · ${Date.now() - startedAt} ms`);
          else setStatus(`Ping failed: ${(data && data.error) || (data && data.status)}\n(check settings in Zepp app)`);
        })
        .catch(() => setStatus("No reply from phone.\nIs the Zepp app running?"));
    },
  }),
);
