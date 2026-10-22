import { useQuery } from "@tanstack/react-query";
import { getTradingDays } from "../api/client";
import type { Market } from "../api/types";

export function useTradingDays(market: Market, limit = 30) {
  return useQuery({
    queryKey: ["trading-days", market, limit],
    queryFn: () => getTradingDays(market, limit),
    staleTime: 10 * 60 * 1000,  // 10 min
  });
}
