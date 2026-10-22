import { useQuery } from "@tanstack/react-query";
import { getEarnings } from "../api/client";
import type { Market } from "../api/types";

export function useEarnings(market: Market, symbols: string[]) {
  return useQuery({
    queryKey: ["earnings", market, symbols.slice().sort().join(",")],
    queryFn: () => getEarnings(market, symbols),
    enabled: symbols.length > 0,
    staleTime: 6 * 60 * 60 * 1000,  // 6 hours
  });
}
