import { SETUP_META, type Market, type ScannerSetup, type ScreenerParams, type MarketCapTier, type ScreenerSortBy } from "../../api/types";

const ALL_SETUPS = Object.keys(SETUP_META) as ScannerSetup[];

interface Props {
  market: Market;
  filters: Omit<ScreenerParams, "market">;
  onChange: (f: Omit<ScreenerParams, "market">) => void;
  sectors: string[];
}

export function FilterPanel({ market: _market, filters, onChange, sectors }: Props) {
  function set<K extends keyof typeof filters>(key: K, value: typeof filters[K]) {
    onChange({ ...filters, [key]: value || undefined });
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Filters</h3>

      {sectors.length > 0 && (
        <div>
          <label className="mb-1 block text-xs text-slate-500">Sector</label>
          <select
            value={filters.sector ?? ""}
            onChange={(e) => set("sector", e.target.value || undefined)}
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="">All sectors</option>
            {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs text-slate-500">Min % Change</label>
          <input type="number" step="0.1" value={filters.min_pct_change ?? ""}
            onChange={(e) => set("min_pct_change", e.target.value ? parseFloat(e.target.value) : undefined)}
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Max % Change</label>
          <input type="number" step="0.1" value={filters.max_pct_change ?? ""}
            onChange={(e) => set("max_pct_change", e.target.value ? parseFloat(e.target.value) : undefined)}
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-slate-500">Min Rel. Volume</label>
        <input type="number" step="0.1" min="0" value={filters.min_rel_volume ?? ""}
          onChange={(e) => set("min_rel_volume", e.target.value ? parseFloat(e.target.value) : undefined)}
          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-slate-500">Market Cap</label>
        <div className="flex gap-1">
          {(["small", "mid", "large"] as MarketCapTier[]).map((t) => (
            <button key={t} onClick={() => set("market_cap_tier", filters.market_cap_tier === t ? undefined : t)}
              className={`flex-1 rounded-md px-2 py-1 text-xs font-medium capitalize ${
                filters.market_cap_tier === t
                  ? "bg-cyan-600 text-white"
                  : "border border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300"
              }`}
            >{t}</button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-slate-500">Technical Setups</label>
        <div className="flex flex-wrap gap-1.5">
          {ALL_SETUPS.map(setup => {
            const active = (filters.setups ?? []).includes(setup);
            return (
              <button
                key={setup}
                onClick={() => {
                  const cur = filters.setups ?? [];
                  set("setups", active ? cur.filter(s => s !== setup) : [...cur, setup]);
                }}
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border transition-colors ${
                  active
                    ? "border-cyan-500 bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300"
                    : "border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400"
                }`}
              >
                {SETUP_META[setup].label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-slate-500">Sort By</label>
        <select value={filters.sort_by ?? "pct_change"}
          onChange={(e) => set("sort_by", e.target.value as ScreenerSortBy)}
          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <option value="pct_change">% Change</option>
          <option value="volume">Volume</option>
          <option value="rel_volume">Rel. Volume</option>
          <option value="market_cap">Market Cap</option>
        </select>
      </div>
    </div>
  );
}
