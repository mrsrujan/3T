import { useNavigate } from "react-router-dom";
import { SETUP_META, type Market, type ScannerSetup, type ScreenerItem } from "../../api/types";

const COLOR_MAP: Record<string, string> = {
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  cyan:    "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
  amber:   "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  red:     "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  purple:  "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  blue:    "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  orange:  "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
};

function SetupBadge({ setup }: { setup: ScannerSetup }) {
  const meta = SETUP_META[setup];
  return (
    <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${COLOR_MAP[meta.color]}`}>
      {meta.label}
    </span>
  );
}

function fmt(v: number | null, d = 2) {
  return v == null ? "—" : v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtMCap(v: number | null) {
  if (v == null) return "—";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}
function pctClass(v: number | null) {
  return v == null ? "text-slate-400" : v >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
}

export function ScreenerTable({ items, market }: { items: ScreenerItem[]; market: Market }) {
  const navigate = useNavigate();
  if (items.length === 0) return (
    <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">No stocks matched your filters.</p>
  );

  return (
    <div className="overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="w-full min-w-[800px] text-sm">
        <thead className="sticky top-0 bg-slate-100 text-xs font-mono uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          <tr>
            {["Symbol", "Name", "Sector", "Close", "% Chg", "Volume", "Rel Vol", "Mkt Cap", "Setups"].map(h => (
              <th key={h} className="px-3 py-2 text-left">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((item) => (
            <tr key={item.symbol} onClick={() => navigate(`/stock/${market}/${item.symbol}`)}
              className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="px-3 py-2 font-medium text-cyan-600 dark:text-cyan-400">{item.symbol}</td>
              <td className="max-w-[160px] truncate px-3 py-2 text-slate-500 dark:text-slate-400">{item.name ?? "—"}</td>
              <td className="max-w-[140px] truncate px-3 py-2 text-xs text-slate-500">{item.sector ?? "—"}</td>
              <td className="px-3 py-2 font-mono tabular-nums">{fmt(item.close)}</td>
              <td className={`px-3 py-2 font-mono tabular-nums font-medium ${pctClass(item.pct_change)}`}>
                {item.pct_change == null ? "—" : `${item.pct_change >= 0 ? "+" : ""}${fmt(item.pct_change)}%`}
              </td>
              <td className="px-3 py-2 font-mono tabular-nums">{item.volume?.toLocaleString() ?? "—"}</td>
              <td className="px-3 py-2 font-mono tabular-nums">{item.rel_volume == null ? "—" : `${fmt(item.rel_volume)}x`}</td>
              <td className="px-3 py-2 font-mono tabular-nums">{fmtMCap(item.market_cap)}</td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {item.setups?.map(s => <SetupBadge key={s} setup={s} />)}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
