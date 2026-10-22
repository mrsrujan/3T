import { useQuery } from "@tanstack/react-query";
import { getNews } from "../api/client";
import type { Market } from "../api/types";

export function useNews(market: Market | null, symbol: string | null, name?: string | null) {
  return useQuery({
    queryKey: ["news", market, symbol, name],
    queryFn: () => getNews(market as Market, symbol as string, name),
    enabled: Boolean(market && symbol),
  });
}
