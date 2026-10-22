import { useQuery } from "@tanstack/react-query";
import { getStockDetail } from "../api/client";
import type { Market } from "../api/types";

export function useStockDetail(market: Market, symbol: string) {
  return useQuery({
    queryKey: ["stock-detail", market, symbol],
    queryFn: () => getStockDetail(market, symbol),
    staleTime: 2 * 60 * 1000,  // 2 min
    enabled: Boolean(market && symbol),
  });
}
