import { useQuery } from "@tanstack/react-query";
import { getLiveQuote } from "../api/client";
import type { Market } from "../api/types";

export function useLiveQuote(market: Market, symbol: string) {
  return useQuery({
    queryKey: ["live-quote", market, symbol],
    queryFn: () => getLiveQuote(market, symbol),
    enabled: Boolean(market && symbol),
    // Polls continuously; the backend returns is_market_open so the UI can
    // show a "Live" badge only when it's actually a live-updating price.
    refetchInterval: 30 * 1000,
    staleTime: 20 * 1000,
  });
}
