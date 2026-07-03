import * as hmUI from "@zos/ui";
import { HeartRate } from "@zos/sensor";
import { createTimer, deleteTimer } from "@zos/timer";
import { setPageBrightTime, resetPageBrightTime, pauseDropWristScreenOff, resumeDropWristScreenOff } from "@zos/display";
import { BasePage } from "@zeppos/zml/base-page";
import { TITLE_TEXT, PING_BUTTON, RATE_BUTTON, STATUS_TEXT } from "zosLoader:./index.[pf].layout.js";

// Spike page, v2. Two experiments:
//  - "Send ping": full round-trip test (sensor read -> BLE -> Side Service -> RogueMeso).
//  - "HR rate 60s": THE recorder-decider — subscribe to HeartRate.onCurrentChange for
//    60 seconds and count callbacks. ~60 events = per-second capture is viable on-watch;
//    a handful = the sensor ticks slowly outside workouts and the recorder idea dies.
//    Run it twice: once idle, once with a native workout running.

const RATE_TEST_MS = 60_000;

let statusWidget;

function setStatus(text) {
  if (statusWidget) statusWidget.setProperty(hmUI.prop.TEXT, text);
}

Page(
  BasePage({
    state: { testing: false },
    build() {
      hmUI.createWidget(hmUI.widget.TEXT, TITLE_TEXT);
      statusWidget = hmUI.createWidget(hmUI.widget.TEXT, {
        ...STATUS_TEXT,
        text: "Ping = round trip\nRate = 60s sensor test",
      });
      hmUI.createWidget(hmUI.widget.BUTTON, {
        ...PING_BUTTON,
        click_func: () => this.sendPing(),
      });
      hmUI.createWidget(hmUI.widget.BUTTON, {
        ...RATE_BUTTON,
        click_func: () => this.startRateTest(),
      });
    },

    sendPing() {
      setStatus("Pinging…");
      let hr = null;
      let restingHr = null;
      try {
        const sensor = new HeartRate();
        hr = sensor.getLast() || null;
        restingHr = sensor.getResting() || null;
      } catch (e) {
        // Sensor unavailable/denied — the ping still tests the network path.
      }
      const startedAt = Date.now();
      this.request({ method: "PING", hr, restingHr, watchAt: startedAt })
        .then((data) => {
          const ms = Date.now() - startedAt;
          if (data && data.ok) setStatus(`OK ${data.status} · ${ms} ms\nserver confirmed`);
          else setStatus(`Failed: ${(data && data.error) || `status ${data && data.status}`}\n(check settings in Zepp app)`);
        })
        .catch(() => setStatus("No reply from phone.\nIs the Zepp app running?"));
    },

    startRateTest() {
      if (this.state.testing) return;
      this.state.testing = true;
      // Hold the screen for the whole window: a dimmed page suspends the test, and a
      // minute is too long to keep a watch awake by hand (field feedback, v0.2).
      try {
        setPageBrightTime({ brightTime: RATE_TEST_MS + 10_000 });
        pauseDropWristScreenOff({ duration: RATE_TEST_MS + 10_000 });
      } catch (e) {
        /* older firmware — worst case the user taps to keep it awake */
      }
      let sensor;
      const stamps = [];
      const onChange = () => {
        stamps.push(Date.now());
        setStatus(`Sampling… ${stamps.length} updates`);
      };
      try {
        sensor = new HeartRate();
        sensor.onCurrentChange(onChange);
      } catch (e) {
        this.state.testing = false;
        setStatus("HR sensor unavailable");
        return;
      }
      setStatus("Sampling for 60s…\nscreen will stay on");
      const timer = createTimer(RATE_TEST_MS, 0, () => {
        deleteTimer(timer);
        try {
          sensor.offCurrentChange(onChange);
        } catch (e) {
          /* already off */
        }
        try {
          resetPageBrightTime();
          resumeDropWristScreenOff();
        } catch (e) {
          /* older firmware */
        }
        this.state.testing = false;
        // Median gap says more than the mean when the sensor bursts.
        const gaps = stamps.slice(1).map((t, i) => t - stamps[i]).sort((a, b) => a - b);
        const medianGapMs = gaps.length ? gaps[Math.floor(gaps.length / 2)] : null;
        setStatus(`${stamps.length} updates / 60s\nmedian gap ${medianGapMs != null ? Math.round(medianGapMs / 100) / 10 : "—"}s`);
        this.request({
          method: "RATE",
          watchAt: Date.now(),
          updates: stamps.length,
          seconds: RATE_TEST_MS / 1000,
          medianGapMs,
        })
          .then((data) => {
            if (data && data.ok) setStatus(`${stamps.length} updates / 60s · median gap ${medianGapMs != null ? Math.round(medianGapMs / 100) / 10 : "—"}s\nresult sent ✓`);
          })
          .catch(() => {
            /* result still on screen; server copy is best-effort */
          });
      });
    },
  }),
);
