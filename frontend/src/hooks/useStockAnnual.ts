import { useQuery } from "@tanstack/react-query";
import { getStockAnnual } from "../api/client";
import type { Market } from "../api/types";

export function useStockAnnual(market: Market, symbol: string) {
  return useQuery({
    queryKey: ["stock-annual", market, symbol],
    queryFn: () => getStockAnnual(market, symbol),
    enabled: Boolean(market && symbol),
    staleTime: 6 * 60 * 60 * 1000,
  });
}
