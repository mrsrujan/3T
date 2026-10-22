import { useQuery } from "@tanstack/react-query";
import { getNewsSentiment } from "../api/client";
import type { Market } from "../api/types";

export function useNewsSentiment(market: Market, symbol: string, name = "") {
  return useQuery({
    queryKey: ["news-sentiment", market, symbol],
    queryFn: () => getNewsSentiment(market, symbol, name),
    enabled: !!symbol,
    staleTime: 30 * 60 * 1000,  // 30 min
  });
}
