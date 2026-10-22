import { useNavigate } from "react-router-dom";
import { useAlertRuleMutations, useAlertRules } from "../../hooks/useAlerts";
import { FlagIcon } from "../common/FlagIcon";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { EmptyState } from "../common/EmptyState";
import type { AlertRuleType } from "../../api/types";

const RULE_TYPE_LABELS: Record<AlertRuleType, string> = {
  price_above: "Price rises above",
  price_below: "Price falls below",
  pct_change_above: "% change rises above",
  pct_change_below: "% change falls below",
  rel_volume_above: "Relative volume rises above",
};

export function AlertRulesList() {
  const { data, isLoading } = useAlertRules();
  const { setActive, remove } = useAlertRuleMutations();
  const navigate = useNavigate();

  if (isLoading) return <LoadingSpinner label="Loading alert rules…" />;
  if (!data || data.items.length === 0) {
    return (
      <EmptyState
        icon={<svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>}
        title="No alert rules set"
        description="No alert rules set. Create one from any stock's detail page."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-slate-100 text-left text-xs font-mono uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          <tr>
            <th className="px-3 py-2">Market</th>
            <th className="px-3 py-2">Symbol</th>
            <th className="px-3 py-2">Condition</th>
            <th className="px-3 py-2 text-right">Threshold</th>
            <th className="px-3 py-2 text-center">Active</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {data.items.map((rule) => (
            <tr
              key={rule.id}
              onClick={() => navigate(`/stock/${rule.market}/${rule.symbol}`)}
              className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/60"
            >
              <td className="px-3 py-2 text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <FlagIcon code={rule.market} /> {rule.market}
                </span>
              </td>
              <td className="px-3 py-2 font-medium text-cyan-600 dark:text-cyan-400">{rule.symbol}</td>
              <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{RULE_TYPE_LABELS[rule.rule_type]}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">{rule.threshold}</td>
              <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={rule.is_active}
                  onChange={(e) => setActive.mutate({ id: rule.id, isActive: e.target.checked })}
                />
              </td>
              <td className="px-3 py-2 text-right">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    remove.mutate(rule.id);
                  }}
                  className="text-xs text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
