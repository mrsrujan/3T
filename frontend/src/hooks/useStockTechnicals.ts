import { useQuery } from "@tanstack/react-query";
import { getStockTechnicals } from "../api/client";
import type { Market } from "../api/types";

export function useStockTechnicals(market: Market, symbol: string) {
  return useQuery({
    queryKey: ["stock-technicals", market, symbol],
    queryFn: () => getStockTechnicals(market, symbol),
    staleTime: 30 * 60 * 1000,
    enabled: Boolean(market && symbol),
  });
}
