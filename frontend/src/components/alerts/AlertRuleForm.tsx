import { useState } from "react";
import { useSearch } from "../../hooks/useSearch";
import { useAlertRuleMutations } from "../../hooks/useAlerts";
import type { AlertRuleType, Market } from "../../api/types";

const RULE_TYPE_LABELS: Record<AlertRuleType, string> = {
  price_above: "Price rises above",
  price_below: "Price falls below",
  pct_change_above: "% change rises above",
  pct_change_below: "% change falls below",
  rel_volume_above: "Relative volume rises above",
};

export function AlertRuleForm() {
  const [symbolQuery, setSymbolQuery] = useState("");
  const [selected, setSelected] = useState<{ market: Market; symbol: string } | null>(null);
  const [ruleType, setRuleType] = useState<AlertRuleType>("price_above");
  const [threshold, setThreshold] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: searchResults } = useSearch(symbolQuery);
  const { create } = useAlertRuleMutations();

  function reset() {
    setSymbolQuery("");
    setSelected(null);
    setThreshold("");
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!selected) {
      setError("Pick a stock from the search results first.");
      return;
    }
    const value = Number(threshold);
    if (!Number.isFinite(value)) {
      setError("Threshold must be a number.");
      return;
    }

    create.mutate(
      { market: selected.market, symbol: selected.symbol, rule_type: ruleType, threshold: value },
      { onSuccess: reset },
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
    >
      <div className="relative">
        <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
          Stock
          <input
            value={selected ? `${selected.symbol} (${selected.market})` : symbolQuery}
            onChange={(e) => {
              setSelected(null);
              setSymbolQuery(e.target.value);
            }}
            placeholder="Search symbol or name…"
            className="w-56 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          />
        </label>
        {!selected && symbolQuery.trim() && searchResults && searchResults.items.length > 0 && (
          <div className="absolute left-0 top-full z-10 mt-1 max-h-48 w-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {searchResults.items.map((item) => (
              <button
                type="button"
                key={`${item.market}-${item.symbol}`}
                onClick={() => {
                  setSelected({ market: item.market, symbol: item.symbol });
                  setSymbolQuery("");
                }}
                className="block w-full px-2.5 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {item.symbol} <span className="text-slate-400">({item.market})</span>
                {item.name && <span className="ml-1 text-slate-400">{item.name}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
        Condition
        <select
          value={ruleType}
          onChange={(e) => setRuleType(e.target.value as AlertRuleType)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          {Object.entries(RULE_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
        Threshold
        <input
          type="number"
          step="any"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        />
      </label>

      <button
        type="submit"
        disabled={create.isPending}
        className="rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
      >
        {create.isPending ? "Adding…" : "Add Alert"}
      </button>

      {error && <p className="w-full text-sm text-red-600 dark:text-red-400">{error}</p>}
      {create.isError && <p className="w-full text-sm text-red-600 dark:text-red-400">Failed to add alert.</p>}
    </form>
  );
}
