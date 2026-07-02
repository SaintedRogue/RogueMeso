"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { restDurationFor, restoreTimer, type RestTimerState } from "@/lib/restTimer";
import { RestTimerPill } from "@/components/RestTimerPill";

// Between-sets rest timer (docs/superpowers/specs/2026-07-01-rest-timer-design.md).
// The provider owns the running timer + mute preference and mirrors both to localStorage,
// so the countdown survives navigation and refresh. All ticking/alerting lives in the
// pill; this file is state + the browser-API plumbing (storage, vibrate, chime).

const STORAGE_KEY = "restTimer";
const MUTE_KEY = "restTimerMuted";

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
// Safe defaults so a stray useRestTimer() outside the provider (tests, storybook-style
// isolation) renders inert instead of crashing.
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
  const [timer, setTimerState] = useState<RestTimerState | null>(null);
  const [muted, setMuted] = useState(false);
  // Browsers only allow audio started from a user gesture; grab a context on the first
  // tap anywhere (there's always one before a set gets logged) and reuse it for chimes.
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    setTimerState(restoreTimer(localStorage.getItem(STORAGE_KEY), Date.now()));
    setMuted(localStorage.getItem(MUTE_KEY) === "1");
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

  const setTimer = useCallback((next: RestTimerState | null) => {
    setTimerState(next);
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  const start = useCallback(
    (exerciseType: string | null, exerciseName: string) => {
      setTimer({ endsAt: Date.now() + restDurationFor(exerciseType) * 1000, exerciseName });
    },
    [setTimer],
  );

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      localStorage.setItem(MUTE_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  const alertDone = useCallback(() => {
    if (muted) return;
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
  }, [muted]);

  return (
    <Ctx.Provider value={{ timer, muted, start, setTimer, toggleMute, alertDone }}>
      {children}
      <RestTimerPill />
    </Ctx.Provider>
  );
}
