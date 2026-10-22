import { useStockQuarterly } from "../../../hooks/useStockQuarterly";
import { useStockAnnual } from "../../../hooks/useStockAnnual";
import { LoadingSpinner } from "../../common/LoadingSpinner";
import type { Market, StockDetailResponse } from "../../../api/types";

// ── sub-components ───────────────────────────────────────────────────────────

function PctCell({ v, neutral }: { v: number | null; neutral?: boolean }) {
  const text = v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
  const cls =
    v === null || neutral
      ? "text-slate-400"
      : v >= 0
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-red-600 dark:text-red-400";
  return <td className={`py-2 pr-3 text-right font-mono text-xs tabular-nums ${cls}`}>{text}</td>;
}

function NumCell({ v, suffix = "" }: { v: number | null; suffix?: string }) {
  return (
    <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200">
      {v !== null ? `${Math.round(v).toLocaleString()}${suffix}` : "—"}
    </td>
  );
}

function ShareholdingBar({ promoters, institutions, publicOther }: { promoters: number; institutions: number; publicOther: number }) {
  return (
    <div>
      <div className="flex h-8 w-full overflow-hidden rounded-lg">
        <div className="flex items-center justify-center text-xs font-medium text-white" style={{ width: `${promoters}%`, backgroundColor: "#0891b2" }}>
          {promoters > 8 ? `${promoters.toFixed(1)}%` : ""}
        </div>
        <div className="flex items-center justify-center text-xs font-medium text-white" style={{ width: `${institutions}%`, backgroundColor: "#f59e0b" }}>
          {institutions > 8 ? `${institutions.toFixed(1)}%` : ""}
        </div>
        <div className="flex items-center justify-center text-xs font-medium text-white" style={{ width: `${publicOther}%`, backgroundColor: "#64748b" }}>
          {publicOther > 8 ? `${publicOther.toFixed(1)}%` : ""}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-cyan-600" />Promoters / Insiders {promoters.toFixed(1)}%</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-500" />Institutions {institutions.toFixed(1)}%</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-slate-500" />Public &amp; other {publicOther.toFixed(1)}%</span>
      </div>
    </div>
  );
}

