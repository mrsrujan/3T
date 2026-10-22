import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { HistoryPoint } from "../../api/types";

interface Props {
  points: HistoryPoint[];
  visibleDays?: number;
}

const UP_COLOR = "#26a69a";
const DOWN_COLOR = "#ef5350";

function toTs(d: string): UTCTimestamp {
  return (new Date(`${d}T00:00:00Z`).getTime() / 1000) as UTCTimestamp;
}

// 50/200-DMA lines, RSI/MACD/BB subcharts, and `activeIndicators` prop
// were removed when history was dialed down to 7 days - none of the
// indicators have enough baseline to compute a non-null point.
export function PriceVolumeChart({ points, visibleDays }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const isDark =
    typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  useEffect(() => {
    if (!containerRef.current) return;

    const theme = {
      layout: {
        background: { color: "transparent" },
        textColor: isDark ? "#94a3b8" : "#64748b",
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      },
      grid: {
        vertLines: { color: isDark ? "#1e293b" : "#f1f5f9" },
        horzLines: { color: isDark ? "#1e293b" : "#f1f5f9" },
      },
      timeScale: { borderVisible: false },
      rightPriceScale: { borderVisible: false },
    };

    let visiblePoints = points;
    if (visibleDays && points.length > 0) {
      const lastDate = new Date(`${points[points.length - 1].trade_date}T00:00:00Z`);
      const cutoff = new Date(lastDate);
      cutoff.setUTCDate(cutoff.getUTCDate() - visibleDays);
      visiblePoints = points.filter((p) => new Date(`${p.trade_date}T00:00:00Z`) >= cutoff);
    }

    const chart = createChart(containerRef.current, {
      ...theme,
      width: containerRef.current.clientWidth,
      height: 460,
    });
    chartRef.current = chart;

    chart.addPane();
    const [pricePane, volumePane] = chart.panes();
    pricePane.setStretchFactor(3);
    volumePane.setStretchFactor(1);

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: UP_COLOR,
      downColor: DOWN_COLOR,
      borderUpColor: UP_COLOR,
      borderDownColor: DOWN_COLOR,
      wickUpColor: UP_COLOR,
      wickDownColor: DOWN_COLOR,
    });
    candleSeries.setData(
      visiblePoints
        .filter((p) => p.open !== null && p.high !== null && p.low !== null && p.close !== null)
        .map((p) => ({
          time: toTs(p.trade_date),
          open: p.open as number,
          high: p.high as number,
          low: p.low as number,
          close: p.close as number,
        })),
    );

    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volSeries.setData(
      visiblePoints
        .filter((p) => p.volume !== null && p.close !== null && p.open !== null)
        .map((p) => ({
          time: toTs(p.trade_date),
          value: p.volume as number,
          color: (p.close as number) >= (p.open as number) ? `${UP_COLOR}cc` : `${DOWN_COLOR}cc`,
        })),
    );
    volSeries.moveToPane(1);

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [points, visibleDays, isDark]);

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: `linear-gradient(135deg, ${UP_COLOR} 50%, ${DOWN_COLOR} 50%)` }} />
          OHLC
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: `linear-gradient(135deg, ${UP_COLOR}cc 50%, ${DOWN_COLOR}cc 50%)` }} />
          Volume
        </span>
      </div>
      <div ref={containerRef} />
    </div>
  );
}
