import Link from "next/link";
import { SearchX } from "lucide-react";

/**
 * Root 404 for URLs that match no route at all (and notFound() outside the app
 * shell). Renders inside the bare root layout — no sidebar — so it centers itself.
 */
export default function RootNotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="card grid max-w-md place-items-center px-6 py-16 text-center">
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-panel-2 text-muted">
          <SearchX aria-hidden size={22} strokeWidth={1.75} />
        </span>
        <p className="text-lg font-semibold">Page not found</p>
        <p className="mt-1 text-sm text-muted">There&apos;s nothing at this address.</p>
        <Link href="/" className="btn-primary mt-6">
          Go to RogueMeso
        </Link>
      </div>
    </main>
  );
}
