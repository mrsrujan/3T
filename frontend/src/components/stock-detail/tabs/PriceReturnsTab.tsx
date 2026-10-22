import { PriceVolumeChart } from "../PriceVolumeChart";
import { PeerComparisonTable } from "../PeerComparisonTable";
import { StockNewsInline } from "../StockNewsInline";
import { SkeletonChart } from "../../common/Skeleton";
import { useStockHistory } from "../../../hooks/useStockHistory";
import type { Market, StockDetailResponse } from "../../../api/types";

interface Props {
  market: Market;
  symbol: string;
  detail: StockDetailResponse;
  livePrice?: number | null;
}

// Chart indicators (RSI/MACD/BB) and the Technical Signals panel (RSI 14,
// SMA 50/200, 52W distance, 3M/1M returns, scanner setups) all need many
// more trading days than the 7-day history config provides. Omitted here.
export function PriceReturnsTab({ market, symbol, detail }: Props) {
  const { data: history, isLoading: histLoading } = useStockHistory(market, symbol, 30);

  return (
    <div className="mt-4 space-y-6">
      <div>
        {histLoading && <SkeletonChart />}
        {history && history.points.length > 0 && (
          <PriceVolumeChart points={history.points} visibleDays={30} />
        )}
        {history && history.points.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">No price history available.</p>
        )}
      </div>

      <details className="group">
        <summary className="cursor-pointer list-none text-sm font-medium text-cyan-700 hover:text-cyan-600 dark:text-cyan-400">
          <span className="mr-1 inline-block transition-transform group-open:rotate-90">▶</span>
          Peer comparison (same sector, starter universe)
        </summary>
        <div className="mt-3">
          <PeerComparisonTable market={market} symbol={symbol} />
        </div>
      </details>

      <StockNewsInline market={market} symbol={symbol} name={detail.name} />
    </div>
  );
}
