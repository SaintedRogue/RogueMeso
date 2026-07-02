"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Root error boundary: the backstop for throws outside the app shell (login, setup)
 * and in the (app) layout itself — e.g. the auth lookup failing because the database
 * is unreachable. Renders inside the bare root layout, so it centers itself.
 * Note: this Next version passes `unstable_retry`, not the older `reset` prop.
 */
export default function RootError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[root] error", error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="card grid max-w-md place-items-center px-6 py-16 text-center">
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-panel-2 text-bad">
          <AlertTriangle aria-hidden size={22} strokeWidth={1.75} />
        </span>
        <p className="text-lg font-semibold">Something went wrong</p>
        <p className="mt-1 text-sm text-muted">
          RogueMeso hit an unexpected error. If this keeps happening, check that the server and
          database are up.
        </p>
        <button onClick={() => unstable_retry()} className="btn-primary mt-6">
          Try again
        </button>
      </div>
    </main>
  );
}
