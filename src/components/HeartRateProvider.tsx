"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Bluetooth, Heart, Watch, X } from "lucide-react";
import {
  appendSample,
  parseHeartRateMeasurement,
  pushEvent,
  reconnectDelayMs,
  sanitizeBpm,
  zoneFor,
  HR_FLUSH_INTERVAL_MS,
  type HrDiagEvent,
  type HrSamplePoint,
} from "@/lib/heartRate";
import { getLatestWatchHr, logHrBatch, logHrDiag } from "@/lib/hrActions";

// Live heart rate over Web Bluetooth (standard GATT Heart Rate service, 0x180D) — works
// with any broadcasting wearable: chest straps natively, Amazfit "Heart Rate Push",
// Whoop/Garmin broadcast modes. Chromium-only; the UI feature-detects and stays hidden
// elsewhere. Like the rest timer, an in-memory module store read through
// useSyncExternalStore is the single source of truth.
//
// Resilience (BLE on Android is moody):
//  - handshake steps are retried once, and each step is capped at 15s (no stuck pill);
//  - a drop triggers auto-reconnect with exponential backoff to the SAME device (no
//    chooser round-trip) — Heart Rate Push blips become a few seconds of gap;
//  - a screen wake lock is held while connected: Android suspending the screen is the
//    classic silent link-killer mid-workout;
//  - previously-granted devices (getDevices, where supported) reconnect with one tap.
// Every lifecycle event lands in a diagnostics log — visible from the pill's ⓘ and
// mirrored server-side (logHrDiag) so flaky sessions can be reconstructed remotely.

type HrStatus = "idle" | "connecting" | "connected" | "reconnecting";
type HrState = {
  status: HrStatus;
  bpm: number | null;
  deviceName: string | null;
  /** A previously-granted device we can offer to reconnect to without the chooser. */
  knownDeviceName: string | null;
  /** The session (MesoDay) currently on screen — samples are only captured while set. */
  dayId: number | null;
  /** Freshest server-synced reading (the on-watch recorder), shown when BLE isn't connected. */
  watchHr: { bpm: number; at: number } | null;
  /** Diagnostics ring buffer (also mirrored to the server). */
  events: HrDiagEvent[];
  showDiag: boolean;
};

const IDLE: HrState = {
  status: "idle",
  bpm: null,
  deviceName: null,
  knownDeviceName: null,
  dayId: null,
  watchHr: null,
  events: [],
  showDiag: false,
};

let state: HrState = IDLE;
let buffer: HrSamplePoint[] = [];
let device: BluetoothDevice | null = null;
let wakeLock: { release(): Promise<void> } | null = null;
let diagQueue: HrDiagEvent[] = [];
let diagTimer: ReturnType<typeof setTimeout> | null = null;

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

/** Record a lifecycle event: store (for the ⓘ panel), console, and a batched server mirror. */
function diag(step: string, detail?: string) {
  const event: HrDiagEvent = { at: Date.now(), step, ...(detail ? { detail } : {}) };
  patch({ events: pushEvent(state.events, event) });
  console.debug(`[hr] ${step}`, detail ?? "");
  diagQueue = pushEvent(diagQueue, event, 30);
  diagTimer ??= setTimeout(() => {
    const batch = diagQueue;
    diagQueue = [];
    diagTimer = null;
    logHrDiag(batch).catch(() => {});
  }, 5000);
}

const errText = (e: unknown) =>
  e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : String(e).slice(0, 200);

function onMeasurement(ev: Event) {
  const value = (ev.target as BluetoothRemoteGATTCharacteristic).value;
  if (!value) return;
  const parsed = parseHeartRateMeasurement(value);
  const bpm = parsed ? sanitizeBpm(parsed.bpm) : null;
  if (bpm == null) return;
  if (state.dayId != null) buffer = appendSample(buffer, { at: Date.now(), bpm });
  patch({ bpm });
}

/** Send buffered samples to the server; on failure put them back for the next attempt. */
async function flush() {
  const dayId = state.dayId;
  if (dayId == null || buffer.length === 0) return;
  const batch = buffer;
  buffer = [];
  try {
    await logHrBatch(dayId, batch);
  } catch (e) {
    buffer = [...batch, ...buffer];
    diag("flush failed — will retry", errText(e));
  }
}

// Screen wake lock: Android suspending the display is the top cause of mid-set drops.
async function acquireWakeLock() {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } };
    if (!nav.wakeLock || wakeLock) return;
    wakeLock = await nav.wakeLock.request("screen");
    diag("wake lock acquired");
  } catch (e) {
    diag("wake lock unavailable", errText(e));
  }
}
async function releaseWakeLock() {
  try {
    await wakeLock?.release();
  } catch {
    /* already released */
  }
  wakeLock = null;
}

