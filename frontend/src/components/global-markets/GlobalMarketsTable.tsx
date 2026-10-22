import { useState } from "react";
import { useGlobalMarkets } from "../../hooks/useGlobalMarkets";
import { useSymbolHistory } from "../../hooks/useSymbolHistory";
import { FlagIcon, type FlagCode } from "../common/FlagIcon";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { SymbolMiniChart } from "./SymbolMiniChart";
import type { GlobalMarketItem } from "../../api/types";

const RANGE_OPTIONS = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
  { label: "5Y", days: 1825 },
];

function formatNumber(value: number | null, digits = 2): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function ChangeCell({ item }: { item: GlobalMarketItem }) {
  const pct = item.change_pct;
  const pctClass =
    pct === null
      ? "text-slate-400"
      : pct >= 0
        ? "text-green-600 dark:text-green-400"
        : "text-red-600 dark:text-red-400";
  return (
    <td className={`px-3 py-2 text-right font-mono tabular-nums font-medium ${pctClass}`}>
      {item.change_value === null
        ? "—"
        : `${item.change_value >= 0 ? "+" : ""}${formatNumber(item.change_value)} (${pct !== null ? `${pct >= 0 ? "+" : ""}${formatNumber(pct)}%` : "—"})`}
    </td>
  );
}

function ExpandedChart({ symbol, name, days }: { symbol: string; name: string; days: number }) {
  const { data, isLoading } = useSymbolHistory(symbol, days);
  return (
    <tr>
      <td colSpan={4} className="bg-slate-50 px-3 py-3 dark:bg-slate-800/50">
        <p className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{name}</p>
        {isLoading && <p className="text-xs text-slate-400">Loading chart…</p>}
        {data && data.points.length > 0 && <SymbolMiniChart points={data.points} />}
        {data && data.points.length === 0 && (
          <p className="text-xs text-slate-400">No history available.</p>
        )}
      </td>
    </tr>
  );
}

function GlobalMarketsGroup({
  title,
  items,
  showFlag,
  selectedSymbol,
  selectedDays,
  onSelect,
}: {
  title: string;
  items: GlobalMarketItem[];
  showFlag: boolean;
  selectedSymbol: string | null;
  selectedDays: number;
  onSelect: (symbol: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-100 text-left text-xs font-mono uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          <tr>
            <th className="px-3 py-2" colSpan={2}>
              {title}
            </th>
            <th className="px-3 py-2 text-right">Price</th>
            <th className="px-3 py-2 text-right">Change</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((item) => (
            <>
              <tr
                key={item.symbol}
                onClick={() => onSelect(item.symbol)}
                className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                  selectedSymbol === item.symbol ? "bg-slate-50 dark:bg-slate-800/50" : ""
                }`}
              >
                <td className="px-3 py-2">
                  {showFlag && <FlagIcon code={item.code as FlagCode} className="h-4 w-6 rounded-[1px]" />}
                </td>
                <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200">{item.name}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{formatNumber(item.price)}</td>
                <ChangeCell item={item} />
              </tr>
              {selectedSymbol === item.symbol && (
                <ExpandedChart key={`${item.symbol}-chart`} symbol={item.symbol} name={item.name} days={selectedDays} />
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GlobalMarketsTable() {
  const { data, isLoading, error, refetch, isFetching } = useGlobalMarkets();
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [days, setDays] = useState(180);

  function handleSelect(symbol: string) {
    setSelectedSymbol((prev) => (prev === symbol ? null : symbol));
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold font-mono uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Global Markets
          </h3>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh"
            className="rounded p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-40 dark:hover:text-slate-200"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
        {selectedSymbol && (
          <div className="flex gap-1">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                onClick={() => setDays(opt.days)}
                className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                  days === opt.days
                    ? "bg-cyan-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {isLoading && <LoadingSpinner label="Loading global markets…" />}
      {error && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Failed to load global markets.</p>
      )}
      {data && (
        <div className="flex flex-col gap-4">
          <GlobalMarketsGroup
            title="World Indexes"
            items={data.indexes}
            showFlag
            selectedSymbol={selectedSymbol}
            selectedDays={days}
            onSelect={handleSelect}
          />
          <GlobalMarketsGroup
            title="Commodities (USD)"
            items={data.commodities}
            showFlag={false}
            selectedSymbol={selectedSymbol}
            selectedDays={days}
            onSelect={handleSelect}
          />
        </div>
      )}
    </div>
  );
}
