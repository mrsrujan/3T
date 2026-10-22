import { useEffect, useRef } from "react";
import { createChart, ColorType, LineStyle, LineSeries } from "lightweight-charts";
import { useIsDark } from "../../hooks/useIsDark";

interface Point {
  trade_date: string;
  close: number;
}

export function SymbolMiniChart({ points }: { points: Point[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDark = useIsDark();

  useEffect(() => {
    if (!containerRef.current || points.length === 0) return;

    const gridColor = isDark ? "#1e293b" : "#f1f5f9";
    const textColor = isDark ? "#94a3b8" : "#64748b";
    const lineColor = points[points.length - 1].close >= points[0].close ? "#16a34a" : "#dc2626";

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 140,
      layout: {
        background: { type: ColorType.Solid, color: isDark ? "#0f172a" : "#ffffff" },
        textColor,
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: { vertLine: { style: LineStyle.Dashed }, horzLine: { style: LineStyle.Dashed } },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addSeries(LineSeries, {
      color: lineColor,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    series.setData(
      points.map((p) => ({ time: p.trade_date as import("lightweight-charts").Time, value: p.close }))
    );

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [points, isDark]);

  return <div ref={containerRef} className="w-full" />;
}
