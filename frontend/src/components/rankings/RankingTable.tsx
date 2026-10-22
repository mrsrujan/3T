import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { Market, RankingItem } from "../../api/types";
import { getStockDetail } from "../../api/client";
import { ExportCsvButton } from "../common/ExportCsvButton";
import { WatchlistStarButton } from "../common/WatchlistStarButton";
import { Sparkline } from "../common/Sparkline";

interface Props {
  market: Market;
  items: RankingItem[];
  filename?: string;
}

function formatNumber(value: number | null, fractionDigits = 2): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function formatVolume(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString();
}

type SortKey = "close" | "pct_change" | "volume" | "rel_volume";
type SortState = { key: SortKey; dir: "asc" | "desc" } | null;

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
}) {
  const active = sort?.key === sortKey;
  return (
    <th
      className="cursor-pointer select-none px-3 py-2 text-right hover:text-slate-700 dark:hover:text-slate-200"
      onClick={() => onSort(sortKey)}
    >
      {label}
      <span className={`ml-0.5 inline-block w-2 ${active ? "" : "opacity-0"}`}>
        {active && sort?.dir === "asc" ? "▲" : "▼"}
      </span>
    </th>
  );
}

function pctClassOf(pct: number | null): string {
  return pct === null
    ? "text-slate-400"
    : pct >= 0
      ? "text-green-600 dark:text-green-400"
      : "text-red-600 dark:text-red-400";
}

export function RankingTable({ market, items, filename = "rankings" }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const prefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sort, setSort] = useState<SortState>(null);

  function handleMouseEnter(symbol: string) {
    prefetchTimer.current = setTimeout(() => {
      queryClient.prefetchQuery({
        queryKey: ["stock-detail", market, symbol],
        queryFn: () => getStockDetail(market, symbol),
        staleTime: 2 * 60 * 1000,
      });
    }, 200);
  }

  function handleMouseLeave() {
    if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
  }

  const sorted = useMemo(() => {
    if (!sort) return items;
    const { key, dir } = sort;
    return [...items].sort((a, b) => {
      const av = a[key] ?? Number.NEGATIVE_INFINITY;
      const bv = b[key] ?? Number.NEGATIVE_INFINITY;
      return dir === "asc" ? av - bv : bv - av;
    });
  }, [items, sort]);

  function handleSort(key: SortKey) {
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: "desc" };
      if (prev.dir === "desc") return { key, dir: "asc" };
      return null; // third click restores the server's ranking order
    });
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        No data for this selection.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <ExportCsvButton
          rows={sorted}
          columns={[
            { key: "symbol", header: "Symbol" },
            { key: "name", header: "Name" },
            { key: "sector", header: "Sector" },
            { key: "close", header: "Close" },
            { key: "pct_change", header: "% Change" },
            { key: "volume", header: "Volume" },
            { key: "rel_volume", header: "Rel Volume" },
          ]}
          filename={`${filename}.csv`}
        />
      </div>

      {/* Compact cards below sm - tables with 9 columns are unusable on phones. */}
      <div className="space-y-2 sm:hidden">
        {sorted.map((item, idx) => (
          <button
            key={item.symbol}
            onClick={() => navigate(`/stock/${market}/${item.symbol}`)}
            className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left dark:border-slate-800"
          >
            <span className="w-5 shrink-0 text-xs text-slate-400">{idx + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-sm font-semibold text-cyan-600 dark:text-cyan-400">
                  {item.symbol}
                </span>
                <span className="truncate text-xs text-slate-500 dark:text-slate-400">{item.name}</span>
              </div>
              <div className="mt-0.5 text-xs text-slate-400">
                Vol {formatVolume(item.volume)}
                {item.rel_volume !== null && ` · ${formatNumber(item.rel_volume)}x`}
              </div>
            </div>
            <Sparkline values={item.spark} width={56} height={20} />
            <div className="w-20 shrink-0 text-right">
              <div className="font-mono text-sm tabular-nums">{formatNumber(item.close)}</div>
              <div className={`font-mono text-xs font-medium tabular-nums ${pctClassOf(item.pct_change)}`}>
                {item.pct_change === null
                  ? "—"
                  : `${item.pct_change >= 0 ? "+" : ""}${formatNumber(item.pct_change)}%`}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Full table from sm up; vertical max-height so the sticky header has
          a scroll container to stick within. */}
      <div className="hidden max-h-[75vh] overflow-auto rounded-lg border border-slate-200 dark:border-slate-800 sm:block">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100 text-left text-xs font-mono uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2"></th>
              <th className="px-3 py-2">Symbol</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Sector</th>
              <th className="px-3 py-2">30D</th>
              <SortableHeader label="Close" sortKey="close" sort={sort} onSort={handleSort} />
              <SortableHeader label="% Change" sortKey="pct_change" sort={sort} onSort={handleSort} />
              <SortableHeader label="Volume" sortKey="volume" sort={sort} onSort={handleSort} />
              <SortableHeader label="Rel. Volume" sortKey="rel_volume" sort={sort} onSort={handleSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {sorted.map((item, idx) => (
              <tr
                key={item.symbol}
                onClick={() => navigate(`/stock/${market}/${item.symbol}`)}
                onMouseEnter={() => handleMouseEnter(item.symbol)}
                onMouseLeave={handleMouseLeave}
                className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/60"
              >
                <td className="px-3 py-2 text-slate-400">{idx + 1}</td>
                <td className="px-3 py-2">
                  <WatchlistStarButton market={market} symbol={item.symbol} />
                </td>
                <td className="px-3 py-2 font-medium text-cyan-600 dark:text-cyan-400">{item.symbol}</td>
                <td className="max-w-[200px] truncate px-3 py-2 text-slate-500 dark:text-slate-400">
                  {item.name ?? "—"}
                </td>
                <td className="max-w-[180px] truncate px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                  {item.sector ?? "—"}
                </td>
                <td className="px-3 py-1">
                  <Sparkline values={item.spark} />
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{formatNumber(item.close)}</td>
                <td className={`px-3 py-2 text-right font-mono tabular-nums font-medium ${pctClassOf(item.pct_change)}`}>
                  {item.pct_change === null
                    ? "—"
                    : `${item.pct_change >= 0 ? "+" : ""}${formatNumber(item.pct_change)}%`}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{formatVolume(item.volume)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {item.rel_volume === null ? "—" : `${formatNumber(item.rel_volume)}x`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
