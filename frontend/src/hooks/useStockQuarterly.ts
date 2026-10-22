import { useQuery } from "@tanstack/react-query";
import { getStockQuarterly } from "../api/client";
import type { Market } from "../api/types";

export function useStockQuarterly(market: Market, symbol: string) {
  return useQuery({
    queryKey: ["stock-quarterly", market, symbol],
    queryFn: () => getStockQuarterly(market, symbol),
    enabled: Boolean(market && symbol),
    staleTime: 6 * 60 * 60 * 1000, // 6 hours — quarterly data changes slowly
  });
}
