import { useQuery } from "@tanstack/react-query";
import { getHeatmap } from "../api/client";
import type { Market } from "../api/types";

export function useHeatmap(market: Market, date: string) {
  return useQuery({
    queryKey: ["heatmap", market, date],
    queryFn: () => getHeatmap(market, date),
    staleTime: 5 * 60 * 1000,  // 5 min
    enabled: Boolean(market && date),
  });
}
