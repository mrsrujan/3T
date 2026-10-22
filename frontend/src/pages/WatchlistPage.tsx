import { useWatchlist } from "../hooks/useWatchlist";
import { WatchlistTable } from "../components/watchlist/WatchlistTable";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { ErrorBanner } from "../components/common/ErrorBanner";
import { EmptyState } from "../components/common/EmptyState";

export function WatchlistPage() {
  const { data, isLoading, error } = useWatchlist("ALL");

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-100">My Watchlist</h2>
      {isLoading && <LoadingSpinner label="Loading watchlist…" />}
      {error && <ErrorBanner message="Failed to load watchlist." />}
      {data && !isLoading && data.items.length === 0 && (
        <EmptyState
          icon={<svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>}
          title="Your watchlist is empty"
          description="No stocks in your watchlist yet. Search above to add one."
        />
      )}
      {data && !isLoading && data.items.length > 0 && <WatchlistTable items={data.items} />}
    </div>
  );
}
