import { useEffect, useRef } from "react";
import {
  createChart,
  AreaSeries,
  HistogramSeries,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { IntradayPoint } from "../../api/types";

const PRICE_COLOR = "#0891b2"; // cyan-600, app accent
const AREA_TOP = "rgba(8, 145, 178, 0.25)";
const AREA_BOTTOM = "rgba(8, 145, 178, 0.02)";
const VOLUME_COLOR = "#cbd5e1";
const VOLUME_COLOR_DARK = "#334155";

export function IntradayChart({ points }: { points: IntradayPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const isDark =
    typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor: isDark ? "#cbd5e1" : "#475569",
        fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
      },
      grid: {
        vertLines: { color: isDark ? "#1e293b" : "#f1f5f9" },
        horzLines: { color: isDark ? "#1e293b" : "#f1f5f9" },
      },
      width: containerRef.current.clientWidth,
      height: 420,
      // Intraday bars need hour:minute labels, unlike the daily chart.
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderVisible: false },
      leftPriceScale: { visible: true, borderVisible: false },
    });
    chartRef.current = chart;

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: "left",
      color: isDark ? VOLUME_COLOR_DARK : VOLUME_COLOR,
      priceFormat: { type: "volume" },
    });
    chart.priceScale("left").applyOptions({ scaleMargins: { top: 0.05, bottom: 0 } });
    volumeSeries.setData(
      points
        .filter((p) => p.volume !== null)
        .map((p) => ({ time: p.time as UTCTimestamp, value: p.volume as number })),
    );

    const priceSeries = chart.addSeries(AreaSeries, {
      priceScaleId: "right",
      lineColor: PRICE_COLOR,
      topColor: AREA_TOP,
      bottomColor: AREA_BOTTOM,
      lineWidth: 2,
    });
    chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } });
    priceSeries.setData(points.map((p) => ({ time: p.time as UTCTimestamp, value: p.price })));

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
  }, [points]);

  return <div ref={containerRef} />;
}
