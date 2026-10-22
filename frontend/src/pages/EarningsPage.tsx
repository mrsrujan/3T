import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMarket } from "../context/MarketContext";
import { useEarnings } from "../hooks/useEarnings";
import { useWatchlist } from "../hooks/useWatchlist";
import { useStockQuarterly } from "../hooks/useStockQuarterly";
import { useStockDetail } from "../hooks/useStockDetail";
import { SkeletonTable } from "../components/common/Skeleton";
import type { EarningsItem, Market, QuarterlyPoint } from "../api/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtValue(val: number | null, _market: Market): string {
  if (val === null) return "—";
  const abs = Math.abs(val);
  if (abs >= 10000) return `${(val / 1000).toFixed(1)}K Cr`;
  return `${val.toFixed(0)} Cr`;
}

function fmtPct(val: number | null): string {
  if (val === null) return "—";
  return `${val > 0 ? "+" : ""}${val.toFixed(1)}%`;
}

function fmtEps(val: number | null, _market: Market): string {
  if (val === null) return "—";
  return `₹${val.toFixed(2)}`;
}

function daysUntil(iso: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86_400_000);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Badge helpers ──────────────────────────────────────────────────────────

type ResultSentiment = "positive" | "negative" | "mixed";
type QualityGrade = "excellent" | "good" | "fair" | "weak" | "loss";
type ReactionGrade = "excellent" | "good" | "neutral" | "bad";

function getResult(q: QuarterlyPoint): ResultSentiment {
  if (q.net_profit !== null && q.net_profit < 0) return "negative";
  if (q.revenue_yoy !== null && q.revenue_yoy < -5) return "negative";
  if (
    q.net_profit !== null &&
    q.net_profit > 0 &&
    q.revenue_yoy !== null &&
    q.revenue_yoy > 0
  )
    return "positive";
  if (q.net_profit !== null && q.net_profit > 0) return "positive";
  return "mixed";
}

function getQuality(margin: number | null): QualityGrade | null {
  if (margin === null) return null;
  if (margin > 20) return "excellent";
  if (margin > 10) return "good";
  if (margin > 5) return "fair";
  if (margin >= 0) return "weak";
  return "loss";
}

function getReaction(reaction: number | null): ReactionGrade | null {
  if (reaction === null) return null;
  if (reaction > 5) return "excellent";
  if (reaction > 2) return "good";
  if (reaction >= -2) return "neutral";
  return "bad";
}

// ─── Badge components ────────────────────────────────────────────────────────

const RESULT_STYLE: Record<ResultSentiment, string> = {
  positive: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  negative: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  mixed:    "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400",
};
const RESULT_LABEL: Record<ResultSentiment, string> = {
  positive: "Positive",
  negative: "Negative",
  mixed:    "Mixed",
};

const QUALITY_STYLE: Record<QualityGrade, string> = {
  excellent: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  good:      "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  fair:      "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400",
  weak:      "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
  loss:      "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
};
const QUALITY_LABEL: Record<QualityGrade, string> = {
  excellent: "Excellent",
  good:      "Good",
  fair:      "Fair",
  weak:      "Weak",
  loss:      "Loss",
};

const REACTION_STYLE: Record<ReactionGrade, string> = {
  excellent: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  good:      "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  neutral:   "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  bad:       "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
};
const REACTION_LABEL: Record<ReactionGrade, string> = {
  excellent: "Excellent",
  good:      "Good",
  neutral:   "Neutral",
  bad:       "Bad",
};

