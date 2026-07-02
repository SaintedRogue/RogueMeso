"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useSyncExternalStore } from "react";
import { restDurationFor, restoreTimer, type RestTimerState } from "@/lib/restTimer";
import { RestTimerPill } from "@/components/RestTimerPill";

// Between-sets rest timer (docs/superpowers/specs/2026-07-01-rest-timer-design.md).
// localStorage IS the store — the provider reads it through useSyncExternalStore (which
// also makes SSR/hydration a non-issue: the server snapshot is simply "no timer") and
// writes go through the emitting setters below. The countdown therefore survives
// navigation and refresh, and even stays in sync across tabs via the storage event.

const STORAGE_KEY = "restTimer";
const MUTE_KEY = "restTimerMuted";

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function subscribeStorage(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb); // other tabs
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

// getSnapshot must return a stable reference, so re-parse only when the raw string changes.
let cachedRaw: string | null = null;
let cachedTimer: RestTimerState | null = null;
function getTimerSnapshot(): RestTimerState | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedTimer = restoreTimer(raw, Date.now());
  }
  return cachedTimer;
}
const getMutedSnapshot = () => localStorage.getItem(MUTE_KEY) === "1";

function writeTimer(next: RestTimerState | null) {
  if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  else localStorage.removeItem(STORAGE_KEY);
  emit();
}

type RestTimerContext = {
  timer: RestTimerState | null;
  muted: boolean;
  /** Start (or replace) the countdown after a logged set. */
  start: (exerciseType: string | null, exerciseName: string) => void;
  /** Move the end time by +/- seconds; ending at <= 0 clears quietly. */
  setTimer: (next: RestTimerState | null) => void;
  toggleMute: () => void;
  /** Rest is over: vibrate + chime (unless muted). Called once by the pill at 0. */
  alertDone: () => void;
};

const noop = () => {};
// Safe defaults so a stray useRestTimer() outside the provider (tests, isolation)
// renders inert instead of crashing.
const Ctx = createContext<RestTimerContext>({
  timer: null,
  muted: false,
  start: noop,
  setTimer: noop,
  toggleMute: noop,
  alertDone: noop,
});

export const useRestTimer = () => useContext(Ctx);

export function RestTimerProvider({ children }: { children: React.ReactNode }) {
  const timer = useSyncExternalStore(subscribeStorage, getTimerSnapshot, () => null);
  const muted = useSyncExternalStore(subscribeStorage, getMutedSnapshot, () => false);
  // Browsers only allow audio started from a user gesture; grab a context on the first
  // tap anywhere (there's always one before a set gets logged) and reuse it for chimes.
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const prime = () => {
      try {
        audioRef.current ??= new AudioContext();
        if (audioRef.current.state === "suspended") void audioRef.current.resume();
      } catch {
        // No Web Audio — vibration/visual alerts still work.
      }
    };
    document.addEventListener("pointerdown", prime, { passive: true });
    return () => document.removeEventListener("pointerdown", prime);
  }, []);

  const start = useCallback((exerciseType: string | null, exerciseName: string) => {
    writeTimer({ endsAt: Date.now() + restDurationFor(exerciseType) * 1000, exerciseName });
  }, []);

  const toggleMute = useCallback(() => {
    localStorage.setItem(MUTE_KEY, getMutedSnapshot() ? "0" : "1");
    emit();
  }, []);

  const alertDone = useCallback(() => {
    if (getMutedSnapshot()) return;
    try {
      navigator.vibrate?.([200, 100, 200]);
    } catch {
      /* unsupported */
    }
    const ctx = audioRef.current;
    if (!ctx || ctx.state !== "running") return;
    // Two short rising beeps — enough to register in a gym without being an alarm.
    for (const [freq, at] of [
      [880, 0],
      [1175, 0.18],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.16);
    }
  }, []);

  return (
    <Ctx.Provider value={{ timer, muted, start, setTimer: writeTimer, toggleMute, alertDone }}>
      {children}
      <RestTimerPill />
    </Ctx.Provider>
  );
}
