"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

/**
 * Segment error boundary for everything inside the app shell. A throw during page
 * render (Prisma failure, ownership "Forbidden", …) lands here instead of Next's
 * unstyled default screen, and the sidebar/bottom bar stay mounted and usable.
 * Note: this Next version passes `unstable_retry`, not the older `reset` prop.
 */
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[app] page error", error);
  }, [error]);

  return (
    <div className="card grid place-items-center px-6 py-16 text-center">
      <span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-panel-2 text-bad">
        <AlertTriangle aria-hidden size={22} strokeWidth={1.75} />
      </span>
      <p className="text-lg font-semibold">Something went wrong</p>
      <p className="mt-1 max-w-sm text-sm text-muted">
        That page hit an unexpected error. Your logged data is safe — try again, or head back to
        today&apos;s workout.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <button onClick={() => unstable_retry()} className="btn-primary">
          Try again
        </button>
        <Link href="/" className="chip chip-nav">
          Go to workout
        </Link>
      </div>
    </div>
  );
}
