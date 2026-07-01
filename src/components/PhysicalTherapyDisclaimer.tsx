"use client";

import { useEffect, useState } from "react";
import { Info, X } from "lucide-react";

const KEY = "pt-lens-disclaimer-dismissed";

/** Dismissible "informational only" notice for the Physical Therapy Lens area. Dismissal is
 *  remembered in localStorage so it doesn't nag, but the data is never medical advice. */
export function PhysicalTherapyDisclaimer() {
  const [dismissed, setDismissed] = useState(true); // assume dismissed until we read storage (no flash)

  useEffect(() => {
    setDismissed(localStorage.getItem(KEY) === "1");
  }, []);

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
          localStorage.setItem(KEY, "1");
          setDismissed(true);
        }}
        aria-label="Dismiss disclaimer"
        className="ml-auto shrink-0 text-muted hover:text-text"
      >
        <X aria-hidden size={16} />
      </button>
    </div>
  );
}
