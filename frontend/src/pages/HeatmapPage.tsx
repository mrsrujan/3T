import { useEffect, useState } from "react";
import { useMarket } from "../context/MarketContext";
import { useTradingDays } from "../hooks/useTradingDays";
import { useHeatmap } from "../hooks/useHeatmap";
import { DatePicker } from "../components/rankings/DatePicker";
import { SectorHeatmap } from "../components/heatmap/SectorHeatmap";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { ErrorBanner } from "../components/common/ErrorBanner";
import { ApiError } from "../api/client";
import type { ApiErrorDetail } from "../api/types";

export function HeatmapPage() {
  const { market } = useMarket();
  const { data: tradingDays } = useTradingDays(market, 60);
  const [date, setDate] = useState("");

  useEffect(() => {
    setDate("");
  }, [market]);

  useEffect(() => {
    if (!tradingDays) return;
    setDate((current) => (current && tradingDays.dates.includes(current) ? current : (tradingDays.dates[0] ?? "")));
  }, [tradingDays]);

  const { data, isLoading, error } = useHeatmap(market, date);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <DatePicker market={market} date={date} onChange={setDate} />
      </div>

      {isLoading && <LoadingSpinner label="Loading heatmap…" />}
      {error && <HeatmapError error={error} onJump={setDate} />}
      {data && !isLoading && <SectorHeatmap market={market} sectors={data.sectors} />}
    </div>
  );
}

function HeatmapError({ error, onJump }: { error: unknown; onJump: (date: string) => void }) {
  if (error instanceof ApiError && error.status === 404) {
    const detail = error.detail as ApiErrorDetail;
    if (detail?.nearest_available_date) {
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          No data for this date.{" "}
          <button onClick={() => onJump(detail.nearest_available_date as string)} className="font-medium underline">
            Jump to nearest available date ({detail.nearest_available_date})
          </button>
        </div>
      );
    }
  }
  return <ErrorBanner message="Failed to load heatmap." />;
}