// Screener.in-style transposed table: rows = metrics, cols = years
function YearTable({ title, years, rows }: {
  title: string;
  years: string[];
  rows: { label: string; values: (number | null)[]; fmt?: (v: number | null) => string; highlight?: boolean }[];
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
              <th className="py-2 pl-3 pr-4 text-left font-medium text-slate-500 w-40">Metric</th>
              {years.map((y) => (
                <th key={y} className="py-2 pr-3 text-right font-medium text-slate-500 whitespace-nowrap">{y}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((row) => (
              <tr key={row.label} className={row.highlight ? "bg-slate-50/60 dark:bg-slate-800/20 font-medium" : "hover:bg-slate-50 dark:hover:bg-slate-800/30"}>
                <td className="py-2 pl-3 pr-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">{row.label}</td>
                {row.values.map((v, i) => {
                  const formatted = row.fmt ? row.fmt(v) : (v !== null ? Math.round(v).toLocaleString() : "—");
                  return (
                    <td key={i} className="py-2 pr-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-200">
                      {formatted}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── main component ───────────────────────────────────────────────────────────

interface Props {
  market: Market;
  symbol: string;
  detail: StockDetailResponse;
}

export function FundamentalsTab({ market, symbol, detail }: Props) {
  const { data: qData, isLoading: qLoading } = useStockQuarterly(market, symbol);
  const { data: aData, isLoading: aLoading } = useStockAnnual(market, symbol);

  const f = detail.fundamentals;
  const pb = f?.book_value && detail.latest?.close ? detail.latest.close / f.book_value : null;
  const currency = market === "IN" ? "₹" : "$";
  const unit = market === "IN" ? "₹ cr" : "$M";

  const pl = aData?.annual_pl ?? [];
  const bs = aData?.annual_bs ?? [];
  const cf = aData?.annual_cf ?? [];
  const years = pl.map((p) => p.year);
  const bsYears = bs.map((p) => p.year);
  const cfYears = cf.map((p) => p.year);

  const fmtN = (v: number | null) => v !== null ? Math.round(v).toLocaleString() : "—";
  const fmtPct = (v: number | null) => v !== null ? `${v.toFixed(1)}%` : "—";
  const fmtEps = (v: number | null) => v !== null ? v.toFixed(2) : "—";

  const efficiency = aData?.efficiency;
  const cagr = aData?.cagr;
  const signals = aData?.signals ?? [];

  return (
    <div className="mt-4 space-y-6">

      {/* ── Signals (Pros / Cons) ── */}
      {signals.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {signals.filter((s) => s.type === "pro").length > 0 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Strengths</div>
              <ul className="space-y-1">
                {signals.filter((s) => s.type === "pro").map((s, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-emerald-800 dark:text-emerald-300">
                    <span className="mt-0.5 shrink-0">✓</span>
                    <span>{s.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {signals.filter((s) => s.type === "con").length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/30">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-400">Concerns</div>
              <ul className="space-y-1">
                {signals.filter((s) => s.type === "con").map((s, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-red-800 dark:text-red-300">
                    <span className="mt-0.5 shrink-0">✗</span>
                    <span>{s.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Key ratios ── */}
      {f && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Key ratios</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {[
              { label: "Market Cap", value: (() => {
                if (!f.market_cap) return "—";
                if (f.market_cap >= 1e12) return `${currency}${(f.market_cap / 1e12).toFixed(2)}T`;
                if (f.market_cap >= 1e9) return `${currency}${(f.market_cap / 1e9).toFixed(2)}B`;
                if (f.market_cap >= 1e7) return `${currency}${(f.market_cap / 1e7).toFixed(0)}cr`;
                return `${currency}${(f.market_cap / 1e6).toFixed(0)}M`;
              })() },
              { label: "P/E (trailing)", value: f.pe_ratio?.toFixed(1) ?? "—" },
              { label: "Forward P/E", value: f.forward_pe?.toFixed(1) ?? "—", note: !f.forward_pe ? "No estimates" : undefined },
              { label: "P/B", value: pb !== null ? `${pb.toFixed(2)}${pb < 0 ? " ⚠" : ""}` : "—" },
              { label: "ROE", value: f.roe != null ? `${(f.roe * 100).toFixed(1)}%` : "—" },
              { label: "ROCE", value: efficiency?.roce != null ? `${efficiency.roce.toFixed(1)}%` : "—" },
              { label: "Dividend yield", value: f.dividend_yield != null ? `${f.dividend_yield.toFixed(2)}%` : "—" },
              { label: "Book value/share", value: f.book_value?.toFixed(2) ?? "—" },
              { label: "Debt / Equity", value: f.debt_to_equity != null ? f.debt_to_equity.toFixed(2) : "—" },
              ...(aData?.face_value != null ? [{ label: "Face value", value: `${currency}${aData.face_value}` }] : []),
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="text-xs text-slate-400">{s.label}</div>
                <div className="mt-1 font-mono text-sm font-semibold text-slate-800 dark:text-slate-100">{s.value}</div>
                {s.note && <div className="mt-0.5 text-xs text-slate-400 italic">{s.note}</div>}
              </div>
            ))}
          </div>

          {/* CAGR strip */}
          {cagr && (cagr.revenue_3yr != null || cagr.profit_3yr != null) && (
            <div className="mt-3 flex flex-wrap gap-3">
              {[
                { label: "Sales CAGR 3yr", value: cagr.revenue_3yr },
                { label: "Sales CAGR 5yr", value: cagr.revenue_5yr },
                { label: "Profit CAGR 3yr", value: cagr.profit_3yr },
                { label: "Profit CAGR 5yr", value: cagr.profit_5yr },
              ].filter((c) => c.value != null).map((c) => (
                <div key={c.label} className="rounded border border-slate-200 px-3 py-1.5 dark:border-slate-700">
                  <span className="text-xs text-slate-400">{c.label}: </span>
                  <span className={`font-mono text-xs font-semibold ${c.value! >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                    {c.value! >= 0 ? "+" : ""}{c.value!.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Annual P&L ── */}
      {aLoading && <LoadingSpinner label="Loading annual financials…" />}
      {pl.length > 0 && (
        <YearTable
          title={`Profit & Loss (${unit})`}
          years={years}
          rows={[
            { label: "Revenue", values: pl.map((p) => p.revenue), fmt: fmtN },
            { label: "Expenses", values: pl.map((p) => p.expenses), fmt: fmtN },
            { label: "Operating profit", values: pl.map((p) => p.operating_profit), fmt: fmtN, highlight: true },
            { label: "OPM %", values: pl.map((p) => p.op_margin), fmt: fmtPct },
            { label: "Other income", values: pl.map((p) => p.other_income), fmt: fmtN },
            { label: "Depreciation", values: pl.map((p) => p.depreciation), fmt: fmtN },
            { label: "Interest", values: pl.map((p) => p.interest), fmt: fmtN },
            { label: "PBT", values: pl.map((p) => p.pbt), fmt: fmtN },
            { label: "Tax %", values: pl.map((p) => p.tax_pct), fmt: fmtPct },
            { label: "Net profit", values: pl.map((p) => p.net_profit), fmt: fmtN, highlight: true },
            { label: "NM %", values: pl.map((p) => p.net_margin), fmt: fmtPct },
            { label: "EPS", values: pl.map((p) => p.eps), fmt: fmtEps },
            { label: "Dividend/share", values: pl.map((p) => p.dividend_per_share), fmt: (v) => v != null ? v.toFixed(2) : "—" },
          ]}
        />
      )}

      {/* ── Annual Balance Sheet ── */}
      {bs.length > 0 && (
        <YearTable
          title={`Balance Sheet (${unit})`}
          years={bsYears}
          rows={[
            { label: "Equity capital", values: bs.map((p) => p.equity_capital), fmt: fmtN },
            { label: "Reserves", values: bs.map((p) => p.reserves), fmt: fmtN },
            { label: "Total debt", values: bs.map((p) => p.total_debt), fmt: fmtN },
            { label: "Current liabilities", values: bs.map((p) => p.current_liabilities), fmt: fmtN },
            { label: "Total liabilities", values: bs.map((p) => p.total_liabilities), fmt: fmtN, highlight: true },
            { label: "Fixed assets", values: bs.map((p) => p.fixed_assets), fmt: fmtN },
            { label: "Current assets", values: bs.map((p) => p.current_assets), fmt: fmtN },
            { label: "Total assets", values: bs.map((p) => p.total_assets), fmt: fmtN, highlight: true },
          ]}
        />
      )}

      {/* ── Annual Cash Flow ── */}
      {cf.length > 0 && (
        <YearTable
          title={`Cash Flow (${unit})`}
          years={cfYears}
          rows={[
            { label: "Operating CF", values: cf.map((p) => p.operating_cf), fmt: fmtN },
            { label: "Investing CF", values: cf.map((p) => p.investing_cf), fmt: fmtN },
            { label: "Financing CF", values: cf.map((p) => p.financing_cf), fmt: fmtN },
            { label: "Capex", values: cf.map((p) => p.capex), fmt: fmtN },
            { label: "Free cash flow", values: cf.map((p) => p.free_cash_flow), fmt: fmtN, highlight: true },
          ]}
        />
      )}

      {/* ── Efficiency ratios ── */}
      {efficiency && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Efficiency ratios</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "Debtor days", value: efficiency.debtor_days != null ? `${efficiency.debtor_days}d` : "—" },
              { label: "Inventory days", value: efficiency.inventory_days != null ? `${efficiency.inventory_days}d` : "—" },
              { label: "Days payable", value: efficiency.days_payable != null ? `${efficiency.days_payable}d` : "—" },
              { label: "Cash conv. cycle", value: efficiency.cash_conversion_cycle != null ? `${efficiency.cash_conversion_cycle}d` : "—" },
              { label: "Working cap. days", value: efficiency.working_capital_days != null ? `${efficiency.working_capital_days}d` : "—" },
              { label: "ROCE", value: efficiency.roce != null ? `${efficiency.roce}%` : "—" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="text-xs text-slate-400">{s.label}</div>
                <div className="mt-1 font-mono text-sm font-semibold text-slate-800 dark:text-slate-100">{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Quarterly results ── */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Quarterly results</h3>
        {qLoading && <LoadingSpinner label="Loading financials…" />}
        {qData && qData.quarterly.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
                  <th className="py-2 pl-3 pr-3 text-left font-medium text-slate-500">Quarter</th>
                  <th className="py-2 pr-3 text-right font-medium text-slate-500">Rev ({unit})</th>
                  <th className="py-2 pr-3 text-right font-medium text-slate-500">QoQ</th>
                  <th className="py-2 pr-3 text-right font-medium text-slate-500">YoY</th>
                  <th className="py-2 pr-3 text-right font-medium text-slate-500">Gross ({unit})</th>
                  <th className="py-2 pr-3 text-right font-medium text-slate-500">GM%</th>
                  <th className="py-2 pr-3 text-right font-medium text-slate-500">EBITDA ({unit})</th>
                  <th className="py-2 pr-3 text-right font-medium text-slate-500">Op. Inc ({unit})</th>
                  <th className="py-2 pr-3 text-right font-medium text-slate-500">OM%</th>
                  <th className="py-2 pr-3 text-right font-medium text-slate-500">Net ({unit})</th>
                  <th className="py-2 pr-3 text-right font-medium text-slate-500">NM%</th>
                  <th className="py-2 pr-3 text-right font-medium text-slate-500">EPS</th>
                  <th className="py-2 pr-3 text-right font-medium text-slate-500">FCF ({unit})</th>
                  <th className="py-2 pr-3 text-right font-medium text-slate-500">Int Cov</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {qData.quarterly.map((q) => (
                  <tr key={q.quarter} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="py-2 pl-3 pr-3 font-medium text-slate-600 dark:text-slate-300">{q.quarter}</td>
                    <NumCell v={q.revenue} />
                    <PctCell v={q.revenue_qoq} />
                    <PctCell v={q.revenue_yoy} />
                    <NumCell v={q.gross_profit} />
                    <PctCell v={q.gross_margin} neutral />
                    <NumCell v={q.ebitda} />
                    <NumCell v={q.operating_income} />
                    <PctCell v={q.op_margin} neutral />
                    <NumCell v={q.net_profit} />
                    <PctCell v={q.net_margin} neutral />
                    <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                      {q.eps !== null ? q.eps.toFixed(2) : "—"}
                    </td>
                    <NumCell v={q.free_cash_flow} />
                    <td className="py-2 pr-3 text-right font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {q.interest_coverage !== null ? q.interest_coverage.toFixed(1) + "x" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : qData && qData.quarterly.length === 0 ? (
          <div className="rounded-lg bg-sky-50 p-4 text-sm text-sky-700 dark:bg-sky-950/30 dark:text-sky-300">
            yfinance didn't return enough quarterly statement history for this ticker.
          </div>
        ) : null}
        {qData && (
          <p className="mt-1 text-xs text-slate-400">
            yfinance · up to 8 quarters · {unit} · EPS per share · Int Cov = EBIT ÷ Interest
            {market === "IN" ? " · Promoter data via Yahoo (may undercount vs BSE SHP by 10–30pp)" : ""}
          </p>
        )}
      </div>

      {/* ── Shareholding ── */}
      {qData?.shareholding && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Shareholding</h3>
          <ShareholdingBar
            promoters={qData.shareholding.promoters}
            institutions={qData.shareholding.institutions}
            publicOther={qData.shareholding.public_other}
          />
          <p className="mt-2 text-xs text-slate-400">
            Via Yahoo Finance. For Indian stocks, 'insiders' ≈ promoter group (may undercount actual promoter holding from BSE SHP filings). Updated quarterly with up to 45–90 day lag.
          </p>
        </div>
      )}

      {/* ── Company website ── */}
      {aData?.website && (
        <div className="text-xs text-slate-400">
          Company website: <a href={aData.website} target="_blank" rel="noopener noreferrer" className="text-cyan-600 hover:underline dark:text-cyan-400">{aData.website}</a>
        </div>
      )}
    </div>
  );
}
