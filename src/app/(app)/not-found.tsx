import Link from "next/link";
import { SearchX } from "lucide-react";

/**
 * Rendered when a page inside the app shell calls notFound() — e.g. requireAdmin()
 * hiding /admin from non-admins, or a mesocycle/template key that doesn't exist.
 * The sidebar/bottom bar stay mounted, so this reads as a page state, not a crash.
 */
export default function AppNotFound() {
  return (
    <div className="card grid place-items-center px-6 py-16 text-center">
      <span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-panel-2 text-muted">
        <SearchX aria-hidden size={22} strokeWidth={1.75} />
      </span>
      <p className="text-lg font-semibold">Not found</p>
      <p className="mt-1 max-w-sm text-sm text-muted">
        That page doesn&apos;t exist — it may have been deleted, or the link is stale.
      </p>
      <Link href="/" className="btn-primary mt-6">
        Go to workout
      </Link>
    </div>
  );
}
