"use client";

import { useTransition } from "react";
import { Check, Loader2, Share2 } from "lucide-react";
import { setTemplateShared } from "@/lib/communityActions";

/** Per-template share switch shown on the owner's own templates (only when they've joined
 *  the community). Toggling flips Template.sharedWithInstance. */
export function ShareTemplateToggle({ templateKey, shared }: { templateKey: string; shared: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => setTemplateShared(templateKey, !shared))}
      disabled={pending}
      aria-pressed={shared}
      className={`chip chip-nav inline-flex items-center gap-1.5 disabled:opacity-50 ${
        shared ? "border-accent text-accent" : "text-muted hover:border-accent/50 hover:text-text"
      }`}
    >
      {pending ? (
        <Loader2 aria-hidden size={13} className="animate-spin" />
      ) : shared ? (
        <Check aria-hidden size={13} />
      ) : (
        <Share2 aria-hidden size={13} />
      )}
      {shared ? "Shared" : "Share"}
    </button>
  );
}
