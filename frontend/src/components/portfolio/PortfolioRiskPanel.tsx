import { usePortfolioRisk } from "../../hooks/usePortfolioRisk";

function Metric({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`text-xl font-bold ${color ?? "text-slate-900 dark:text-slate-100"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

function SharpeColor(v: number | null): string {
  if (v === null) return "";
  if (v > 1.5) return "text-emerald-600 dark:text-emerald-400";
  if (v > 0.5) return "text-green-600 dark:text-green-400";
  if (v > 0) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-500 dark:text-red-400";
}

function BetaColor(v: number | null): string {
  if (v === null) return "";
  if (v < 0.8) return "text-blue-600 dark:text-blue-400";
  if (v < 1.2) return "text-green-600 dark:text-green-400";
  return "text-orange-600 dark:text-orange-400";
}

export function PortfolioRiskPanel() {
  const { data, isLoading } = usePortfolioRisk();

  if (isLoading) {
    return (
      <div className="mt-8">
        <h3 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-300">Risk Analytics</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.position_count === 0) return null;

  const { annualised_volatility_pct, annualised_return_pct, sharpe_ratio, portfolio_beta, sector_weights, data_days } = data;

  return (
    <div className="mt-8">
      <div className="mb-4 flex items-baseline gap-2">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Risk Analytics</h3>
        {data_days > 0 && (
          <span className="text-xs text-slate-400">{data_days}-day history</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
        <Metric
          label="Ann. Volatility"
          value={annualised_volatility_pct !== null ? `${annualised_volatility_pct.toFixed(1)}%` : "—"}
          sub="lower = stabler"
          color={
            annualised_volatility_pct !== null
              ? annualised_volatility_pct < 15
                ? "text-green-600 dark:text-green-400"
                : annualised_volatility_pct < 25
                ? "text-yellow-600 dark:text-yellow-400"
                : "text-red-500 dark:text-red-400"
              : ""
          }
        />
        <Metric
          label="Ann. Return"
          value={annualised_return_pct !== null ? `${annualised_return_pct > 0 ? "+" : ""}${annualised_return_pct.toFixed(1)}%` : "—"}
          sub="portfolio avg"
          color={annualised_return_pct !== null && annualised_return_pct > 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}
        />
        <Metric
          label="Sharpe Ratio"
          value={sharpe_ratio !== null ? sharpe_ratio.toFixed(2) : "—"}
          sub=">1 is good"
          color={SharpeColor(sharpe_ratio)}
        />
        <Metric
          label="Portfolio Beta"
          value={portfolio_beta !== null ? portfolio_beta.toFixed(2) : "—"}
          sub="vs market avg"
          color={BetaColor(portfolio_beta)}
        />
      </div>

      {sector_weights.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Sector Concentration</p>
          <div className="space-y-2">
            {sector_weights.slice(0, 6).map((s) => (
              <div key={s.sector} className="flex items-center gap-3">
                <span className="w-36 truncate text-xs text-slate-600 dark:text-slate-400">{s.sector}</span>
                <div className="flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" style={{ height: 6 }}>
                  <div
                    className="h-full rounded-full bg-cyan-500"
                    style={{ width: `${Math.min(s.weight_pct, 100)}%` }}
                  />
                </div>
                <span className="w-12 text-right text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {s.weight_pct.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">
        Beta vs equal-weighted market cohort · Sharpe uses 5%/7% risk-free rate (US/IN)
      </p>
    </div>
  );
}
