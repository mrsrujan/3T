import { useEffect, useRef } from "react";
import { createChart, LineSeries, type UTCTimestamp } from "lightweight-charts";
import { useStockHistory } from "../../../hooks/useStockHistory";
import { useSymbolHistory } from "../../../hooks/useSymbolHistory";
import { LoadingSpinner } from "../../common/LoadingSpinner";
import { computeBeta, alignedLogReturns } from "../../../lib/riskMetrics";
import type { Market } from "../../../api/types";

const BASE_DRIVERS_IN = [
  { symbol: "^NSEI", label: "NIFTY 50", color: "#0891b2" },
  { symbol: "^GSPC", label: "S&P 500", color: "#64748b" },
  { symbol: "GC=F", label: "Gold", color: "#f59e0b" },
  { symbol: "^TNX", label: "US 10Y Yield", color: "#8b5cf6" },
  { symbol: "DX=F", label: "Dollar Index", color: "#ec4899" },
  { symbol: "BZ=F", label: "Brent Crude", color: "#f97316" },
  { symbol: "^INDIAVIX", label: "India VIX", color: "#ef4444" },
  { symbol: "USDINR=X", label: "USD/INR", color: "#06b6d4" },
];

function ts(d: string): UTCTimestamp {
  return (new Date(`${d}T00:00:00Z`).getTime() / 1000) as UTCTimestamp;
}

interface BetaResult {
  symbol: string;
  label: string;
  color: string;
  beta: number;
  rho: number;
  beta90d: number | null;
  rho90d: number | null;
}

function BetaRow({ b }: { b: BetaResult }) {
  const noise = Math.abs(b.rho) < 0.10;
  const maxBeta = 1.0;
  const clampedBeta = Math.max(-maxBeta, Math.min(maxBeta, b.beta));
  const pct = Math.abs(clampedBeta) / maxBeta * 50;
  const drifting = b.beta90d !== null && Math.abs(b.beta - b.beta90d) > 0.2;

  return (
    <div className={`flex items-center gap-3 py-1.5 ${noise ? "opacity-40" : ""}`}>
      <div className="w-32 shrink-0 text-right text-sm text-slate-600 dark:text-slate-300">{b.label}</div>
      <div className="relative flex h-5 flex-1 items-center">
        <div className="absolute left-1/2 h-full w-px bg-slate-200 dark:bg-slate-700" />
        {clampedBeta >= 0 ? (
          <div
            className="absolute h-3 rounded-r"
            style={{ left: "50%", width: `${pct}%`, backgroundColor: b.color }}
          />
        ) : (
          <div
            className="absolute h-3 rounded-l"
            style={{ right: "50%", width: `${pct}%`, backgroundColor: "#f87171" }}
          />
        )}
      </div>
      <div className="w-20 shrink-0 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
        β={b.beta.toFixed(2)}
        {b.beta90d !== null && (
          <span className={`ml-1 ${drifting ? "text-amber-500" : "text-slate-400"}`} title="90-day rolling beta">
            90d:{b.beta90d.toFixed(2)}
          </span>
        )}
      </div>
      <div className="w-16 shrink-0 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
        ρ={b.rho >= 0 ? "+" : ""}{b.rho.toFixed(2)}
      </div>
    </div>
  );
}

