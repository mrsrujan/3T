import type { Market, StockDetailResponse } from "../../api/types";
import { useEarnings } from "../../hooks/useEarnings";

function formatMarketCap(value: number | null): string {
  if (value === null || value === undefined) return "—";
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  return value.toLocaleString();
}

function formatNumber(value: number | null, digits = 2): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// yfinance quirk (verified against real fetched data): dividendYield comes
// back already as a percent (2.72 means 2.72%), but returnOnEquity comes
// back as a 0-1 ratio (0.213 means 21.3%).
function formatAlreadyPercent(value: number | null): string {
  return value === null || value === undefined ? "—" : `${value.toFixed(2)}%`;
}

function formatRatioAsPercent(value: number | null): string {
  return value === null || value === undefined ? "—" : `${(value * 100).toFixed(2)}%`;
}

interface Stat {
  label: string;
  value: string;
  sub?: string;
}

interface Props {
  detail: StockDetailResponse;
  // When the market is open, use the live-polled price here so this grid's
  // "Current Price" always matches the header's live figure instead of
  // showing yesterday's EOD close alongside a live number.
  livePrice?: number | null;
  market?: Market;
  symbol?: string;
}

export function KeyStatsGrid({ detail, livePrice, market, symbol }: Props) {
  const f = detail.fundamentals;

  const { data: earnings } = useEarnings(
    market ?? detail.market,
    symbol ? [symbol] : [],
  );
  const nextEarnings = earnings?.items[0];
  const daysToEarnings = nextEarnings
    ? Math.ceil((new Date(nextEarnings.earnings_date).getTime() - Date.now()) / 86400000)
    : null;

  if (!detail.fundamentals && !detail.latest) {
    return null;
  }

  const currentPrice = livePrice ?? detail.latest?.close ?? null;

  // 52W high/low (needs 252 trading days) and rel_volume (needs 20) are
  // omitted - would be null under the 7-day history config.
  const stats: Stat[] = [
    { label: "Market Cap", value: f ? formatMarketCap(f.market_cap) : "—" },
    { label: "Current Price", value: formatNumber(currentPrice) },
    { label: "Stock P/E", value: f ? formatNumber(f.pe_ratio) : "—" },
    { label: "Forward P/E", value: f ? formatNumber(f.forward_pe) : "—" },
    { label: "Book Value", value: f ? formatNumber(f.book_value) : "—" },
    { label: "Dividend Yield", value: f ? formatAlreadyPercent(f.dividend_yield) : "—" },
    { label: "ROE", value: f ? formatRatioAsPercent(f.roe) : "—" },
    {
      label: "Volume",
      value: detail.latest?.volume ? detail.latest.volume.toLocaleString() : "—",
    },
  ];

  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      {f && f.fetch_status === "partial" && (
        <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">
          Some fundamentals fields are unavailable for this stock.
        </p>
      )}
      {!f && (
        <p className="mb-2 text-xs text-slate-400">Fundamentals unavailable for this stock.</p>
      )}
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label}>
            <div className="text-xs text-slate-400">{s.label}</div>
            <div className="font-mono text-sm font-medium tabular-nums text-slate-800 dark:text-slate-200">
              {s.value}
            </div>
            {s.sub && <div className="text-xs text-slate-400">{s.sub}</div>}
          </div>
        ))}
      </div>
      {daysToEarnings !== null && daysToEarnings >= 0 && daysToEarnings <= 60 && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950">
          <p className="text-xs text-amber-600 dark:text-amber-400">Next Earnings</p>
          <p className="font-mono text-sm font-semibold text-amber-700 dark:text-amber-300">
            {nextEarnings!.earnings_date} <span className="text-xs font-normal">({daysToEarnings}d)</span>
          </p>
        </div>
      )}
    </div>
  );
}
