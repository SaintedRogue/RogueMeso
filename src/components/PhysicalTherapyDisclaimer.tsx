"use client";

import { useSyncExternalStore } from "react";
import { Info, X } from "lucide-react";

const KEY = "pt-lens-disclaimer-dismissed";
const EVENT = "pt-disclaimer-change";

// Read the dismissed flag from localStorage as an external store (same approach as ThemeToggle):
// returns the server snapshot (false → shown) during hydration, then reconciles to the real
// client value — the React-blessed way to read a client-only value with no setState-in-effect.
function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}
function getSnapshot() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Dismissible "informational only" notice for the Physical Therapy Lens area. Dismissal is
 *  remembered in localStorage so it doesn't nag, but the data is never medical advice. */
export function PhysicalTherapyDisclaimer() {
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, () => false);
  if (dismissed) return null;

  return (
    <div className="mb-6 flex items-start gap-3 rounded-lg border border-line bg-panel/60 p-4 text-sm">
      <Info aria-hidden size={18} className="mt-0.5 shrink-0 text-info" />
      <p className="text-muted">
        These views are <span className="text-text">informational only — not medical advice or a diagnosis</span>. Load
        and symptom heuristics are guides, not verdicts. Persistent or worsening pain warrants evaluation by a licensed
        clinician.
      </p>
      <button
        type="button"
        onClick={() => {
          try {
            localStorage.setItem(KEY, "1");
          } catch {
            /* storage unavailable (private mode) — dismiss for this render only */
          }
          window.dispatchEvent(new Event(EVENT));
        }}
        aria-label="Dismiss disclaimer"
        className="ml-auto shrink-0 text-muted hover:text-text"
      >
        <X aria-hidden size={16} />
      </button>
    </div>
  );
}
