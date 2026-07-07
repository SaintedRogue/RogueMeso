import * as hmUI from "@zos/ui";
import { HeartRate } from "@zos/sensor";
import { createTimer, deleteTimer } from "@zos/timer";
import * as alarmMgr from "@zos/alarm";
import { BasePage } from "@zeppos/zml/base-page";
import { listBatchFiles, readBatchFile, removeBatchFile, readJsonFile, writeJsonFile, sealOpenBatch } from "../utils/recorderStore";
import { ICON_IMG, TITLE_TEXT, STATUS_CARD, STATUS_TEXT, PING_BUTTON, TRACK_BUTTON } from "zosLoader:./index.[pf].layout.js";

// Beacon control surface. One job: workout HR tracking. "Track Workout" arms a
// repeating one-minute alarm (armed here, fired by the OS) that wakes the
// minute-logger App Service; that service timestamps each HR reading at capture and
// seals batch files. This page drains those files to the server while it's open — the
// guaranteed sync path. "Ping" is a connectivity check. Every tick is exception-guarded
// (a throwing tick looked like a dead page in early field tests).

const LOGGER_SERVICE_FILE = "app-service/minute-logger";
// Track toggle state survives page restarts here; the alarm itself survives reboots
// via store: true, so this file is the page's view of "did I arm one?".
const TRACK_CFG_FILE = "hrtrack_cfg.json";
// Heartbeat the minute-logger writes each sample (keep in sync with its TRACK_STATUS_FILE).
const TRACK_STATUS_FILE = "hrtrack.json";
// The minute-logger's unsealed batch (keep in sync with its OPEN_BATCH_FILE).
const TRACK_OPEN_FILE = "hrtrack_open.json";
// If the open batch hasn't grown in this long, tracking has stopped — seal it so the
// samples can drain even if the user never pressed Stop. ~2.5 missed one-minute wakes.
const TRACK_OPEN_STALE_MS = 150_000;
// Workout-scoped: tracking self-terminates after this long. Long enough for any gym
// session, short enough that a forgotten toggle costs an afternoon, not a week.
const TRACK_MAX_MS = 3 * 60 * 60 * 1000;
const NOTICE_MS = 6000;

let statusWidget;
let trackBtn;
let pollTimer = null;
let draining = false;
let notice = null;
let noticeUntil = 0;

function setStatusText(text) {
  if (statusWidget) statusWidget.setProperty(hmUI.prop.TEXT, text);
}
/** Show a message that survives the tick for a few seconds (start/stop/errors). */
function notify(text, ms) {
  notice = text;
  noticeUntil = Date.now() + (ms || NOTICE_MS);
  setStatusText(text);
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

    /**
     * Recover a stuck tracking batch: if the open (unsealed) file has samples but has
     * gone stale (tracking stopped without the final batch being sealed), seal it into
     * a drainable file. Runs each tick, so simply opening the app after a workout syncs
     * the data — no reliance on pressing Stop. Won't touch an actively-growing batch.
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
      // trackingArmed() also clears an expired auto-off config, so the primary CTA
      // label heals itself if the 3h deadline passes while the page is open.
      const tracking = this.trackingArmed();
      if (trackBtn) trackBtn.setProperty(hmUI.prop.TEXT, tracking ? "Stop Tracking" : "Track Workout");

      if (pending && pending.length > 0) this.drain(pending);
      if (Date.now() < noticeUntil) return; // let start/stop/error messages be read

      const pendingLabel = pending == null ? "fs?" : `${pending.length} pending`;
      if (tracking) {
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

    trackingArmed() {
      const cfg = readJsonFile(TRACK_CFG_FILE);
      if (!cfg || !cfg.alarmId) return false;
      // Auto-off: past the deadline the logger service disarms itself; treat the
      // config as expired here too so the button never shows a stale "Stop Tracking".
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
