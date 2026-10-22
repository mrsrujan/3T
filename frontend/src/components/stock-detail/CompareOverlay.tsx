import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createChart, LineSeries, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import { useMultiStockHistory, type CompareTarget } from "../../hooks/useMultiStockHistory";
import { useSearch } from "../../hooks/useSearch";
import { getIndexHistory } from "../../api/client";
import type { Market } from "../../api/types";

const COLORS = ["#0891b2", "#f59e0b", "#10b981"]; // cyan, amber, emerald - distinct from gain/loss red/green
const INDEX_COLOR = "#94a3b8"; // slate-400: the benchmark reads as context, not another pick
const INDEX_LABEL: Record<Market, string> = { IN: "Nifty 50" };

function toUtcTimestamp(dateStr: string): UTCTimestamp {
  return (new Date(`${dateStr}T00:00:00Z`).getTime() / 1000) as UTCTimestamp;
}

const MAX_COMPARE = 3;
const DAYS = 180;

export function CompareOverlay({ initial }: { initial: CompareTarget }) {
  const [targets, setTargets] = useState<CompareTarget[]>([initial]);
  const [addQuery, setAddQuery] = useState("");
  const [showIndex, setShowIndex] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const results = useMultiStockHistory(targets, DAYS);
  const { data: searchResults } = useSearch(addQuery);
  const { data: indexHistory } = useQuery({
    queryKey: ["index-history", initial.market, DAYS],
    queryFn: () => getIndexHistory(initial.market, DAYS),
    enabled: showIndex,
    staleTime: 60 * 60 * 1000,
  });

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { color: "transparent" }, textColor: "#475569" },
      grid: { vertLines: { color: "#f1f5f9" }, horzLines: { color: "#f1f5f9" } },
      width: containerRef.current.clientWidth,
      height: 280,
      rightPriceScale: { borderVisible: false },
      leftPriceScale: { visible: false },
      timeScale: { borderVisible: false },
    });
    chartRef.current = chart;

    results.forEach((result, idx) => {
      const points = result.data?.points;
      if (!points || points.length === 0) return;

      const firstClose = points.find((p) => p.close !== null)?.close;
      if (!firstClose) return;

      const series = chart.addSeries(LineSeries, {
        color: COLORS[idx % COLORS.length],
        lineWidth: 2,
        title: targets[idx]?.symbol,
      });
      series.setData(
        points
          .filter((p) => p.close !== null)
          .map((p) => ({
            time: toUtcTimestamp(p.trade_date),
            value: ((p.close as number) / firstClose - 1) * 100,
          })),
      );
    });

    // Benchmark index as a dashed neutral line, normalized the same way.
    if (showIndex && indexHistory && indexHistory.points.length > 0) {
      const firstClose = indexHistory.points[0].close;
      if (firstClose) {
        const series = chart.addSeries(LineSeries, {
          color: INDEX_COLOR,
          lineWidth: 2,
          lineStyle: 2, // dashed
          title: indexHistory.name,
        });
        series.setData(
          indexHistory.points.map((p) => ({
            time: toUtcTimestamp(p.trade_date),
            value: (p.close / firstClose - 1) * 100,
          })),
        );
      }
    }

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.map((r) => r.data?.points.length).join(","), targets, showIndex, indexHistory]);

  function addTarget(market: Market, symbol: string) {
    if (targets.some((t) => t.market === market && t.symbol === symbol)) return;
    if (targets.length >= MAX_COMPARE) return;
    setTargets([...targets, { market, symbol }]);
    setAddQuery("");
  }

  function removeTarget(symbol: string) {
    if (targets.length <= 1) return;
    setTargets(targets.filter((t) => t.symbol !== symbol));
  }

  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <h3 className="mb-2 text-sm font-semibold font-mono uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Compare (% change, {DAYS}d)
      </h3>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {targets.map((t, idx) => (
          <span
            key={t.symbol}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-white"
            style={{ backgroundColor: COLORS[idx % COLORS.length] }}
          >
            {t.symbol}
            {targets.length > 1 && (
              <button onClick={() => removeTarget(t.symbol)} className="ml-1 opacity-80 hover:opacity-100">
                ×
              </button>
            )}
          </span>
        ))}

        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={showIndex} onChange={(e) => setShowIndex(e.target.checked)} />
          vs {INDEX_LABEL[initial.market]}
        </label>

        {targets.length < MAX_COMPARE && (
          <div className="relative">
            <input
              value={addQuery}
              onChange={(e) => setAddQuery(e.target.value)}
              placeholder="Add symbol to compare…"
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
            />
            {addQuery.trim() && searchResults && searchResults.items.length > 0 && (
              <div className="absolute left-0 top-full z-10 mt-1 max-h-48 w-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                {searchResults.items.map((item) => (
                  <button
                    key={`${item.market}-${item.symbol}`}
                    onClick={() => addTarget(item.market, item.symbol)}
                    className="block w-full px-2.5 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {item.symbol} <span className="text-slate-400">({item.market})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div ref={containerRef} />
    </div>
  );
}
