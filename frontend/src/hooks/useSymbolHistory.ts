import { useQuery } from "@tanstack/react-query";
import { getSymbolHistory } from "../api/client";

export function useSymbolHistory(symbol: string | null, days = 180) {
  return useQuery({
    queryKey: ["symbol-history", symbol, days],
    queryFn: () => getSymbolHistory(symbol!, days),
    enabled: !!symbol,
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}
