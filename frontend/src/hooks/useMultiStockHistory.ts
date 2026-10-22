import { useQueries } from "@tanstack/react-query";
import { getStockHistory } from "../api/client";
import type { Market } from "../api/types";

export interface CompareTarget {
  market: Market;
  symbol: string;
}

export function useMultiStockHistory(targets: CompareTarget[], days: number) {
  return useQueries({
    queries: targets.map((t) => ({
      queryKey: ["stock-history", t.market, t.symbol, days],
      queryFn: () => getStockHistory(t.market, t.symbol, days),
      enabled: Boolean(t.market && t.symbol),
    })),
  });
}
