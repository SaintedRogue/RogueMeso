/**
 * Instant loading state for every page inside the app shell: a neutral skeleton in
 * the same rhythm as the real pages (PageHeader block, then stacked cards) so
 * navigation paints immediately while the server component streams in.
 */
export default function AppLoading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="mb-6">
        <div className="h-7 w-48 rounded-md bg-panel-2" />
        <div className="mt-2 h-4 w-72 rounded-md bg-panel-2/70" />
      </div>
      <div className="space-y-4">
        <div className="card h-40" />
        <div className="card h-40" />
        <div className="card h-24" />
      </div>
    </div>
  );
}