// Bumped on every connect/cancel so a stale in-flight attempt can tell it lost.
let connectSeq = 0;

// GATT handshakes on Android can hang silently; cap each step so the pill can't stick.
const STEP_TIMEOUT_MS = 15_000;
const withTimeout = <T,>(p: Promise<T>) =>
  Promise.race<T>([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), STEP_TIMEOUT_MS)),
  ]);

/** Connect GATT + subscribe to HR notifications on `target`. Throws on any failure. */
async function subscribeHr(target: BluetoothDevice, seq: number) {
  if (!target.gatt) throw new Error("no GATT on device");
  diag("gatt connect…");
  const server = await withTimeout(target.gatt.connect());
  diag("service lookup…");
  const service = await withTimeout(server.getPrimaryService("heart_rate"));
  const characteristic = await withTimeout(service.getCharacteristic("heart_rate_measurement"));
  await withTimeout(characteristic.startNotifications());
  if (seq !== connectSeq) throw new Error("cancelled");
  characteristic.addEventListener("characteristicvaluechanged", onMeasurement);
  // Idempotent: a reconnect re-subscribes the same device; never stack duplicate listeners.
  target.removeEventListener("gattserverdisconnected", onDisconnected);
  target.addEventListener("gattserverdisconnected", onDisconnected);
  device = target;
  diag("notifications on", target.name ?? undefined);
}

/** Full connect for a chosen device, with one automatic retry (first attempts are flaky). */
async function establish(target: BluetoothDevice, seq: number) {
  for (let attempt = 0; ; attempt++) {
    try {
      await subscribeHr(target, seq);
      return;
    } catch (e) {
      if (seq !== connectSeq || attempt >= 1) throw e;
      diag("handshake failed — retrying once", errText(e));
      try {
        target.gatt?.disconnect();
      } catch {
        /* half-open */
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function connect(known?: BluetoothDevice) {
  const bluetooth = navigator.bluetooth;
  if (!bluetooth || (state.status !== "idle" && state.status !== "reconnecting")) return;
  const seq = ++connectSeq;
  patch({ status: "connecting" });
  let picked: BluetoothDevice | null = known ?? null;
  try {
    if (!picked) {
      diag("opening device chooser");
      picked = await bluetooth.requestDevice({ filters: [{ services: ["heart_rate"] }] });
      diag("device chosen", picked.name ?? "(unnamed)");
    } else {
      diag("reconnecting to remembered device", picked.name ?? undefined);
    }
    await establish(picked, seq);
    patch({ status: "connected", deviceName: picked.name ?? "HR monitor", knownDeviceName: null });
    void acquireWakeLock();
  } catch (e) {
    diag("connect failed", errText(e));
    try {
      picked?.gatt?.disconnect();
    } catch {
      /* already gone */
    }
    if (seq === connectSeq) patch({ status: "idle" });
  }
}

/** Unplanned drop: try to get back to the same device without bothering the user. */
function onDisconnected() {
  const dropped = device;
  device = null;
  if (!dropped || state.status !== "connected") {
    patch({ status: "idle", bpm: null, deviceName: null });
    return;
  }
  diag("link dropped — auto-reconnecting");
  const seq = ++connectSeq;
  patch({ status: "reconnecting", bpm: null });
  void (async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise((r) => setTimeout(r, reconnectDelayMs(attempt)));
      if (seq !== connectSeq) return;
      diag(`reconnect attempt ${attempt + 1}/5`);
      try {
        await establish(dropped, seq);
        patch({ status: "connected", deviceName: dropped.name ?? "HR monitor" });
        void acquireWakeLock();
        diag("reconnected");
        return;
      } catch (e) {
        diag("reconnect attempt failed", errText(e));
      }
    }
    if (seq === connectSeq) {
      diag("gave up reconnecting");
      void flush();
      void releaseWakeLock();
      patch({ status: "idle", deviceName: null });
    }
  })();
}

function disconnect() {
  connectSeq++; // invalidates any in-flight connect/reconnect attempt
  diag("disconnected by user");
  void flush();
  void releaseWakeLock();
  // Detach the drop listener and clear `device` BEFORE severing the link: the
  // gattserverdisconnected event can fire synchronously mid-call, and an intentional
  // disconnect must never spawn the auto-reconnect loop (field bug, 2026-07-02 diag).
  const dropped = device;
  device = null;
  if (dropped) {
    dropped.removeEventListener("gattserverdisconnected", onDisconnected);
    try {
      dropped.gatt?.disconnect();
    } catch {
      /* already gone */
    }
  }
  patch({ status: "idle", bpm: null, deviceName: null });
}

function setDay(dayId: number | null) {
  if (state.dayId === dayId) return;
  // Leaving a session: whatever is buffered belongs to the old day — flush before switching.
  if (state.dayId != null) void flush();
  patch({ dayId });
}

/** Where supported, surface a previously-granted device for one-tap reconnect. */
async function findKnownDevice(): Promise<BluetoothDevice | null> {
  try {
    const bt = navigator.bluetooth as Bluetooth & { getDevices?: () => Promise<BluetoothDevice[]> };
    const devices = (await bt.getDevices?.()) ?? [];
    return devices[0] ?? null;
  } catch {
    return null;
  }
}

type HeartRateContext = {
  state: HrState;
  maxHr: number;
  /** Profile opt-in for the live Bluetooth connection UI (watch-sync display is always on). */
  bleEnabled: boolean;
  connect: () => void;
  disconnect: () => void;
  toggleDiag: () => void;
};

const Ctx = createContext<HeartRateContext>({
  state: IDLE,
  maxHr: 190,
  bleEnabled: false,
  connect: () => {},
  disconnect: () => {},
  toggleDiag: () => {},
});
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

const fmtEventTime = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });

