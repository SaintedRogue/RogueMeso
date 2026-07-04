import { BaseSideService } from "@zeppos/zml/base-side";

// The Side Service runs inside the Zepp phone app and is the mini-app's ONLY component
// with network access. It relays watch requests to RogueMeso, attaching the server URL +
// token the user pasted into the Settings screen (settingsStorage).

function readConfig() {
  const serverUrl = (settings.settingsStorage.getItem("serverUrl") || "").trim().replace(/\/+$/, "");
  const token = (settings.settingsStorage.getItem("token") || "").trim();
  return { serverUrl, token };
}

async function relay(payload, res) {
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
      body: JSON.stringify({ ...payload, phoneAt: Date.now() }),
    });
    // Trust the body, not the status: a proxy redirect to the login page also answers
    // 200 (learned the hard way, 2026-07-02). Only our route says `"ok": true`.
    const body = typeof response.body === "string" ? safeParse(response.body) : response.body;
    const ok = response.status === 200 && !!body && body.ok === true;
    // Pass the parsed body through: window lookups need `from`/`to` back on the watch.
    res(null, { ok, status: response.status, body: ok ? body : null });
  } catch (e) {
    res(null, { ok: false, error: "fetch failed" });
  }
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch (e) {
    return null;
  }
}

AppSideService(
  BaseSideService({
    onInit() {},
    onRequest(req, res) {
      // zml puts the request payload's fields on `req` itself (alongside `method`).
      const { method, ...payload } = req;
      if (method === "PING") {
        relay({ type: "ping", ...payload }, res);
      } else if (method === "RATE") {
        relay({ type: "rate", ...payload }, res);
      } else if (method === "HR_BATCH") {
        // Recorder batch: pass through verbatim — the server decodes t0/s and answers
        // {ok, seq, stored}; the watch deletes the batch file only on that ack.
        relay({ type: "hr", ...payload }, res);
      } else if (method === "GET_WINDOW") {
        // On-demand sync asks the server for the latest workout's set-log bounds.
        relay({ type: "window" }, res);
      } else if (method === "DIAG") {
        // Shape/characterization reports — land in the server's log-and-echo branch.
        relay({ type: "diag", ...payload }, res);
      } else if (method === "DUMP") {
        // Raw-array chunks for offline analysis — same log-and-echo path.
        relay({ type: "dump", ...payload }, res);
      } else {
        res(null, { ok: false, error: `unknown method ${method}` });
      }
    },
    onRun() {},
    onDestroy() {},
  }),
);
