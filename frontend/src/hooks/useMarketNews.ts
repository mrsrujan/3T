import { useQuery } from "@tanstack/react-query";
import { getMarketNews } from "../api/client";
import type { Market } from "../api/types";

export function useMarketNews(market: Market, limit = 20) {
  return useQuery({
    queryKey: ["market-news", market, limit],
    queryFn: () => getMarketNews(market, limit),
    staleTime: 10 * 60 * 1000,
  });
}
