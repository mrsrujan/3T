import { useQuery } from "@tanstack/react-query";
import { getGlobalMarkets } from "../api/client";

export function useGlobalMarkets() {
  return useQuery({
    queryKey: ["global-markets"],
    queryFn: getGlobalMarkets,
    staleTime: 3 * 60 * 1000,  // 3 min
    refetchInterval: 15 * 60 * 1000,
  });
}
