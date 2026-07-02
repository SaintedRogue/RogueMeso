"use client";

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from "react";
import { Bluetooth, Heart, X } from "lucide-react";
import {
  appendSample,
  parseHeartRateMeasurement,
  sanitizeBpm,
  zoneFor,
  HR_FLUSH_INTERVAL_MS,
  type HrSamplePoint,
} from "@/lib/heartRate";
import { logHrBatch } from "@/lib/hrActions";

// Live heart rate over Web Bluetooth (standard GATT Heart Rate service, 0x180D) — works
// with any broadcasting wearable: chest straps natively, Amazfit "Heart Rate Push",
// Whoop/Garmin broadcast modes. Chromium-only; the UI feature-detects and stays hidden
// elsewhere. Like the rest timer, an in-memory module store read through
// useSyncExternalStore is the single source of truth — but unlike it, nothing persists:
// a BLE connection can't survive a reload, so there's no localStorage to restore.

type HrStatus = "idle" | "connecting" | "connected";
type HrState = {
  status: HrStatus;
  bpm: number | null;
  deviceName: string | null;
  /** The session (MesoDay) currently on screen — samples are only captured while set. */
  dayId: number | null;
};

const IDLE: HrState = { status: "idle", bpm: null, deviceName: null, dayId: null };

let state: HrState = IDLE;
let buffer: HrSamplePoint[] = [];
let device: BluetoothDevice | null = null;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
const getSnapshot = () => state;
const getServerSnapshot = () => IDLE;
function patch(next: Partial<HrState>) {
  state = { ...state, ...next };
  emit();
}

function onMeasurement(ev: Event) {
  const value = (ev.target as BluetoothRemoteGATTCharacteristic).value;
  if (!value) return;
  const parsed = parseHeartRateMeasurement(value);
  const bpm = parsed ? sanitizeBpm(parsed.bpm) : null;
  if (bpm == null) return;
  if (state.dayId != null) buffer = appendSample(buffer, { at: Date.now(), bpm });
  patch({ bpm });
}

function onDisconnected() {
  device = null;
  patch({ status: "idle", bpm: null, deviceName: null });
}

/** Send buffered samples to the server; on failure put them back for the next attempt. */
async function flush() {
  const dayId = state.dayId;
  if (dayId == null || buffer.length === 0) return;
  const batch = buffer;
  buffer = [];
  try {
    await logHrBatch(dayId, batch);
  } catch {
    buffer = [...batch, ...buffer];
  }
}

// GATT handshakes on Android can hang silently (e.g. another receiver already holds the
// broadcast — Heart Rate Push allows only one). Cap the wait so the pill can never be
// stuck at "Connecting…" with no way out.
const CONNECT_TIMEOUT_MS = 15_000;
const withTimeout = <T,>(p: Promise<T>) =>
  Promise.race<T>([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), CONNECT_TIMEOUT_MS)),
  ]);

// Bumped on every connect/cancel so a stale in-flight handshake (cancelled by the user,
// or racing a newer attempt) can tell it lost and must not touch the store.
let connectSeq = 0;

async function connect() {
  const bluetooth = navigator.bluetooth;
  if (!bluetooth || state.status !== "idle") return;
  const seq = ++connectSeq;
  patch({ status: "connecting" });
  let picked: BluetoothDevice | null = null;
  try {
    // The chooser itself is user-paced (no timeout); only the handshake after it is capped.
    picked = await bluetooth.requestDevice({ filters: [{ services: ["heart_rate"] }] });
    const server = await withTimeout(picked.gatt ? picked.gatt.connect() : Promise.reject(new Error("no GATT")));
    const service = await withTimeout(server.getPrimaryService("heart_rate"));
    const characteristic = await withTimeout(service.getCharacteristic("heart_rate_measurement"));
    await withTimeout(characteristic.startNotifications());
    if (seq !== connectSeq) throw new Error("cancelled");
    characteristic.addEventListener("characteristicvaluechanged", onMeasurement);
    picked.addEventListener("gattserverdisconnected", onDisconnected);
    device = picked;
    patch({ status: "connected", deviceName: picked.name ?? "HR monitor" });
  } catch {
    // Cancelled chooser, timeout, cancelled attempt, or mid-handshake failure: release
    // whatever half-open link exists so the next attempt starts clean.
    try {
      picked?.gatt?.disconnect();
    } catch {
      /* already gone */
    }
    if (seq === connectSeq) patch({ status: "idle" });
  }
}

