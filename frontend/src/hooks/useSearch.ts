import { useQuery } from "@tanstack/react-query";
import { searchSymbols } from "../api/client";
import type { Market } from "../api/types";

export function useSearch(query: string, market: Market | "ALL" = "ALL") {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ["search", trimmed, market],
    queryFn: () => searchSymbols(trimmed, market),
    enabled: trimmed.length > 0,
    staleTime: 30_000,
  });
}
