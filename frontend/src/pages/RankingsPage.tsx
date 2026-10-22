import { useEffect, useState } from "react";
import { useMarket } from "../context/MarketContext";
import { useTradingDays } from "../hooks/useTradingDays";
import { useRankings } from "../hooks/useRankings";
import { DatePicker } from "../components/rankings/DatePicker";
import { TopNSelector } from "../components/rankings/TopNSelector";
import { RankingTable } from "../components/rankings/RankingTable";
import { PersistencePanel } from "../components/rankings/PersistencePanel";
import { SkeletonTable } from "../components/common/Skeleton";
import { ErrorBanner } from "../components/common/ErrorBanner";
import { GlobalMarketsTable } from "../components/global-markets/GlobalMarketsTable";
import { ApiError } from "../api/client";
import { getDefaultTopN } from "../lib/preferences";
import { MARKET_CLOSE_LABEL, isWeekdayInMarket, todayInMarket } from "../lib/marketTime";
import type { ApiErrorDetail, Category } from "../api/types";

type RankTab = Category | "repeat";

const TABS: { value: RankTab; label: string }[] = [
  { value: "gainers", label: "Top Gainers" },
  { value: "losers", label: "Top Losers" },
  { value: "most_active", label: "Most Active" },
  { value: "repeat", label: "Repeat Appearances" },
];

const REPEAT_CATEGORIES: { value: Category; label: string }[] = [
  { value: "gainers", label: "Gainers" },
  { value: "losers", label: "Losers" },
  { value: "most_active", label: "Most Active" },
];

export function RankingsPage() {
  const { market } = useMarket();
  const [activeTab, setActiveTab] = useState<RankTab>("gainers");
  const [category, setCategory] = useState<Category>("gainers");
  const [repeatCategory, setRepeatCategory] = useState<Category>("gainers");
  const [topN, setTopN] = useState(getDefaultTopN);

  const { data: tradingDays } = useTradingDays(market, 60);
  const [date, setDate] = useState<string>("");

  useEffect(() => {
    setDate("");
  }, [market]);

  useEffect(() => {
    if (!tradingDays) return;
    setDate((current) =>
      current && tradingDays.dates.includes(current) ? current : (tradingDays.dates[0] ?? ""),
    );
  }, [tradingDays]);

  function handleTabChange(tab: RankTab) {
    setActiveTab(tab);
    if (tab !== "repeat") setCategory(tab);
  }

  const rankings = useRankings(market, date, category, topN);

  return (
    <div className="mx-auto max-w-[1800px] px-4 py-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="lg:col-span-3">
          {tradingDays &&
            !tradingDays.dates.includes(todayInMarket(market)) &&
            isWeekdayInMarket(market) && (
              <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                Today's rankings aren't out yet — India rankings are built
                from the official end-of-day file, published only after market close (
                {MARKET_CLOSE_LABEL[market]}). Showing the most recent available day below.
              </p>
            )}

          <div className="mb-4 flex flex-wrap items-center gap-4">
            {activeTab !== "repeat" && (
              <DatePicker market={market} date={date} onChange={setDate} />
            )}
            <TopNSelector topN={topN} onChange={setTopN} />
          </div>

          {/* Tab bar */}
          <div className="flex gap-0.5 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
            {TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => handleTabChange(t.value)}
                className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                  activeTab === t.value
                    ? "border-cyan-600 text-cyan-600 dark:border-cyan-400 dark:text-cyan-400"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Repeat category sub-selector */}
          {activeTab === "repeat" && (
            <div className="mt-3 flex flex-wrap gap-2">
              {REPEAT_CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setRepeatCategory(c.value)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    repeatCategory === c.value
                      ? "bg-cyan-600 text-white"
                      : "border border-slate-200 text-slate-600 hover:border-cyan-300 dark:border-slate-700 dark:text-slate-400 dark:hover:border-cyan-700"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}

          <div className="mt-4">
            {activeTab === "repeat" ? (
              <PersistencePanel market={market} category={repeatCategory} topN={topN} />
            ) : (
              <>
                {rankings.isLoading && <SkeletonTable />}
                {rankings.error && <RankingsError error={rankings.error} onJump={setDate} />}
                {rankings.data && !rankings.isLoading && (
                  <RankingTable market={market} items={rankings.data.items} />
                )}
              </>
            )}
          </div>
        </div>

        <div className="lg:col-span-1">
          <GlobalMarketsTable />
        </div>
      </div>
    </div>
  );
}

function RankingsError({ error, onJump }: { error: unknown; onJump: (date: string) => void }) {
  if (error instanceof ApiError && error.status === 404) {
    const detail = error.detail as ApiErrorDetail;
    if (detail?.nearest_available_date) {
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          No data for this date.{" "}
          <button
            onClick={() => onJump(detail.nearest_available_date as string)}
            className="font-medium underline"
          >
            Jump to nearest available date ({detail.nearest_available_date})
          </button>
        </div>
      );
    }
  }
  return <ErrorBanner message="Failed to load rankings." />;
}
