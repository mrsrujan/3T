import { useQuery } from "@tanstack/react-query";
import { getPersistence, type PersistenceParams } from "../api/client";

export function usePersistence(params: PersistenceParams) {
  return useQuery({
    queryKey: ["persistence", params],
    queryFn: () => getPersistence(params),
    staleTime: 5 * 60 * 1000,  // 5 min
    enabled: params.mode === "last_n" ? Boolean(params.n) : Boolean(params.dates?.length),
  });
}
