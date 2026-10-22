import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { Market, WatchlistItem } from "../../api/types";
import { getStockDetail } from "../../api/client";
import { useWatchlistMutations } from "../../hooks/useWatchlist";
import { FlagIcon } from "../common/FlagIcon";

function formatNumber(value: number | null, digits = 2): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function WatchlistTable({ items }: { items: WatchlistItem[] }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const prefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { remove } = useWatchlistMutations();

  function handleMouseEnter(market: Market, symbol: string) {
    prefetchTimer.current = setTimeout(() => {
      queryClient.prefetchQuery({
        queryKey: ["stock-detail", market, symbol],
        queryFn: () => getStockDetail(market, symbol),
        staleTime: 2 * 60 * 1000,
      });
    }, 200);
  }

  function handleMouseLeave() {
    if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Your watchlist is empty. Star a stock from any table, or search for one, to add it here.
      </div>
    );
  }

  return (
    <>
      {/* Compact cards below sm. */}
      <div className="space-y-2 sm:hidden">
        {items.map((item) => {
          const pct = item.pct_change;
          const pctClass =
            pct === null
              ? "text-slate-400"
              : pct >= 0
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400";
          return (
            <button
              key={item.id}
              onClick={() => navigate(`/stock/${item.market}/${item.symbol}`)}
              className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left dark:border-slate-800"
            >
              <FlagIcon code={item.market} />
              <div className="min-w-0 flex-1">
                <div className="font-mono text-sm font-semibold text-cyan-600 dark:text-cyan-400">
                  {item.symbol}
                </div>
                <div className="truncate text-xs text-slate-500 dark:text-slate-400">{item.name ?? "—"}</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-sm tabular-nums">{formatNumber(item.close)}</div>
                <div className={`font-mono text-xs font-medium tabular-nums ${pctClass}`}>
                  {pct === null ? "—" : `${pct >= 0 ? "+" : ""}${formatNumber(pct)}%`}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 sm:block">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-slate-100 text-left text-xs font-mono uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          <tr>
            <th className="px-3 py-2">Market</th>
            <th className="px-3 py-2">Symbol</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2 text-right">Close</th>
            <th className="px-3 py-2 text-right">% Change</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((item) => {
            const pct = item.pct_change;
            const pctClass =
              pct === null
                ? "text-slate-400"
                : pct >= 0
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400";
            return (
              <tr
                key={item.id}
                onClick={() => navigate(`/stock/${item.market}/${item.symbol}`)}
                onMouseEnter={() => handleMouseEnter(item.market, item.symbol)}
                onMouseLeave={handleMouseLeave}
                className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/60"
              >
                <td className="px-3 py-2 text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <FlagIcon code={item.market} /> {item.market}
                  </span>
                </td>
                <td className="px-3 py-2 font-medium text-cyan-600 dark:text-cyan-400">{item.symbol}</td>
                <td className="max-w-[240px] truncate px-3 py-2 text-slate-500 dark:text-slate-400">
                  {item.name ?? "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{formatNumber(item.close)}</td>
                <td className={`px-3 py-2 text-right font-mono tabular-nums font-medium ${pctClass}`}>
                  {pct === null ? "—" : `${pct >= 0 ? "+" : ""}${formatNumber(pct)}%`}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      remove.mutate({ market: item.market, symbol: item.symbol });
                    }}
                    className="text-xs text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </>
  );
}
