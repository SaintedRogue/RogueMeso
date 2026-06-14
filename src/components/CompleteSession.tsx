"use client";

import { useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { completeDay } from "@/lib/actions";

/**
 * Footer action that explicitly finishes a workout day. Completion was previously only
 * implicit (a day rolled to "complete" once every set was logged/skipped). If any sets
 * are still open, we confirm and then skip them so the day is unambiguously done and the
 * roll-up can't later demote it back to "partial".
 */
export function CompleteSession({
  mesoKey,
  week,
  position,
  openSets,
  done,
}: {
  mesoKey: string;
  week: number;
  position: number;
  openSets: number;
  done: boolean;
}) {
  const [pending, start] = useTransition();

  if (done) {
    return (
      <div className="flex items-center justify-center gap-2 py-3 text-sm font-medium text-good">
        <CheckCircle2 aria-hidden size={16} /> Session complete
      </div>
    );
  }

  const onClick = () => {
    const proceed =
      openSets === 0 ||
      confirm(
        `Finish this session? ${openSets} unlogged set${openSets === 1 ? "" : "s"} will be skipped.`,
      );
    if (proceed) start(() => completeDay(mesoKey, week, position));
  };

  return (
    <button
      onClick={onClick}
      disabled={pending}
      className="btn-primary flex min-h-12 w-full items-center justify-center gap-2 disabled:opacity-60"
    >
      <CheckCircle2 aria-hidden size={18} />
      {pending ? "Finishing…" : "Complete session"}
    </button>
  );
}
