import { useQuery } from "@tanstack/react-query";
import { getRefreshStatus } from "../api/client";
import type { Market } from "../api/types";

const POLL_INTERVAL_MS = 3000;

export function useRefreshStatus(market?: Market) {
  return useQuery({
    queryKey: ["refresh-status", market ?? "any"],
    queryFn: () => getRefreshStatus(market),
    retry: false,
    refetchInterval: (query) => (query.state.data?.status === "running" ? POLL_INTERVAL_MS : false),
  });
}
