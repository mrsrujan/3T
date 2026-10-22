import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getStockHistory } from "../api/client";
import type { Market } from "../api/types";

export function useStockHistory(market: Market, symbol: string, days = 180) {
  return useQuery({
    queryKey: ["stock-history", market, symbol, days],
    queryFn: () => getStockHistory(market, symbol, days),
    enabled: Boolean(market && symbol),
    // Keep showing the previous range's data while a new range loads, so
    // PriceVolumeChart never unmounts between range clicks and loses its
    // series-visibility checkbox state (Price/50 DMA/200 DMA/Volume).
    placeholderData: keepPreviousData,
  });
}
