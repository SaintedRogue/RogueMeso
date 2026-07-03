"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { clearSessionHr } from "@/lib/hrActions";

/**
 * "Clear" on the session heart-rate card: wipes the session's captured HR (test runs,
 * a strap someone else wore, …) and — on an unfinished day — resets the session clock
 * so the next logged set starts it fresh. Confirmed before deleting; irreversible.
 */
export function ClearSessionHr({ dayId }: { dayId: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const clear = () => {
    if (!window.confirm("Delete this session's heart-rate data? This can't be undone.")) return;
    startTransition(async () => {
      await clearSessionHr(dayId);
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={clear}
      disabled={pending}
      className="chip chip-nav disabled:opacity-60"
      aria-label="Delete this session's heart-rate data"
    >
      <Trash2 aria-hidden size={13} />
      {pending ? "Clearing…" : "Clear"}
    </button>
  );
}