function disconnect() {
  connectSeq++; // invalidates any in-flight connect attempt
  void flush();
  try {
    device?.gatt?.disconnect();
  } catch {
    /* already gone */
  }
  onDisconnected();
}

function setDay(dayId: number | null) {
  if (state.dayId === dayId) return;
  // Leaving a session: whatever is buffered belongs to the old day — flush before switching.
  if (state.dayId != null) void flush();
  patch({ dayId });
}

type HeartRateContext = {
  state: HrState;
  maxHr: number;
  connect: () => void;
  disconnect: () => void;
};

const Ctx = createContext<HeartRateContext>({ state: IDLE, maxHr: 190, connect: () => {}, disconnect: () => {} });
export const useHeartRate = () => useContext(Ctx);

/** Rendered by DayView: marks its session as the live-capture target while on screen. */
export function HrSessionBinding({ dayId }: { dayId: number }) {
  useEffect(() => {
    setDay(dayId);
    return () => setDay(null);
  }, [dayId]);
  return null;
}

/** Zone accent per training zone — reuses the app's semantic tokens, never color alone. */
const ZONE_VARS: Record<number, string> = {
  0: "var(--color-muted)",
  1: "var(--color-muted)",
  2: "var(--color-good)",
  3: "var(--color-info)",
  4: "var(--color-warn)",
  5: "var(--color-bad)",
};

function HrPill() {
  const { state: hr, maxHr, connect: doConnect, disconnect: doDisconnect } = useHeartRate();
  // false on the server and during hydration, so SSR and first client paint agree; flips
  // true right after — the standard mounted gate, via the store to satisfy the lint rule.
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  if (!hydrated || typeof navigator === "undefined" || !navigator.bluetooth) return null;
  // Idle with no session on screen: nothing to offer — stay out of the way.
  if (hr.status === "idle" && hr.dayId == null) return null;

  const zone = hr.bpm != null ? zoneFor(hr.bpm, maxHr) : null;

  return (
    <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-4 z-[90] sm:bottom-20 sm:left-auto sm:right-6">
      {hr.status === "connected" ? (
        <div className="card flex items-center gap-2 px-3 py-2 shadow-lg">
          <Heart aria-hidden size={14} strokeWidth={2} className="text-accent motion-safe:animate-pulse" fill="currentColor" />
          <span className="num text-sm font-semibold tabular-nums" aria-label={`Heart rate ${hr.bpm ?? "unknown"} beats per minute`}>
            {hr.bpm ?? "—"}
          </span>
          <span className="text-xs text-muted">bpm</span>
          {zone != null && zone > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ color: ZONE_VARS[zone], background: `color-mix(in oklab, ${ZONE_VARS[zone]} 14%, transparent)` }}
              aria-label={`Training zone ${zone}`}
            >
              Z{zone}
            </span>
          )}
          <button type="button" onClick={doDisconnect} className="chip chip-nav" aria-label="Disconnect heart rate monitor">
            <X aria-hidden size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={hr.status === "connecting" ? doDisconnect : doConnect}
          className="card flex items-center gap-2 px-3 py-2 text-sm text-muted shadow-lg"
          aria-label={
            hr.status === "connecting"
              ? "Cancel connecting to heart rate monitor"
              : "Connect a Bluetooth heart rate monitor"
          }
        >
          <Bluetooth aria-hidden size={14} strokeWidth={2} />
          <Heart aria-hidden size={14} strokeWidth={2} />
          {hr.status === "connecting" ? "Connecting… tap to cancel" : "Connect HR"}
        </button>
      )}
    </div>
  );
}

export function HeartRateProvider({ maxHr, children }: { maxHr: number; children: React.ReactNode }) {
  const hr = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Flush cadence while capturing; also flush when the tab hides (pocketed phone) so a
  // dropped connection loses seconds, not the session.
  useEffect(() => {
    if (hr.status !== "connected" || hr.dayId == null) return;
    const id = setInterval(() => void flush(), HR_FLUSH_INTERVAL_MS);
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [hr.status, hr.dayId]);

  const doConnect = useCallback(() => void connect(), []);
  const doDisconnect = useCallback(() => disconnect(), []);

  return (
    <Ctx.Provider value={{ state: hr, maxHr, connect: doConnect, disconnect: doDisconnect }}>
      {children}
      <HrPill />
    </Ctx.Provider>
  );
}
