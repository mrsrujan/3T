import { useEffect, useRef, useState } from "react";
import type { StockDetailResponse } from "../../api/types";
import { useWatchlist, useWatchlistMutations } from "../../hooks/useWatchlist";
import { useLiveQuote } from "../../hooks/useLiveQuote";
import { FlagIcon } from "../common/FlagIcon";

function formatNumber(value: number | null, digits = 2): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

const CURRENCY_SYMBOL: Record<string, string> = { US: "$", IN: "₹" };

interface Props {
  detail: StockDetailResponse;
  onExport: () => void;
}

export function StockHeader({ detail, onExport }: Props) {
  const { data: liveQuote } = useLiveQuote(detail.market, detail.symbol);
  const isLive = Boolean(liveQuote?.is_market_open && liveQuote?.price !== null);

  const price = isLive ? liveQuote!.price : (detail.latest?.close ?? null);
  const pct = isLive ? liveQuote!.change_pct : (detail.latest?.pct_change ?? null);
  const isUp = pct !== null && pct >= 0;
  const currency = CURRENCY_SYMBOL[detail.market] ?? "";

  // Terminal-style tick flash: briefly tint the price when a live poll moves it.
  const prevPriceRef = useRef<number | null>(null);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    if (!isLive || price === null) return;
    const prev = prevPriceRef.current;
    prevPriceRef.current = price;
    if (prev === null || prev === price) return;
    setFlash(price > prev ? "up" : "down");
    const timer = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(timer);
  }, [price, isLive]);

  const flashClass =
    flash === "up"
      ? "bg-emerald-100 dark:bg-emerald-900/50"
      : flash === "down"
        ? "bg-red-100 dark:bg-red-900/50"
        : "";

  const { data: watchlist } = useWatchlist("ALL");
  const { add, remove } = useWatchlistMutations();
  const isWatched = watchlist?.items.some((i) => i.market === detail.market && i.symbol === detail.symbol) ?? false;

  function toggleFollow() {
    if (isWatched) {
      remove.mutate({ market: detail.market, symbol: detail.symbol });
    } else {
      add.mutate({ market: detail.market, symbol: detail.symbol });
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {detail.name ?? detail.symbol}
          </h2>
          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {detail.symbol} · <FlagIcon code={detail.market} /> {detail.market}
          </span>
        </div>

        {price !== null ? (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span
              className={`rounded px-1 font-mono text-2xl font-semibold tabular-nums text-slate-900 transition-colors duration-700 dark:text-slate-100 ${flashClass}`}
            >
              {currency}
              {formatNumber(price)}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs font-semibold tabular-nums ${
                pct === null
                  ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  : isUp
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                    : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
              }`}
            >
              {pct === null ? "—" : `${isUp ? "▲" : "▼"} ${formatNumber(Math.abs(pct))}%`}
            </span>
            {isLive && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                LIVE
              </span>
            )}
          </div>
        ) : (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">No price data yet.</p>
        )}
        {detail.latest && (
          <p className="mt-0.5 text-xs text-slate-400">
            {isLive ? "Live price, updates every 30s" : `${detail.latest.trade_date} · close price`}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onExport}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Export CSV
        </button>
        <button
          onClick={toggleFollow}
          disabled={add.isPending || remove.isPending}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
            isWatched
              ? "border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400"
              : "bg-cyan-600 text-white hover:bg-cyan-700"
          }`}
        >
          {isWatched ? "★ Following" : "☆ Follow"}
        </button>
      </div>
    </div>
  );
}
