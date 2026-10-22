import { useState } from "react";
import { useParams } from "react-router-dom";
import { useStockDetail } from "../hooks/useStockDetail";
import { useLiveQuote } from "../hooks/useLiveQuote";
import { useWatchlist, useWatchlistMutations } from "../hooks/useWatchlist";
import { useStockHistory } from "../hooks/useStockHistory";
import { useNewsSentiment } from "../hooks/useNewsSentiment";
import { PriceReturnsTab } from "../components/stock-detail/tabs/PriceReturnsTab";
import { FundamentalsTab } from "../components/stock-detail/tabs/FundamentalsTab";
import { GlobalLinkagesTab } from "../components/stock-detail/tabs/GlobalLinkagesTab";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { ErrorBanner } from "../components/common/ErrorBanner";
import { FlagIcon } from "../components/common/FlagIcon";
import { ApiError } from "../api/client";
import { downloadCsv } from "../lib/csv";
import type { Market } from "../api/types";

type TabId = "price" | "fundamentals" | "global";

const TABS: { id: TabId; icon: string; label: string }[] = [
  { id: "price", icon: "📈", label: "Chart" },
  { id: "fundamentals", icon: "📊", label: "Fundamentals" },
  { id: "global", icon: "🌐", label: "Global linkages" },
];

const CURRENCY: Record<string, string> = { IN: "₹" };

function formatMarketCap(v: number | null, market: string): string {
  if (v === null) return "—";
  const c = CURRENCY[market] ?? "";
  if (v >= 1e12) return `${c}${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `${c}${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e7) return `${c}${(v / 1e7).toFixed(0)}cr`;
  return `${c}${(v / 1e6).toFixed(0)}M`;
}

function fmt(v: number | null, decimals = 2): string {
  if (v === null) return "—";
  return v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function MiniStatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="font-mono text-xs font-medium tabular-nums" style={color ? { color } : undefined}>
        {color ? value : <span className="text-slate-700 dark:text-slate-200">{value}</span>}
      </span>
    </div>
  );
}

