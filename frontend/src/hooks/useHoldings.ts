import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createHolding,
  deleteHolding,
  getHoldings,
  getHoldingsSummary,
  sellHolding,
  updateHolding,
} from "../api/client";
import type { HoldingCreateRequest, HoldingUpdateRequest, HoldingsResponse } from "../api/types";

export function useHoldings() {
  return useQuery({
    queryKey: ["holdings"],
    queryFn: getHoldings,
  });
}

export function useHoldingsSummary() {
  return useQuery({
    queryKey: ["holdings-summary"],
    queryFn: getHoldingsSummary,
  });
}

export function useHoldingsMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["holdings"] });
    queryClient.invalidateQueries({ queryKey: ["holdings-summary"] });
  };

  const create = useMutation({
    mutationFn: (payload: HoldingCreateRequest) => createHolding(payload),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: HoldingUpdateRequest }) => updateHolding(id, payload),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteHolding(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["holdings"] });
      const prev = queryClient.getQueryData(["holdings"]);
      queryClient.setQueryData<HoldingsResponse>(["holdings"], (old) => {
        if (!old) return old;
        return { items: old.items.filter((h) => h.id !== id) };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["holdings"], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
      queryClient.invalidateQueries({ queryKey: ["holdings-summary"] });
    },
  });

  const sell = useMutation({
    mutationFn: ({ id, sellPrice, sellDate }: { id: number; sellPrice: number; sellDate: string }) =>
      sellHolding(id, sellPrice, sellDate),
    onSuccess: invalidate,
  });

  return { create, update, remove, sell };
}
