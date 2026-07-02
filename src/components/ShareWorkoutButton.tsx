"use client";

import { Loader2, Share2 } from "lucide-react";
import { useShareWorkout } from "@/components/useShareWorkout";

/** Standalone "Share workout" button (branded PNG → native share sheet / download). */
export function ShareWorkoutButton({
  mesoKey,
  week,
  position,
  className,
}: {
  mesoKey: string;
  week: number;
  position: number;
  className?: string;
}) {
  const { share, sharing } = useShareWorkout(mesoKey, week, position);
  return (
    <button
      type="button"
      onClick={() => share()}
      disabled={sharing}
      className={
        className ??
        "flex min-h-11 items-center justify-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-text disabled:opacity-50"
      }
    >
      {sharing ? <Loader2 aria-hidden size={16} className="animate-spin" /> : <Share2 aria-hidden size={16} />}
      Share workout
    </button>
  );
}
