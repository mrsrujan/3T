import { useQuery } from "@tanstack/react-query";
import { getScreener } from "../api/client";
import type { ScreenerParams } from "../api/types";

export function useScreener(params: ScreenerParams) {
  return useQuery({
    queryKey: ["screener", params],
    queryFn: () => getScreener(params),
    staleTime: 5 * 60 * 1000,
  });
}
