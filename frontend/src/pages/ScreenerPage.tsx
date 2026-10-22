import { useMemo, useState } from "react";
import { useMarket } from "../context/MarketContext";
import { useScreener } from "../hooks/useScreener";
import { FilterPanel } from "../components/screener/FilterPanel";
import { ScreenerTable } from "../components/screener/ScreenerTable";
import { SkeletonTable } from "../components/common/Skeleton";
import type { ScreenerParams } from "../api/types";

export function ScreenerPage() {
  const { market } = useMarket();
  const [filters, setFilters] = useState<Omit<ScreenerParams, "market">>({});
  const { data, isLoading } = useScreener({ market, ...filters, setups: undefined, limit: 200 });

  const filteredItems = useMemo(() => {
    if (!data?.items) return [];
    const want = filters.setups;
    if (!want?.length) return data.items;
    return data.items.filter(item => want.some(s => item.setups?.includes(s)));
  }, [data, filters.setups]);

  const sectors = [...new Set(data?.items.map(i => i.sector).filter(Boolean) as string[])].sort();

  return (
    <div className="mx-auto max-w-[1800px] px-4 py-6">
      <h2 className="mb-6 text-base font-semibold text-slate-900 dark:text-slate-100">Stock Screener</h2>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <FilterPanel market={market} filters={filters} onChange={setFilters} sectors={sectors} />
        </div>
        <div className="lg:col-span-3">
          {data && (
            <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
              {filteredItems.length} stock{filteredItems.length === 1 ? "" : "s"} matched · {data.date}
            </p>
          )}
          {isLoading && <SkeletonTable />}
          {data && <ScreenerTable items={filteredItems} market={market} />}
        </div>
      </div>
    </div>
  );
}
