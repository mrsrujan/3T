import { useNavigate } from "react-router-dom";
import type { Market, PersistenceItem } from "../../api/types";
import { ExportCsvButton } from "../common/ExportCsvButton";
import { WatchlistStarButton } from "../common/WatchlistStarButton";

interface Props {
  market: Market;
  items: PersistenceItem[];
  filename?: string;
}

function formatNumber(value: number | null, digits = 2): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function PersistenceTable({ market, items, filename = "persistence" }: Props) {
  const navigate = useNavigate();

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        No stock matched for this selection.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <ExportCsvButton
          rows={items}
          columns={[
            { key: "symbol", header: "Symbol" },
            { key: "name", header: "Name" },
            { key: "sector", header: "Sector" },
            { key: "days_present", header: "Days Present" },
            { key: "num_dates_requested", header: "Days Requested" },
            { key: "avg_rank", header: "Avg Rank" },
            { key: "current_price", header: "Current Price" },
            { key: "change_value", header: "Change" },
            { key: "change_pct", header: "Change %" },
          ]}
          filename={`${filename}.csv`}
        />
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="bg-slate-100 text-left text-xs font-mono uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          <tr>
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2"></th>
            <th className="px-3 py-2">Symbol</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Sector</th>
            <th className="px-3 py-2 text-right">Days Present</th>
            <th className="px-3 py-2 text-right">Avg Rank</th>
            <th className="px-3 py-2 text-right">Current Price</th>
            <th className="px-3 py-2 text-right">Change (window)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((item, idx) => {
            const pct = item.change_pct;
            const pctClass =
              pct === null
                ? "text-slate-400"
                : pct >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400";
            return (
              <tr
                key={item.symbol}
                onClick={() => navigate(`/stock/${market}/${item.symbol}`)}
                className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/60"
              >
                <td className="px-3 py-2 text-slate-400">{idx + 1}</td>
                <td className="px-3 py-2">
                  <WatchlistStarButton market={market} symbol={item.symbol} />
                </td>
                <td className="px-3 py-2 font-medium text-cyan-600 dark:text-cyan-400">
                  {item.symbol}
                </td>
                <td className="max-w-[180px] truncate px-3 py-2 text-slate-500 dark:text-slate-400">
                  {item.name ?? "—"}
                </td>
                <td className="max-w-[160px] truncate px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                  {item.sector ?? "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {item.days_present} / {item.num_dates_requested}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{item.avg_rank.toFixed(1)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{formatNumber(item.current_price)}</td>
                <td className={`px-3 py-2 text-right font-mono tabular-nums font-medium ${pctClass}`}>
                  {item.change_value === null
                    ? "—"
                    : `${item.change_value >= 0 ? "+" : ""}${formatNumber(item.change_value)} (${pct !== null ? `${pct >= 0 ? "+" : ""}${formatNumber(pct)}%` : "—"})`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
