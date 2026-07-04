// Snapshot store for the wellness collector. Same durability contract as
// recorderStore: one file per sealed snapshot, the page deletes a file only after the
// server ack, so the watch filesystem is the single source of truth for unsynced data.
// Inside each file the format is NDJSON — one domain record per line — so the collector
// can append domains one at a time and never hold the whole snapshot in memory.

import {
  openSync,
  writeSync,
  closeSync,
  readFileSync,
  readdirSync,
  rmSync,
  O_WRONLY,
  O_APPEND,
  O_CREAT,
} from "@zos/fs";

export const WELLNESS_PREFIX = "wellness_";
// Rolling buffer: newest snapshots win. At one snapshot per app-open this spans days;
// the count cap (not an age cap) is what bounds worst-case flash usage.
const MAX_SNAPSHOT_FILES = 8;

function snapshotPath(seq) {
  return `${WELLNESS_PREFIX}${String(seq).padStart(10, "0")}.ndjson`;
}

function strToArrayBuffer(str) {
  // Records are JSON of ASCII keys + numbers; charCode-per-byte matches how
  // recorderStore reads files back (arrayBufferToStr) on every firmware seen so far.
  const buf = new ArrayBuffer(str.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xff;
  return buf;
}

/**
 * Open an append-mode NDJSON writer for a new snapshot. `seq` is epoch seconds so the
 * filenames sort chronologically. Returns null when the fs refuses (collection should
 * then fall back to send-without-buffering rather than crash).
 */
export function createSnapshotWriter(seq) {
  const path = snapshotPath(seq);
  let fd;
  try {
    fd = openSync({ path, flag: O_WRONLY | O_APPEND | O_CREAT });
  } catch (e) {
    return null;
  }
  if (fd == null || fd < 0) return null;
  return {
    path,
    /** Append one domain record as a single NDJSON line. Returns false on write failure. */
    writeRecord(record) {
      try {
        writeSync({ fd, buffer: strToArrayBuffer(`${JSON.stringify(record)}\n`) });
        return true;
      } catch (e) {
        return false;
      }
    },
    close() {
      try {
        closeSync({ fd });
      } catch (e) {
        /* nothing to salvage */
      }
    },
  };
}

/**
 * List pending snapshot files oldest-first, or null when the directory listing itself
 * fails (distinct from "none pending" — same contract as recorderStore.listBatchFiles,
 * and the same firmware-dependent path spellings).
 */
export function listWellnessFiles() {
  for (const path of ["", ".", "data://"]) {
    try {
      const entries = readdirSync({ path });
      const names = Array.isArray(entries) ? entries : (entries && entries[1]) || null;
      if (Array.isArray(names)) {
        return names.filter((n) => typeof n === "string" && n.indexOf(WELLNESS_PREFIX) === 0).sort();
      }
    } catch (e) {
      /* try the next spelling */
    }
  }
  return null;
}

/** Parse a snapshot file back into its domain records. Unparseable lines are dropped. */
export function readWellnessRecords(name) {
  let text;
  try {
    const raw = readFileSync({ path: name });
    text = typeof raw === "string" ? raw : arrayBufferToStr(raw);
  } catch (e) {
    return null;
  }
  const records = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    try {
      const rec = JSON.parse(line);
      if (rec && typeof rec === "object" && typeof rec.domain === "string") records.push(rec);
    } catch (e) {
      /* torn write (power loss mid-line) — keep the intact records */
    }
  }
  return records;
}

export function removeWellnessFile(name) {
  try {
    rmSync({ path: name });
  } catch (e) {
    /* already gone */
  }
}

/** Enforce the rolling cap after sealing a new snapshot: drop oldest beyond the cap. */
export function pruneWellnessFiles() {
  const files = listWellnessFiles();
  if (!files) return;
  for (let i = 0; i < files.length - MAX_SNAPSHOT_FILES; i++) removeWellnessFile(files[i]);
}

function arrayBufferToStr(buf) {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}
