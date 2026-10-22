import { Link } from "react-router-dom";
import { useMarket } from "../context/MarketContext";
import { useTradingDays } from "../hooks/useTradingDays";
import { useRankings } from "../hooks/useRankings";
import { useWatchlist } from "../hooks/useWatchlist";
import { useHoldingsSummary } from "../hooks/useHoldings";
import { RankingTable } from "../components/rankings/RankingTable";
import { WatchlistTable } from "../components/watchlist/WatchlistTable";
import { PortfolioSummaryCards } from "../components/portfolio/PortfolioSummaryCards";
import { GlobalMarketsTable } from "../components/global-markets/GlobalMarketsTable";
import { EarningsCalendarWidget } from "../components/dashboard/EarningsCalendarWidget";
import { FiiDiiWidget } from "../components/dashboard/FiiDiiWidget";
import { SkeletonCards, SkeletonTable } from "../components/common/Skeleton";

function SectionHeader({ title, linkTo, linkLabel }: { title: string; linkTo: string; linkLabel: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-sm font-semibold font-mono uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </h3>
      <Link to={linkTo} className="text-xs font-medium text-cyan-600 hover:underline dark:text-cyan-400">
        {linkLabel} &rarr;
      </Link>
    </div>
  );
}

export function DashboardPage() {
  const { market } = useMarket();
  const { data: tradingDays } = useTradingDays(market, 1);
  const latestDate = tradingDays?.dates[0] ?? "";

  const rankings = useRankings(market, latestDate, "gainers", 5);
  const watchlist = useWatchlist("ALL");
  const holdingsSummary = useHoldingsSummary();

  return (
    <div className="mx-auto max-w-[1800px] px-4 py-6">
      <h2 className="mb-6 font-mono text-lg font-semibold text-slate-900 dark:text-slate-100">Stock Mantra</h2>

      <div className="mb-8">
        {holdingsSummary.isLoading && <SkeletonCards />}
        {holdingsSummary.data && <PortfolioSummaryCards summary={holdingsSummary.data} />}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-8">
          <div>
            <SectionHeader title="Today's Top Gainers" linkTo="/rankings" linkLabel="See all rankings" />
            {rankings.isLoading && <SkeletonTable rows={5} />}
            {rankings.data && <RankingTable market={market} items={rankings.data.items} />}
          </div>

          <div>
            <SectionHeader title="Watchlist" linkTo="/watchlist" linkLabel="Manage watchlist" />
            {watchlist.isLoading && <SkeletonTable rows={4} />}
            {watchlist.data && <WatchlistTable items={watchlist.data.items} />}
          </div>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <GlobalMarketsTable />
          <EarningsCalendarWidget market={market} />
          {market === "IN" && <FiiDiiWidget />}
        </div>
      </div>
    </div>
  );
}