/** Hold this long anywhere on the pill to toggle the connection log. */
const LONG_PRESS_MS = 500;

/** A synced-from-watch reading counts as live-ish for this long. */
const WATCH_FRESH_MS = 90_000;

function HrPill() {
  const { state: hr, maxHr, bleEnabled, connect: doConnect, disconnect: doDisconnect, toggleDiag } = useHeartRate();
  // false on the server and during hydration, so SSR and first client paint agree.
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  // Render-pure clock for watch-sync freshness/age (Date.now() in render is banned by
  // the fork's lint) — same ticking pattern as RestTimerPill, coarse 5s grain.
  const [now, setNow] = useState(() => Date.now());
  const hasWatchHr = hr.watchHr != null;
  useEffect(() => {
    if (!hasWatchHr) return;
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, [hasWatchHr]);
  // Long-press (anywhere on the pill) opens the diagnostics log — a debug surface earns
  // zero pixels of chrome. The fired flag swallows the click that follows a completed
  // press so holding the pill never *also* triggers connect/disconnect.
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressFired = useRef(false);
  const pressStart = useCallback(() => {
    pressFired.current = false;
    pressTimer.current ??= setTimeout(() => {
      pressTimer.current = null;
      pressFired.current = true;
      try {
        navigator.vibrate?.(10);
      } catch {
        /* unsupported */
      }
      toggleDiag();
    }, LONG_PRESS_MS);
  }, [toggleDiag]);
  const pressEnd = useCallback(() => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }, []);
  const swallowClickAfterPress = useCallback((e: React.MouseEvent) => {
    if (pressFired.current) {
      e.preventDefault();
      e.stopPropagation();
      pressFired.current = false;
    }
  }, []);

  if (!hydrated) return null;
  const bleCapable = bleEnabled && typeof navigator !== "undefined" && !!navigator.bluetooth;
  const watchFresh = hr.watchHr != null && now - hr.watchHr.at < WATCH_FRESH_MS;
  // The pill earns its pixels when there's something to show or something to offer:
  // a BLE connection (live/possible) on an open session, or fresh watch-synced HR —
  // the latter works on ANY browser, no Bluetooth involved.
  if (!bleCapable && !watchFresh) return null;
  if (hr.status === "idle" && hr.dayId == null && !watchFresh) return null;

  const zone = hr.bpm != null ? zoneFor(hr.bpm, maxHr) : null;
  const watchZone = watchFresh && hr.watchHr ? zoneFor(hr.watchHr.bpm, maxHr) : null;
  const busy = hr.status === "connecting" || hr.status === "reconnecting";
  const pressHandlers = {
    onPointerDown: pressStart,
    onPointerUp: pressEnd,
    onPointerLeave: pressEnd,
    onPointerCancel: pressEnd,
    onClickCapture: swallowClickAfterPress,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };

  return (
    <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] left-4 z-[90] sm:bottom-20 sm:left-auto sm:right-6">
      {hr.showDiag && (
        <div className="card mb-2 max-h-48 w-72 overflow-y-auto p-3 text-xs shadow-lg">
          <div className="mb-1 font-semibold">HR connection log</div>
          <p className="mb-2 border-b border-line pb-2 text-muted">
            Watch missing from the chooser? Its broadcast hides while the Zepp app holds the
            link — toggle phone Bluetooth off/on, connect here first, and Zepp will re-attach
            alongside afterwards. Long-press the pill to close this log.
          </p>
          {hr.events.length === 0 && <div className="text-muted">No events yet.</div>}
          {[...hr.events].reverse().map((e, i) => (
            <div key={`${e.at}-${i}`} className="border-t border-line py-1 first:border-t-0">
              <span className="num mr-2 tabular-nums text-muted">{fmtEventTime(e.at)}</span>
              {e.step}
              {e.detail && <div className="truncate text-muted">{e.detail}</div>}
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        {hr.status === "connected" ? (
          <div className="card flex select-none items-center gap-2 px-3 py-2 shadow-lg" {...pressHandlers}>
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
        ) : watchFresh && hr.watchHr && !busy ? (
          // Live-ish via the on-watch recorder: no Bluetooth in the loop at all. Tapping
          // the Bluetooth chip upgrades to a direct BLE connection when available.
          <div className="card flex select-none items-center gap-2 px-3 py-2 shadow-lg" {...pressHandlers}>
            <Watch aria-hidden size={14} strokeWidth={2} className="text-accent" />
            <span className="num text-sm font-semibold tabular-nums" aria-label={`Heart rate ${hr.watchHr.bpm} beats per minute, synced from watch`}>
              {hr.watchHr.bpm}
            </span>
            <span className="text-xs text-muted">bpm · {Math.max(1, Math.round((now - hr.watchHr.at) / 1000))}s</span>
            {watchZone != null && watchZone > 0 && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{ color: ZONE_VARS[watchZone], background: `color-mix(in oklab, ${ZONE_VARS[watchZone]} 14%, transparent)` }}
                aria-label={`Training zone ${watchZone}`}
              >
                Z{watchZone}
              </span>
            )}
            {bleCapable && hr.dayId != null && (
              <button type="button" onClick={doConnect} className="chip chip-nav" aria-label="Connect directly over Bluetooth">
                <Bluetooth aria-hidden size={14} />
              </button>
            )}
          </div>
        ) : (
          <div className="card flex select-none items-center gap-2 px-3 py-2 text-sm text-muted shadow-lg" {...pressHandlers}>
            <button
              type="button"
              onClick={busy ? doDisconnect : doConnect}
              className="flex items-center gap-2"
              aria-label={
                busy ? "Cancel connecting to heart rate monitor" : "Connect a Bluetooth heart rate monitor"
              }
            >
              <Bluetooth aria-hidden size={14} strokeWidth={2} />
              <Heart aria-hidden size={14} strokeWidth={2} />
              {hr.status === "reconnecting"
                ? "Reconnecting… tap to stop"
                : hr.status === "connecting"
                  ? "Connecting… tap to cancel"
                  : hr.knownDeviceName
                    ? `Reconnect ${hr.knownDeviceName}`
                    : "Connect HR"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function HeartRateProvider({
  maxHr,
  bleEnabled,
  children,
}: {
  maxHr: number;
  bleEnabled: boolean;
  children: React.ReactNode;
}) {
  const hr = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Offer one-tap reconnect to a previously-granted device (Chromium getDevices).
  useEffect(() => {
    if (!bleEnabled || hr.status !== "idle" || hr.dayId == null || hr.knownDeviceName) return;
    let stale = false;
    void findKnownDevice().then((d) => {
      if (!stale && d?.name && state.status === "idle") patch({ knownDeviceName: d.name });
    });
    return () => {
      stale = true;
    };
  }, [bleEnabled, hr.status, hr.dayId, hr.knownDeviceName]);

  // While a session is on screen and no BLE device is connected, poll for the freshest
  // watch-synced reading — recorder batches land ~every 30s, so this is "live-ish" HR
  // with zero pairing. Stops itself whenever a real BLE connection takes over.
  useEffect(() => {
    if (hr.status !== "idle" || hr.dayId == null) return;
    let stale = false;
    const poll = () => {
      getLatestWatchHr()
        .then((latest) => {
          if (!stale) patch({ watchHr: latest });
        })
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 30_000);
    return () => {
      stale = true;
      clearInterval(id);
    };
  }, [hr.status, hr.dayId]);

  // Flush cadence while capturing; on tab-hide flush AND re-acquire the wake lock when
  // the tab returns (the OS silently releases wake locks on visibility change).
  useEffect(() => {
    if (hr.status !== "connected") return;
    const id = setInterval(() => void flush(), HR_FLUSH_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void flush();
      else void acquireWakeLock();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [hr.status]);

  const doConnect = useCallback(() => {
    // Prefer the remembered device when we have one; fall back to the chooser.
    void (async () => {
      const known = state.knownDeviceName ? await findKnownDevice() : null;
      void connect(known ?? undefined);
    })();
  }, []);
  const doDisconnect = useCallback(() => disconnect(), []);
  const toggleDiag = useCallback(() => patch({ showDiag: !state.showDiag }), []);

  return (
    <Ctx.Provider value={{ state: hr, maxHr, bleEnabled, connect: doConnect, disconnect: doDisconnect, toggleDiag }}>
      {children}
      <HrPill />
    </Ctx.Provider>
  );
}
