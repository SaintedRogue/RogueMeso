"use client";

import { useTransition } from "react";
import { toggleReaction } from "@/lib/communityActions";
import type { FeedReaction } from "@/lib/features/community";

/**
 * The kudos row under a feed item. Always shows the curated emoji set with live counts;
 * the viewer's own reactions are highlighted. Server revalidation refreshes the counts
 * after each toggle, so we just gate input while the action is in flight.
 */
export function ReactionBar({
  activityId,
  reactions,
  canReact,
}: {
  activityId: number;
  reactions: FeedReaction[];
  canReact: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          disabled={!canReact || pending}
          aria-pressed={r.mine}
          aria-label={`React ${r.emoji}`}
          onClick={() => start(() => toggleReaction(activityId, r.emoji))}
          className={`chip-nav inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors disabled:opacity-50 ${
            r.mine ? "border-accent bg-panel-2 text-text" : "border-line text-muted hover:border-accent/50 hover:text-text"
          }`}
        >
          <span aria-hidden>{r.emoji}</span>
          {r.count > 0 && <span className="num text-xs">{r.count}</span>}
        </button>
      ))}
    </div>
  );
}
