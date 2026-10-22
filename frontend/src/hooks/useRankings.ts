import { useQuery } from "@tanstack/react-query";
import { getRankings, ApiError } from "../api/client";
import type { Market, Category } from "../api/types";

export function useRankings(market: Market, date: string, category: Category, topN: number) {
  return useQuery({
    queryKey: ["rankings", market, date, category, topN],
    queryFn: () => getRankings(market, date, category, topN),
    staleTime: 5 * 60 * 1000,  // 5 min
    enabled: Boolean(date),
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 404) return false;
      return failureCount < 2;
    },
  });
}