function BasketChart({
  drivers,
}: {
  drivers: { symbol: string; label: string; color: string; points: { trade_date: string; close: number }[] }[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  useEffect(() => {
    if (!ref.current) return;
    const validDrivers = drivers.filter((d) => d.points.length > 0);
    if (validDrivers.length === 0) return;

    const chart = createChart(ref.current, {
      layout: { background: { color: "transparent" }, textColor: isDark ? "#cbd5e1" : "#475569" },
      grid: { vertLines: { color: isDark ? "#1e293b" : "#f1f5f9" }, horzLines: { color: isDark ? "#1e293b" : "#f1f5f9" } },
      width: ref.current.clientWidth,
      height: 240,
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
    });

    for (const driver of validDrivers) {
      const pts = driver.points.slice(-252);
      if (pts.length === 0) continue;
      const base = pts[0].close;
      if (!base) continue;
      const series = chart.addSeries(LineSeries, { color: driver.color, lineWidth: 1 });
      series.setData(pts.map((p) => ({ time: ts(p.trade_date), value: (p.close / base) * 100 })));
    }

    chart.timeScale().fitContent();
    const ro = new ResizeObserver(() => { if (ref.current) chart.applyOptions({ width: ref.current.clientWidth }); });
    ro.observe(ref.current);
    return () => { ro.disconnect(); chart.remove(); };
  }, [drivers, isDark]);

  return <div ref={ref} />;
}

interface Props {
  market: Market;
  symbol: string;
}

export function GlobalLinkagesTab({ market, symbol }: Props) {
  const drivers = BASE_DRIVERS_IN;

  const { data: stockHistory, isLoading: stockLoading } = useStockHistory(market, symbol, 730);

  const d0 = useSymbolHistory(drivers[0]?.symbol ?? null, 730);
  const d1 = useSymbolHistory(drivers[1]?.symbol ?? null, 730);
  const d2 = useSymbolHistory(drivers[2]?.symbol ?? null, 730);
  const d3 = useSymbolHistory(drivers[3]?.symbol ?? null, 730);
  const d4 = useSymbolHistory(drivers[4]?.symbol ?? null, 730);
  const d5 = useSymbolHistory(drivers[5]?.symbol ?? null, 730);
  const d6 = useSymbolHistory(drivers[6]?.symbol ?? null, 730);
  const d7 = useSymbolHistory(drivers[7]?.symbol ?? null, 730);

  const driverData = [d0, d1, d2, d3, d4, d5, d6, d7].slice(0, drivers.length);
  const anyLoading = stockLoading || driverData.some((d) => d.isLoading);

  if (anyLoading) return <div className="mt-6"><LoadingSpinner label="Loading global data…" /></div>;
  if (!stockHistory) return <p className="mt-6 text-sm text-slate-500">No stock history available.</p>;

  const stockPoints = stockHistory.points
    .filter((p) => p.close !== null)
    .map((p) => ({ date: p.trade_date, close: p.close as number }));

  // Compute full-period and 90-day rolling betas
  const betas: BetaResult[] = [];
  for (let i = 0; i < drivers.length; i++) {
    const driver = drivers[i];
    const dpts = driverData[i]?.data?.points ?? [];
    if (dpts.length === 0) continue;

    const driverPoints = dpts.filter((p) => p.close != null).map((p) => ({ date: p.trade_date, close: p.close as number }));

    const { aReturns, bReturns } = alignedLogReturns(stockPoints, driverPoints);
    const full = computeBeta(aReturns, bReturns);
    if (!full) continue;

    // 90-day rolling beta (last ~90 aligned trading days)
    const rolling90 = computeBeta(aReturns.slice(-90), bReturns.slice(-90));

    betas.push({
      ...driver,
      beta: full.beta,
      rho: full.rho,
      beta90d: rolling90?.beta ?? null,
      rho90d: rolling90?.rho ?? null,
    });
  }

  const basketDrivers = drivers.map((driver, i) => ({
    ...driver,
    points: driverData[i]?.data?.points?.filter((p) => p.close != null).map((p) => ({
      trade_date: p.trade_date,
      close: p.close as number,
    })) ?? [],
  }));

  const driftingBetas = betas.filter((b) => b.beta90d !== null && Math.abs(b.beta - b.beta90d) > 0.2);

  return (
    <div className="mt-4 space-y-6">
      {/* Beta bar chart */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Sensitivity (β) to global drivers
          </h3>
          <span className="text-xs text-slate-400">Full 2Y · 90-day rolling shown inline</span>
        </div>
        <p className="mb-3 text-xs text-slate-400">Faded = weak correlation (|ρ| &lt; 0.10). Amber 90d value = regime shift detected.</p>

        {driftingBetas.length > 0 && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
            Regime shift: {driftingBetas.map((b) => b.label).join(", ")} — 90-day beta differs from 2Y beta by &gt;0.2
          </div>
        )}

        {betas.length === 0 ? (
          <p className="text-sm text-slate-500">Insufficient overlapping data.</p>
        ) : (
          <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
            <div className="mb-1 flex items-center gap-3">
              <div className="w-32 shrink-0" />
              <div className="flex flex-1 justify-between text-xs text-slate-400">
                <span>-1.0</span><span>-0.5</span><span>0</span><span>+0.5</span><span>+1.0</span>
              </div>
              <div className="w-20 shrink-0" />
              <div className="w-16 shrink-0" />
            </div>
            {betas.map((b) => (
              <BetaRow key={b.symbol} b={b} />
            ))}
            <p className="mt-3 text-xs text-slate-400">
              β = OLS slope of stock vs driver daily log-returns. |ρ| &lt; 0.10 = mostly noise.
            </p>
          </div>
        )}
      </div>

      {/* Driver basket chart */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Driver basket, rebased to 100 (1 year)
        </h3>
        <BasketChart drivers={basketDrivers} />
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {drivers.map((d) => (
            <span key={d.symbol} className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-block h-1.5 w-4 rounded" style={{ backgroundColor: d.color }} />
              {d.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
