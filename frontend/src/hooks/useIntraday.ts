import { useQuery } from "@tanstack/react-query";
import { getIntraday } from "../api/client";
import type { Market } from "../api/types";

export function useIntraday(market: Market, symbol: string, enabled = true) {
  return useQuery({
    queryKey: ["intraday", market, symbol],
    queryFn: () => getIntraday(market, symbol),
    enabled: Boolean(market && symbol) && enabled,
    refetchInterval: 60 * 1000,
    staleTime: 45 * 1000,
  });
}
