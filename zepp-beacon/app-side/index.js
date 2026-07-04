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

// Wellness snapshots arrive from the watch as sequential per-domain parts (each BLE
// message stays small). Reassemble here and POST the whole snapshot once; the final
// part's response carries the server ack the watch waits on before deleting its file.
// One in-flight snapshot at a time — a new syncId discards any stale partial state
// (e.g. the watch gave up mid-snapshot and retried later).
let pendingWellness = null;

function handleWellnessPart(payload, res) {
  const { syncId, index, total, record } = payload;
  if (typeof syncId !== "string" || !Number.isInteger(index) || !Number.isInteger(total) || total <= 0) {
    res(null, { ok: false, error: "bad wellness part" });
    return;
  }
  if (!pendingWellness || pendingWellness.syncId !== syncId) {
    pendingWellness = { syncId, total, records: [] };
  }
  pendingWellness.records[index] = record || null;
  let received = 0;
  for (let i = 0; i < pendingWellness.records.length; i++) if (pendingWellness.records[i]) received++;
  if (received < total) {
    res(null, { ok: true, buffered: received });
    return;
  }
  const sections = {};
  const errors = {};
  let collectedAt = 0;
  for (const rec of pendingWellness.records) {
    if (!rec || typeof rec.domain !== "string") continue;
    sections[rec.domain] = rec.data ?? null;
    if (rec.err) errors[rec.domain] = rec.err;
    if (Number.isFinite(rec.at) && rec.at > collectedAt) collectedAt = rec.at;
  }
  pendingWellness = null;
  relay({ type: "wellness", syncId, collectedAt, sections, errors, watchNow: payload.watchNow }, res);
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
      } else if (method === "WELLNESS") {
        // Multi-part wellness snapshot: buffer parts, POST once complete.
        handleWellnessPart(payload, res);
      } else {
        res(null, { ok: false, error: `unknown method ${method}` });
      }
    },
    onRun() {},
    onDestroy() {},
  }),
);
