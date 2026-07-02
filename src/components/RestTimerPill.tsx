"use client";

import { useEffect, useRef, useState } from "react";
import { Timer, Volume2, VolumeX, X } from "lucide-react";
import { adjustEndsAt, fmtCountdown, remainingSeconds } from "@/lib/restTimer";
import { useRestTimer } from "@/components/RestTimerProvider";

/** How long the finished ("Rest over") pill lingers before dismissing itself. */
const DONE_LINGER_MS = 10_000;

/**
 * The floating countdown. Collapsed: exercise name + M:SS, fixed above the mobile
 * bottom bar (bottom-right on desktop), tap to expand. Expanded: +/-30s, skip, mute.
 * Ticks twice a second off the stored end timestamp — no drift, nothing to clean up
 * beyond the interval. Fires the done alert exactly once, then lingers briefly at 0.
 */
export function RestTimerPill() {
  const { timer, muted, setTimer, toggleMute, alertDone } = useRestTimer();
  const [now, setNow] = useState(() => Date.now());
  const [expanded, setExpanded] = useState(false);
  const alertedRef = useRef(false);

  useEffect(() => {
    if (!timer) return;
    alertedRef.current = false;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [timer]);

  const remaining = timer ? remainingSeconds(timer, now) : 0;
  const done = !!timer && remaining === 0;

  // Done-side effects live in an effect (not render): alert once, linger, dismiss.
  useEffect(() => {
    if (!done) return;
    if (!alertedRef.current) {
      alertedRef.current = true;
      alertDone();
    }
    const id = setTimeout(() => {
      setTimer(null);
      setExpanded(false);
    }, DONE_LINGER_MS);
    return () => clearTimeout(id);
  }, [done, alertDone, setTimer]);

  if (!timer) return null;

  const dismiss = () => {
    setTimer(null);
    setExpanded(false);
  };
  const adjust = (delta: number) => {
    const next = adjustEndsAt(timer, delta, Date.now());
    if (!next) return dismiss(); // shortened below zero — end quietly, same as skip
    setTimer(next);
  };

  return (
    <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] right-4 z-[90] sm:bottom-6 sm:right-6">
      <div
        className={`card flex items-center gap-2 px-3 py-2 shadow-lg ${
          done ? "border-accent text-accent motion-safe:animate-pulse" : ""
        }`}
      >
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-2"
          aria-label={done ? "Rest over" : `Rest timer, ${fmtCountdown(remaining)} remaining`}
        >
          <Timer aria-hidden size={16} strokeWidth={2} />
          <span className="max-w-32 truncate text-xs text-muted">{timer.exerciseName}</span>
          <span className="num text-sm font-semibold tabular-nums">
            {done ? "Rest over" : fmtCountdown(remaining)}
          </span>
        </button>
        {(expanded || done) && (
          <div className="flex items-center gap-1 border-l border-line pl-2">
            {!done && (
              <>
                <button type="button" onClick={() => adjust(-30)} className="chip chip-nav" aria-label="30 seconds less rest">
                  −30s
                </button>
                <button type="button" onClick={() => adjust(30)} className="chip chip-nav" aria-label="30 seconds more rest">
                  +30s
                </button>
              </>
            )}
            <button
              type="button"
              onClick={toggleMute}
              className="chip chip-nav"
              aria-label={muted ? "Unmute rest alerts" : "Mute rest alerts"}
            >
              {muted ? <VolumeX aria-hidden size={14} /> : <Volume2 aria-hidden size={14} />}
            </button>
            <button type="button" onClick={dismiss} className="chip chip-nav" aria-label="Dismiss rest timer">
              <X aria-hidden size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