function Badge({ cls, label }: { cls: string; label: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ─── Growth arrow ────────────────────────────────────────────────────────────

function GrowthCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-slate-400">—</span>;
  const positive = value > 0;
  const cls = positive
    ? "text-green-600 dark:text-green-400"
    : value < 0
    ? "text-red-500 dark:text-red-400"
    : "text-slate-500";
  const arrow = positive ? "▲" : value < 0 ? "▼" : "–";
  return (
    <span className={`font-medium ${cls}`}>
      {arrow} {fmtPct(value)}
    </span>
  );
}

// ─── Upcoming Earnings table ─────────────────────────────────────────────────

function UpcomingEarnings({
  items,
  market,
  onSelect,
}: {
  items: EarningsItem[];
  market: Market;
  onSelect: (symbol: string) => void;
}) {
  if (!items.length) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        No upcoming earnings found for your watchlist stocks.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            <th className="px-4 py-3">Symbol</th>
            <th className="px-4 py-3">Company</th>
            <th className="px-4 py-3">Earnings Date</th>
            <th className="px-4 py-3">In</th>
            <th className="px-4 py-3">EPS Estimate</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((item) => {
            const days = daysUntil(item.earnings_date);
            const urgency =
              days <= 3
                ? "text-orange-600 dark:text-orange-400 font-semibold"
                : days <= 7
                ? "text-yellow-600 dark:text-yellow-400"
                : "text-slate-600 dark:text-slate-400";
            return (
              <tr
                key={item.symbol}
                className="hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <td className="px-4 py-3">
                  <Link
                    to={`/stock/${market}/${item.symbol}`}
                    className="font-mono font-semibold text-cyan-600 hover:underline dark:text-cyan-400"
                  >
                    {item.symbol}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  {item.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  {fmtDate(item.earnings_date)}
                </td>
                <td className={`px-4 py-3 ${urgency}`}>
                  {days === 0
                    ? "Today"
                    : days === 1
                    ? "Tomorrow"
                    : `${days}d`}
                </td>
                <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">
                  {item.eps_estimate !== null ? `₹${item.eps_estimate.toFixed(2)}` : "—"}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onSelect(item.symbol)}
                    className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:border-cyan-400 hover:text-cyan-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-cyan-500 dark:hover:text-cyan-400"
                  >
                    View Results
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Quarterly Results table ─────────────────────────────────────────────────

function QuarterlyResultsTable({
  quarters,
  market,
}: {
  quarters: QuarterlyPoint[];
  market: Market;
}) {
  if (!quarters.length) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        No quarterly data available for this symbol.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            <th className="px-4 py-3">Quarter</th>
            <th className="px-4 py-3">Revenue</th>
            <th className="px-4 py-3">Rev YoY</th>
            <th className="px-4 py-3">Net Profit</th>
            <th className="px-4 py-3">Net Margin</th>
            <th className="px-4 py-3">EPS</th>
            <th className="px-4 py-3">Result</th>
            <th className="px-4 py-3">Quality</th>
            <th className="px-4 py-3">Market Reaction</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {quarters.map((q) => {
            const result = getResult(q);
            const quality = getQuality(q.net_margin);
            const reaction = getReaction(q.price_reaction);
            return (
              <tr
                key={q.quarter}
                className="hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                  {q.quarter}
                </td>
                <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">
                  {fmtValue(q.revenue, market)}
                </td>
                <td className="px-4 py-3">
                  <GrowthCell value={q.revenue_yoy} />
                </td>
                <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">
                  {fmtValue(q.net_profit, market)}
                </td>
                <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">
                  {q.net_margin !== null ? `${q.net_margin.toFixed(1)}%` : "—"}
                </td>
                <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">
                  {fmtEps(q.eps, market)}
                </td>
                <td className="px-4 py-3">
                  <Badge cls={RESULT_STYLE[result]} label={RESULT_LABEL[result]} />
                </td>
                <td className="px-4 py-3">
                  {quality ? (
                    <Badge cls={QUALITY_STYLE[quality]} label={QUALITY_LABEL[quality]} />
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {reaction ? (
                    <div className="flex items-center gap-1.5">
                      <Badge cls={REACTION_STYLE[reaction]} label={REACTION_LABEL[reaction]} />
                      <span className="text-xs text-slate-400">
                        {fmtPct(q.price_reaction)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-slate-400 text-xs">No data</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function EarningsPage() {
  const { market } = useMarket();
  const [inputSymbol, setInputSymbol] = useState("");
  const [activeSymbol, setActiveSymbol] = useState("");

  const { data: watchlist } = useWatchlist();
  const watchlistSymbols = useMemo(
    () =>
      (watchlist?.items ?? [])
        .filter((i) => i.market === market)
        .map((i) => i.symbol),
    [watchlist, market],
  );

  const { data: earnings, isLoading: earningsLoading } = useEarnings(market, watchlistSymbols);
  const { data: quarterly, isLoading: quarterlyLoading } = useStockQuarterly(market, activeSymbol);
  const { data: detail } = useStockDetail(market, activeSymbol);

  function handleLoad() {
    const sym = inputSymbol.trim().toUpperCase();
    if (sym) setActiveSymbol(sym);
  }

  function handleSelect(symbol: string) {
    setInputSymbol(symbol);
    setActiveSymbol(symbol);
  }

  return (
    <div className="mx-auto max-w-[1800px] space-y-10 px-4 py-6">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        Earnings
      </h2>

      {/* ── Upcoming Earnings ── */}
      <section className="space-y-4">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Upcoming Earnings
          </h3>
          <span className="text-xs text-slate-400">from your watchlist</span>
        </div>

        {earningsLoading && <SkeletonTable />}

        {!earningsLoading && watchlistSymbols.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Add stocks to your{" "}
            <Link to="/watchlist" className="text-cyan-600 hover:underline dark:text-cyan-400">
              watchlist
            </Link>{" "}
            to see upcoming earnings.
          </p>
        )}

        {!earningsLoading && watchlistSymbols.length > 0 && (
          <UpcomingEarnings
            items={earnings?.items ?? []}
            market={market}
            onSelect={handleSelect}
          />
        )}
      </section>

      {/* ── Quarterly Results ── */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Quarterly Results
        </h3>

        {/* Symbol search */}
        <div className="flex gap-2">
          <input
            value={inputSymbol}
            onChange={(e) => setInputSymbol(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleLoad()}
            placeholder="e.g. RELIANCE, TCS"
            className="w-56 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-cyan-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-cyan-500"
          />
          <button
            onClick={handleLoad}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 dark:bg-cyan-500 dark:hover:bg-cyan-600"
          >
            Load
          </button>
        </div>

        {quarterlyLoading && <SkeletonTable />}

        {!quarterlyLoading && activeSymbol && quarterly && (
          <div className="space-y-3">
            {/* Company header */}
            <div className="flex flex-wrap items-baseline gap-2">
              <Link
                to={`/stock/${market}/${activeSymbol}`}
                className="font-mono text-lg font-bold text-cyan-600 hover:underline dark:text-cyan-400"
              >
                {activeSymbol}
              </Link>
              {detail?.name && (
                <span className="text-sm text-slate-600 dark:text-slate-400">{detail.name}</span>
              )}
              {detail?.sector && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {detail.sector}
                </span>
              )}
              <span className="text-xs text-slate-400">
                {quarterly.quarterly.length} quarter{quarterly.quarterly.length !== 1 ? "s" : ""}
              </span>
            </div>

            <QuarterlyResultsTable quarters={quarterly.quarterly} market={market} />

            <p className="text-xs text-slate-400 dark:text-slate-500">
              Market Reaction = largest single-day price move in 70 days after each quarter-end (proxy for earnings-day impact).
            </p>
          </div>
        )}

        {!quarterlyLoading && activeSymbol && quarterly?.quarterly.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No quarterly data available for {activeSymbol}.
          </p>
        )}
      </section>
    </div>
  );
}
