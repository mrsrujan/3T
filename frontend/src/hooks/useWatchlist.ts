import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addToWatchlist, getWatchlist, removeFromWatchlist } from "../api/client";
import type { Market, WatchlistItem, WatchlistResponse } from "../api/types";

export function useWatchlist(market: Market | "ALL" = "ALL") {
  return useQuery({
    queryKey: ["watchlist", market],
    queryFn: () => getWatchlist(market),
    staleTime: 30 * 1000,  // 30 sec
  });
}

export function useWatchlistMutations() {
  const queryClient = useQueryClient();

  const add = useMutation({
    mutationFn: ({ market, symbol }: { market: Market; symbol: string }) =>
      addToWatchlist(market, symbol),
    onMutate: async ({ market, symbol }) => {
      await queryClient.cancelQueries({ queryKey: ["watchlist"] });
      const prev = queryClient.getQueriesData<WatchlistResponse>({ queryKey: ["watchlist"] });
      queryClient.setQueriesData<WatchlistResponse>({ queryKey: ["watchlist"] }, (old) => {
        if (!old) return old;
        const optimistic: WatchlistItem = {
          id: -1, market, symbol, name: null,
          added_at: new Date().toISOString(), close: null, pct_change: null,
        };
        return { items: [...old.items, optimistic] };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        for (const [queryKey, data] of ctx.prev) {
          queryClient.setQueryData(queryKey, data);
        }
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  const remove = useMutation({
    mutationFn: ({ market, symbol }: { market: Market; symbol: string }) =>
      removeFromWatchlist(market, symbol),
    onMutate: async ({ symbol }) => {
      await queryClient.cancelQueries({ queryKey: ["watchlist"] });
      const prev = queryClient.getQueriesData<WatchlistResponse>({ queryKey: ["watchlist"] });
      queryClient.setQueriesData<WatchlistResponse>({ queryKey: ["watchlist"] }, (old) => {
        if (!old) return old;
        return { items: old.items.filter((i) => i.symbol !== symbol) };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        for (const [queryKey, data] of ctx.prev) {
          queryClient.setQueryData(queryKey, data);
        }
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  return { add, remove };
}
