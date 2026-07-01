"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { togglePhysicalTherapyLens } from "@/lib/settingsActions";

/** Opt in/out of the Physical Therapy Lens. OFF (default) keeps the set-logger and Insights
 *  byte-for-byte the standard experience; ON reveals the movement-quality / symptom capture and
 *  unlocks the Physical Therapy Lens Insights views. Purely additive — never medical advice. */
export function PhysicalTherapyLensToggle({ enabled }: { enabled: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label="Physical Therapy Lens"
      onClick={() => start(() => togglePhysicalTherapyLens())}
      disabled={pending}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50 ${
        enabled ? "border-accent bg-accent/30" : "border-line bg-input"
      }`}
    >
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-panel shadow transition-transform ${
          enabled ? "translate-x-6" : "translate-x-1"
        }`}
      >
        {pending && <Loader2 aria-hidden size={12} className="animate-spin text-muted" />}
      </span>
    </button>
  );
}
