import type { ReactNode } from "react";
import { FlagIcon } from "../common/FlagIcon";
import type { HoldingsSummaryResponse, Market } from "../../api/types";

function formatCurrency(value: number, digits = 2): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function pnlClass(value: number | null): string {
  if (value === null) return "text-slate-400";
  return value >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
}

const CURRENCY_SYMBOL: Record<string, string> = { IN: "₹" };

function Card({ label, invested, marketValue, pnl, pnlPct, currency, sub }: {
  label: ReactNode;
  invested: number;
  marketValue: number;
  pnl: number;
  pnlPct: number | null;
  currency: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex items-center gap-1.5 text-xs font-semibold font-mono uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
        {currency}
        {formatCurrency(marketValue)}
      </div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Invested: {currency}
        {formatCurrency(invested)}
      </div>
      <div className={`mt-1 text-sm font-medium font-mono tabular-nums ${pnlClass(pnl)}`}>
        {pnl >= 0 ? "+" : ""}
        {formatCurrency(pnl)} {pnlPct !== null && `(${pnl >= 0 ? "+" : ""}${formatCurrency(pnlPct)}%)`}
      </div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

export function PortfolioSummaryCards({ summary }: { summary: HoldingsSummaryResponse }) {
  const hasFxTotal =
    summary.total_market_value_inr !== null &&
    summary.total_invested_inr !== null &&
    summary.total_pnl_inr !== null;

  return (
    <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {hasFxTotal && (
        <Card
          label="Total Portfolio"
          invested={summary.total_invested_inr!}
          marketValue={summary.total_market_value_inr!}
          pnl={summary.total_pnl_inr!}
          pnlPct={summary.total_pnl_pct}
          currency="₹"
          sub={[
            summary.total_market_value_usd !== null && summary.fx_rate_usd_inr !== null
              ? `≈ $${formatCurrency(summary.total_market_value_usd)} at ₹${formatCurrency(summary.fx_rate_usd_inr)}/USD`
              : null,
            summary.total_realized_pnl_inr
              ? `Realized: ${summary.total_realized_pnl_inr >= 0 ? "+" : ""}₹${formatCurrency(summary.total_realized_pnl_inr)}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
      )}
      {Object.entries(summary.by_market).map(([market, m]) => (
        <Card
          key={market}
          label={
            <>
              <FlagIcon code={market as Market} /> India Holdings
            </>
          }
          invested={m.invested}
          marketValue={m.market_value}
          pnl={m.pnl}
          pnlPct={m.pnl_pct}
          currency={CURRENCY_SYMBOL[market] ?? ""}
        />
      ))}
    </div>
  );
}
