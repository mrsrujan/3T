import { Link } from "react-router-dom";
import { useEarnings } from "../../hooks/useEarnings";
import { useWatchlist } from "../../hooks/useWatchlist";
import type { Market } from "../../api/types";

export function EarningsCalendarWidget({ market }: { market: Market }) {
  const { data: watchlist } = useWatchlist(market);
  const symbols = watchlist?.items.map((i) => i.symbol) ?? [];
  const { data: earnings, isLoading } = useEarnings(market, symbols);

  const upcoming = (earnings?.items ?? [])
    .filter((e) => {
      const days = Math.ceil((new Date(e.earnings_date).getTime() - Date.now()) / 86400000);
      return days >= 0 && days <= 30;
    })
    .slice(0, 10);

  if (isLoading) return null;
  if (symbols.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h3 className="mb-3 text-sm font-semibold font-sans uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Upcoming Earnings
      </h3>
      {upcoming.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">No earnings in your watchlist in the next 30 days.</p>
      ) : (
        <ul className="space-y-2">
          {upcoming.map((e) => (
            <li key={e.symbol} className="flex items-center justify-between">
              <Link to={`/stock/${market}/${e.symbol}`}
                className="font-mono text-sm font-medium text-cyan-600 hover:underline dark:text-cyan-400">
                {e.symbol}
              </Link>
              <span className="font-mono text-xs text-slate-500">{e.earnings_date}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
