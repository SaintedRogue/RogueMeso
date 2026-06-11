"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toggleCommunityOptIn } from "@/lib/communityActions";

/** Join / leave the instance community. Opting out instantly hides you from the feed and
 *  leaderboard (no data is deleted) and re-opting in brings your history back. */
export function ParticipationToggle({ optedIn }: { optedIn: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => toggleCommunityOptIn())}
      disabled={pending}
      className={
        optedIn
          ? "chip chip-nav text-muted hover:border-bad hover:text-bad disabled:opacity-50"
          : "btn-primary inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2 text-sm disabled:opacity-60 sm:min-h-0"
      }
    >
      {pending && <Loader2 aria-hidden size={14} className="animate-spin" />}
      {optedIn ? "Leave community" : "Join the community"}
    </button>
  );
}