export function StockDetailPage() {
  const { market, symbol } = useParams<{ market: Market; symbol: string }>();
  const [activeTab, setActiveTab] = useState<TabId>("price");

  const { data: detail, isLoading, error } = useStockDetail(market as Market, symbol ?? "");
  const { data: liveQuote } = useLiveQuote(market as Market, symbol ?? "");
  const { data: watchlist } = useWatchlist("ALL");
  const { add, remove } = useWatchlistMutations();
  const { data: historyForExport } = useStockHistory(market as Market, symbol ?? "", 365);
  const { data: sentiment } = useNewsSentiment(market as Market, symbol ?? "", detail?.name ?? "");

  if (!market || !symbol) return <ErrorBanner message="Missing market or symbol in URL." />;
  if (isLoading) return <div className="mx-auto max-w-[1440px] px-4 py-6"><LoadingSpinner label="Loading stock…" /></div>;

  const safeMarket = market as Market;
  const safeSymbol = symbol;

  if (error) {
    const message =
      error instanceof ApiError && error.status === 404
        ? `Unknown symbol ${symbol} for market ${market}.`
        : "Failed to load stock detail.";
    return <div className="mx-auto max-w-[1440px] px-4 py-6"><ErrorBanner message={message} /></div>;
  }

  if (!detail) return null;

  const isLive = Boolean(liveQuote?.is_market_open && liveQuote?.price !== null);
  const price = isLive ? liveQuote!.price : (detail.latest?.close ?? null);
  const pct = isLive ? liveQuote!.change_pct : (detail.latest?.pct_change ?? null);
  const isUp = pct !== null && pct >= 0;
  const currency = CURRENCY[safeMarket] ?? "";
  const f = detail.fundamentals;
  const pb = f?.book_value && price ? price / f.book_value : null;

  const isWatched = watchlist?.items.some((i) => i.market === safeMarket && i.symbol === safeSymbol) ?? false;

  function toggleFollow() {
    if (isWatched) remove.mutate({ market: safeMarket, symbol: safeSymbol });
    else add.mutate({ market: safeMarket, symbol: safeSymbol });
  }

  function handleExport() {
    if (!historyForExport) return;
    downloadCsv(
      historyForExport.points,
      [
        { key: "trade_date", header: "Date" },
        { key: "open", header: "Open" },
        { key: "high", header: "High" },
        { key: "low", header: "Low" },
        { key: "close", header: "Close" },
        { key: "volume", header: "Volume" },
      ],
      `${safeSymbol}_${safeMarket}_history.csv`,
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6">
      {/* ── Header ── */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {detail.name ?? symbol}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300">
              <FlagIcon code={safeMarket} /> {safeSymbol}
            </span>
            {detail.sector && (
              <span className="rounded-full bg-cyan-50 px-2.5 py-0.5 text-xs font-medium text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
                {detail.sector}
              </span>
            )}
            {detail.industry && (
              <span className="rounded-full border border-slate-200 px-2.5 py-0.5 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                {detail.industry}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-start gap-6">
          <div className="text-right">
            <div className="flex items-center justify-end gap-2">
              <div className="text-xs text-slate-400">{isLive ? "Live price" : "Last close"}</div>
              {isLive && (
                <span className="flex items-center gap-1 text-xs text-emerald-500">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />LIVE
                </span>
              )}
            </div>
            {price !== null ? (
              <>
                <div className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                  {currency}{fmt(price)}
                </div>
                {pct !== null && (
                  <div className={`text-sm font-medium ${isUp ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    {isUp ? "▲" : "▼"} {fmt(Math.abs(pct))}% on the day
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-slate-400">No price data yet</div>
            )}
          </div>
          <div className="flex flex-col gap-2">
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
            <button
              onClick={handleExport}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* ── Two-column body: tab content (left) + sidebar (right) ── */}
      <div className="flex gap-6 items-start">
        {/* ── Main content ── */}
        <div className="min-w-0 flex-1">
          {/* Key metrics bar */}
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "Market cap", value: formatMarketCap(f?.market_cap ?? null, safeMarket) },
              { label: "P/E (trailing)", value: fmt(f?.pe_ratio ?? null) },
              { label: "P/B", value: fmt(pb) },
              { label: "Dividend yield", value: f?.dividend_yield != null ? `${fmt(f.dividend_yield)}%` : "—" },
              { label: "ROE", value: f?.roe != null ? `${fmt(f.roe * 100, 1)}%` : "—" },
              { label: "Debt / Equity", value: f?.debt_to_equity != null ? fmt(f.debt_to_equity) : "—" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="text-xs text-slate-400">{s.label}</div>
                <div className="mt-0.5 font-mono text-sm font-semibold text-slate-800 dark:text-slate-100">{s.value}</div>
              </div>
            ))}
          </div>

          {/* Tab navigation */}
          <div className="mb-0 border-b border-slate-200 dark:border-slate-700">
            <div className="flex gap-0 overflow-x-auto">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? "border-cyan-600 text-cyan-600 dark:border-cyan-400 dark:text-cyan-400"
                      : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          {activeTab === "price" && (
            <PriceReturnsTab market={safeMarket} symbol={safeSymbol} detail={detail} livePrice={price} />
          )}
          {activeTab === "fundamentals" && (
            <FundamentalsTab market={safeMarket} symbol={safeSymbol} detail={detail} />
          )}
          {activeTab === "global" && (
            <GlobalLinkagesTab market={safeMarket} symbol={safeSymbol} />
          )}
        </div>

        {/* ── Right sidebar ── */}
        <aside className="hidden w-72 shrink-0 xl:block">
          <div className="sticky top-6 space-y-4">
            {/* Quick stats card */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Quick stats</h4>
              <MiniStatRow label="Market cap" value={formatMarketCap(f?.market_cap ?? null, safeMarket)} />
              <MiniStatRow label="P/E (trailing)" value={f?.pe_ratio != null ? f.pe_ratio.toFixed(1) : "—"} />
              <MiniStatRow label="Forward P/E" value={f?.forward_pe != null ? f.forward_pe.toFixed(1) : "—"} />
              <MiniStatRow label="P/B" value={pb != null ? pb.toFixed(2) : "—"} />
              <MiniStatRow label="ROE" value={f?.roe != null ? `${(f.roe * 100).toFixed(1)}%` : "—"} />
              <MiniStatRow label="Dividend yield" value={f?.dividend_yield != null ? `${f.dividend_yield.toFixed(2)}%` : "—"} />
              <MiniStatRow label="Debt / Equity" value={f?.debt_to_equity != null ? f.debt_to_equity.toFixed(2) : "—"} />
            </div>

            {/* Sentiment card */}
            {sentiment && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">News sentiment</h4>
                <MiniStatRow
                  label="Overall"
                  value={sentiment.overall_sentiment}
                  color={sentiment.overall_sentiment === "positive" ? "#10b981" : sentiment.overall_sentiment === "negative" ? "#ef4444" : undefined}
                />
                <MiniStatRow label="Articles" value={String(sentiment.article_count)} />
                {Object.entries(sentiment.categories ?? {}).map(([key, cat]) => (
                  <MiniStatRow
                    key={key}
                    label={cat.label}
                    value={cat.sentiment}
                    color={cat.sentiment === "positive" ? "#10b981" : cat.sentiment === "negative" ? "#ef4444" : undefined}
                  />
                ))}
              </div>
            )}

            {/* Navigation hint */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Tabs</h4>
              <div className="space-y-1">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors ${
                      activeTab === tab.id
                        ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300"
                        : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    }`}
                  >
                    <span>{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
