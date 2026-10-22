import { useQuery } from "@tanstack/react-query";
import { getStockPeers } from "../api/client";
import type { Market } from "../api/types";

export function useStockPeers(market: Market, symbol: string, limit = 10) {
  return useQuery({
    queryKey: ["stock-peers", market, symbol, limit],
    queryFn: () => getStockPeers(market, symbol, limit),
    enabled: Boolean(market && symbol),
  });
}
