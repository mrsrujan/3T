import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAlertRule,
  deleteAlertRule,
  getAlertRules,
  getAlertTriggers,
  markTriggersRead,
  setAlertRuleActive,
} from "../api/client";
import type { AlertRuleCreateRequest, AlertRulesResponse, Market } from "../api/types";

export function useAlertRules(market?: Market) {
  return useQuery({
    queryKey: ["alert-rules", market ?? "ALL"],
    queryFn: () => getAlertRules(market),
  });
}

export function useAlertRuleMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["alert-rules"] });

  const create = useMutation({
    mutationFn: (payload: AlertRuleCreateRequest) => createAlertRule(payload),
    onSuccess: invalidate,
  });

  const setActive = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      setAlertRuleActive(id, isActive),
    onMutate: async ({ id, isActive }) => {
      await queryClient.cancelQueries({ queryKey: ["alert-rules"] });
      const prev = queryClient.getQueryData(["alert-rules", "ALL"]);
      queryClient.setQueriesData<AlertRulesResponse>(
        { queryKey: ["alert-rules"] },
        (old) => {
          if (!old) return old;
          return {
            items: old.items.map((r) =>
              r.id === id ? { ...r, is_active: isActive } : r
            ),
          };
        }
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["alert-rules", "ALL"], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["alert-rules"] }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteAlertRule(id),
    onSuccess: invalidate,
  });

  return { create, setActive, remove };
}

// Unread triggers drive the NavBar bell badge - polled so a background
// refresh's new triggers show up without a manual page reload.
export function useAlertTriggers(unreadOnly = false) {
  return useQuery({
    queryKey: ["alert-triggers", unreadOnly],
    queryFn: () => getAlertTriggers(unreadOnly),
    refetchInterval: 60 * 1000,
  });
}

export function useMarkTriggersRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (triggerIds?: number[]) => markTriggersRead(triggerIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alert-triggers"] }),
  });
}
