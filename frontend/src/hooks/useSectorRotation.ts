import { useQuery } from "@tanstack/react-query";
import { getSectorRotation } from "../api/client";
import type { Market } from "../api/types";

export function useSectorRotation(market: Market) {
  return useQuery({
    queryKey: ["sector-rotation", market],
    queryFn: () => getSectorRotation(market),
    staleTime: 10 * 60 * 1000,
  });
}
