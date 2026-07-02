import * as hmUI from "@zos/ui";
import { HeartRate } from "@zos/sensor";
import { BasePage } from "@zeppos/zml/base-page";
import { TITLE_TEXT, PING_BUTTON, STATUS_TEXT } from "zosLoader:./index.[pf].layout.js";

// Spike page: one button. Tap -> read a couple of on-watch values -> request the Side
// Service (runs inside the Zepp phone app) to POST them to RogueMeso -> show the result.
// Every hop this exercises is one the real recovery beacon will rely on:
// sensor permission, BLE messaging, Side Service fetch, and server auth.

let statusWidget;

function setStatus(text) {
  if (statusWidget) statusWidget.setProperty(hmUI.prop.TEXT, text);
}

Page(
  BasePage({
    state: {},
    build() {
      hmUI.createWidget(hmUI.widget.TEXT, TITLE_TEXT);
      statusWidget = hmUI.createWidget(hmUI.widget.TEXT, {
        ...STATUS_TEXT,
        text: "Tap to ping RogueMeso",
      });
      hmUI.createWidget(hmUI.widget.BUTTON, {
        ...PING_BUTTON,
        click_func: () => this.sendPing(),
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
          if (data && data.ok) setStatus(`OK ${data.status} · ${ms} ms\nserver got it`);
          else setStatus(`Failed: ${(data && data.error) || "unknown"}\n(check settings in Zepp app)`);
        })
        .catch(() => setStatus("No reply from phone.\nIs the Zepp app running?"));
    },
  }),
);
