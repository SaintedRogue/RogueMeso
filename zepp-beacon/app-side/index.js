import { BaseSideService } from "@zeppos/zml/base-side";

// The Side Service runs inside the Zepp phone app and is the mini-app's ONLY component
// with network access. It relays watch requests to RogueMeso, attaching the server URL +
// token the user pasted into the Settings screen (settingsStorage).

function readConfig() {
  const serverUrl = (settings.settingsStorage.getItem("serverUrl") || "").trim().replace(/\/+$/, "");
  const token = (settings.settingsStorage.getItem("token") || "").trim();
  return { serverUrl, token };
}

async function ping(params, res) {
  const { serverUrl, token } = readConfig();
  if (!serverUrl || !token) {
    res(null, { ok: false, error: "not configured" });
    return;
  }
  try {
    const response = await fetch({
      url: `${serverUrl}/api/wearables/zepp`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        type: "ping",
        watchAt: params.watchAt,
        phoneAt: Date.now(),
        hr: params.hr,
        restingHr: params.restingHr,
      }),
    });
    res(null, { ok: response.status === 200, status: response.status });
  } catch (e) {
    res(null, { ok: false, error: "fetch failed" });
  }
}

AppSideService(
  BaseSideService({
    onInit() {},
    onRequest(req, res) {
      if (req.method === "PING") {
        ping(req.params || {}, res);
      } else {
        res(null, { ok: false, error: `unknown method ${req.method}` });
      }
    },
    onRun() {},
    onDestroy() {},
  }),
);
