// Shared batch store between the recorder App Service (writer) and the Device App page
// (drainer). One file per sealed batch — the service never rewrites a sealed file and
// the page deletes a file only after the SERVER ack, so there is no shared-file race
// and the watch filesystem is the single source of truth for unsynced data (spec §2).

import { readFileSync, writeFileSync, readdirSync, rmSync, statSync } from "@zos/fs";

export const BATCH_PREFIX = "hrbatch_";
export const STATUS_FILE = "hrstatus.json";
const BACKFILL_FILE = "hrbackfill.json";

/** Watermark: per-minute backfill has been sent through this epoch-ms. */
export function readBackfillMark() {
  try {
    if (!statSync({ path: BACKFILL_FILE })) return 0;
    const raw = readFileSync({ path: BACKFILL_FILE });
    const text = typeof raw === "string" ? raw : arrayBufferToStr(raw);
    const v = JSON.parse(text);
    return typeof v.throughMs === "number" ? v.throughMs : 0;
  } catch (e) {
    return 0;
  }
}

export function writeBackfillMark(throughMs) {
  try {
    writeFileSync({ path: BACKFILL_FILE, data: JSON.stringify({ throughMs }) });
  } catch (e) {
    /* worst case we re-send — server dedupes at read time */
  }
}

export function writeBatchFile(seq, batch) {
  writeFileSync({ path: `${BATCH_PREFIX}${String(seq).padStart(6, "0")}.json`, data: JSON.stringify(batch) });
}

/**
 * List pending batch files, or null when the directory listing itself fails (distinct
 * from "none pending" so the page can surface a broken fs instead of looking idle).
 * The exact readdirSync path form varies across firmwares — try the known spellings.
 */
export function listBatchFiles() {
  for (const path of ["", ".", "data://"]) {
    try {
      const entries = readdirSync({ path });
      const names = Array.isArray(entries) ? entries : (entries && entries[1]) || null;
      if (Array.isArray(names)) {
        return names.filter((n) => typeof n === "string" && n.indexOf(BATCH_PREFIX) === 0).sort();
      }
    } catch (e) {
      /* try the next spelling */
    }
  }
  return null;
}

export function readBatchFile(name) {
  try {
    const raw = readFileSync({ path: name });
    const text = typeof raw === "string" ? raw : arrayBufferToStr(raw);
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

export function removeBatchFile(name) {
  try {
    rmSync({ path: name });
  } catch (e) {
    /* already gone */
  }
}

/** Service heartbeat, polled by the page while open. */
export function writeStatus(status) {
  try {
    writeFileSync({ path: STATUS_FILE, data: JSON.stringify(status) });
  } catch (e) {
    /* status is best-effort */
  }
}

export function readStatus() {
  try {
    if (!statSync({ path: STATUS_FILE })) return null;
    const raw = readFileSync({ path: STATUS_FILE });
    const text = typeof raw === "string" ? raw : arrayBufferToStr(raw);
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function arrayBufferToStr(buf) {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}
