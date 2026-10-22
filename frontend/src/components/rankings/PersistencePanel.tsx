import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePersistence } from "../../hooks/usePersistence";
import { WatchlistStarButton } from "../common/WatchlistStarButton";
import type { Market, Category } from "../../api/types";

interface Props {
  market: Market;
  category: Category;
  topN: number;
}

// Heat bar: filled dots for days present, empty dots for days absent
function HeatDots({ present, total }: { present: number; total: number }) {
  const pct = present / total;
  const color =
    pct >= 1 ? "bg-emerald-500" : pct >= 0.6 ? "bg-green-400" : pct >= 0.4 ? "bg-amber-400" : "bg-orange-400";

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`inline-block h-2 w-2 rounded-full ${i < present ? color : "bg-slate-200 dark:bg-slate-700"}`}
        />
      ))}
      <span className="ml-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
        {present}/{total}d
      </span>
    </div>
  );
}

function pctCls(v: number | null) {
  if (v === null) return "text-slate-400";
  return v >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400";
}

function fmt(v: number | null, digits = 2) {
  if (v === null) return "—";
  return v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function PersistencePanel({ market, category, topN }: Props) {
  const navigate = useNavigate();
  const [lookback, setLookback] = useState(5);
  const [minDays, setMinDays] = useState(3);

  const { data, isLoading } = usePersistence({
    market,
    category,
    topN,
    mode: "last_n",
    n: lookback,
    minDays,
  });

  const items = useMemo(
    () => (data?.items ?? []).filter((i) => i.days_present >= minDays),
    [data, minDays],
  );

  const categoryLabel =
    category === "gainers" ? "Gainers" :
    category === "losers" ? "Losers" :
    category === "most_active" ? "Most Active" : "Trending";

  return (
    <div className="mt-8">
      {/* Header + controls */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Repeat Appearances
          </h3>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            Top {topN} {categoryLabel}
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          {/* Lookback */}
          <span>Last</span>
          <div className="flex gap-1">
            {[3, 5, 7, 10, 15].map((n) => (
              <button
                key={n}
                onClick={() => {
                  setLookback(n);
                  if (minDays > n) setMinDays(n);
                }}
                className={`rounded-full px-2.5 py-0.5 font-medium transition-colors ${
                  lookback === n
                    ? "bg-cyan-600 text-white"
                    : "border border-slate-200 text-slate-600 hover:border-cyan-300 dark:border-slate-700 dark:text-slate-400"
                }`}
              >
                {n}d
              </button>
            ))}
          </div>

          {/* Min days */}
          <span>appeared ≥</span>
          <div className="flex gap-1">
            {Array.from({ length: Math.min(lookback, 5) }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => setMinDays(n)}
                className={`rounded-full px-2.5 py-0.5 font-medium transition-colors ${
                  minDays === n
                    ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900"
                    : "border border-slate-200 text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-400"
                }`}
              >
                {n}d
              </button>
            ))}
          </div>
          <span>days</span>
        </div>
      </div>

      {/* Body */}
      {isLoading && (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      )}

      {!isLoading && items.length === 0 && data && (
        <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-400 dark:border-slate-700 dark:text-slate-500">
          No stocks appeared in the top {topN} {categoryLabel.toLowerCase()} for ≥{minDays} of the last {lookback} trading days.
          {minDays > 1 && (
            <button
              onClick={() => setMinDays(minDays - 1)}
              className="mt-1 block w-full text-xs text-cyan-600 hover:underline dark:text-cyan-400"
            >
              Lower minimum to {minDays - 1} day{minDays - 1 !== 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <>
          {data?.dropped_dates && data.dropped_dates.length > 0 && (
            <p className="mb-2 text-[11px] text-slate-400 dark:text-slate-500">
              {data.dropped_dates.length} date(s) skipped (no data) · using {data.dates_used.length} trading days
            </p>
          )}

          {/* Mobile cards */}
          <div className="space-y-2 sm:hidden">
            {items.map((item) => (
              <button
                key={item.symbol}
                onClick={() => navigate(`/stock/${market}/${item.symbol}`)}
                className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left dark:border-slate-800"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-sm font-semibold text-cyan-600 dark:text-cyan-400">
                      {item.symbol}
                    </span>
                    <span className="truncate text-xs text-slate-500">{item.name}</span>
                  </div>
                  <HeatDots present={item.days_present} total={data!.dates_used.length} />
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm">{fmt(item.current_price)}</div>
                  <div className={`font-mono text-xs font-medium ${pctCls(item.change_pct)}`}>
                    {item.change_pct !== null ? `${item.change_pct >= 0 ? "+" : ""}${fmt(item.change_pct)}%` : "—"}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                  <th className="px-4 py-2.5">#</th>
                  <th className="px-4 py-2.5"></th>
                  <th className="px-4 py-2.5">Symbol</th>
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Sector</th>
                  <th className="px-4 py-2.5">Appeared</th>
                  <th className="px-4 py-2.5 text-right">Avg Rank</th>
                  <th className="px-4 py-2.5 text-right">Price</th>
                  <th className="px-4 py-2.5 text-right">Change %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((item, idx) => (
                  <tr
                    key={item.symbol}
                    onClick={() => navigate(`/stock/${market}/${item.symbol}`)}
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-4 py-2.5 text-slate-400">{idx + 1}</td>
                    <td className="px-4 py-2.5">
                      <WatchlistStarButton market={market} symbol={item.symbol} />
                    </td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-cyan-600 dark:text-cyan-400">
                      {item.symbol}
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-2.5 text-slate-600 dark:text-slate-400">
                      {item.name ?? "—"}
                    </td>
                    <td className="max-w-[160px] truncate px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                      {item.sector ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <HeatDots present={item.days_present} total={data!.dates_used.length} />
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-600 dark:text-slate-400">
                      #{fmt(item.avg_rank, 1)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                      {fmt(item.current_price)}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono tabular-nums font-medium ${pctCls(item.change_pct)}`}>
                      {item.change_pct !== null
                        ? `${item.change_pct >= 0 ? "+" : ""}${fmt(item.change_pct)}%`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
