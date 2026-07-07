// Shared batch store between the minute-logger App Service (writer) and the Device App
// page (drainer). One file per sealed batch — the service never rewrites a sealed file
// and the page deletes a file only after the SERVER ack, so there is no shared-file race
// and the watch filesystem is the single source of truth for unsynced data.

import { readFileSync, writeFileSync, readdirSync, rmSync, statSync } from "@zos/fs";

export const BATCH_PREFIX = "hrbatch_";

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

function arrayBufferToStr(buf) {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

/** Generic small-JSON-file read: null when missing/unparseable (never throws). */
export function readJsonFile(path) {
  try {
    if (!statSync({ path })) return null;
    const raw = readFileSync({ path });
    const text = typeof raw === "string" ? raw : arrayBufferToStr(raw);
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

/** Generic small-JSON-file write. Returns false on failure (never throws). */
export function writeJsonFile(path, value) {
  try {
    writeFileSync({ path, data: JSON.stringify(value) });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Seal an open (unsealed) tracking batch into a drainable hrbatch_ file so the page
 * drain can sync it. The minute logger only auto-seals every N samples; without this
 * flush, a short workout's samples (and every workout's final partial batch) would sit
 * in the open file forever, never syncing. Returns the number of samples sealed (0 if
 * the open file is empty/absent). Idempotent: clears the open file after sealing.
 */
export function sealOpenBatch(openFileName) {
  const open = readJsonFile(openFileName);
  if (!open || !Array.isArray(open.s) || open.s.length === 0 || !(open.t0 > 0)) return 0;
  const now = Date.now();
  const seq = now % 1_000_000; // same uniqueness scheme as the recorder/minute-logger
  writeBatchFile(seq, { seq, t0: open.t0, watchSealedAt: now, s: open.s });
  writeJsonFile(openFileName, { t0: 0, s: [] });
  return open.s.length;
}
