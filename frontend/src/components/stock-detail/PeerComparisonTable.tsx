import { useNavigate } from "react-router-dom";
import { useStockPeers } from "../../hooks/useStockPeers";
import type { Market } from "../../api/types";

function fmt(v: number | null, d = 2): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function PeerComparisonTable({ market, symbol }: { market: Market; symbol: string }) {
  const { data, isLoading } = useStockPeers(market, symbol, 10);
  const navigate = useNavigate();

  if (isLoading) return null;
  if (!data || !data.sector) return null;

  const medianPe = data.sector_median_pe;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 dark:border-slate-800">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Peers — {data.sector}
        </h3>
        {medianPe && (
          <span className="text-xs text-slate-400">
            Sector median P/E: <span className="font-mono font-medium text-slate-600 dark:text-slate-300">{medianPe.toFixed(1)}x</span>
          </span>
        )}
      </div>
      {data.peers.length === 0 ? (
        <p className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">No peer data available.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40">
              <th className="py-1.5 pl-4 pr-2 text-left text-xs font-medium text-slate-400">Symbol</th>
              <th className="py-1.5 pr-2 text-left text-xs font-medium text-slate-400">Name</th>
              <th className="py-1.5 pr-2 text-right text-xs font-medium text-slate-400">Price</th>
              <th className="py-1.5 pr-2 text-right text-xs font-medium text-slate-400">Day %</th>
              <th className="py-1.5 pr-4 text-right text-xs font-medium text-slate-400">P/E</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.peers.map((peer) => {
              const pct = peer.pct_change;
              const pctClass =
                pct === null ? "text-slate-400"
                  : pct >= 0 ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400";
              const pePremium = peer.pe_ratio && medianPe
                ? ((peer.pe_ratio - medianPe) / medianPe) * 100
                : null;
              return (
                <tr
                  key={peer.symbol}
                  onClick={() => navigate(`/stock/${market}/${peer.symbol}`)}
                  className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/60"
                >
                  <td className="py-1.5 pl-4 pr-2 font-medium text-cyan-600 dark:text-cyan-400">{peer.symbol}</td>
                  <td className="max-w-[120px] truncate py-1.5 pr-2 text-xs text-slate-500 dark:text-slate-400">{peer.name ?? "—"}</td>
                  <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-200">{fmt(peer.close)}</td>
                  <td className={`py-1.5 pr-2 text-right font-mono tabular-nums font-medium ${pctClass}`}>
                    {pct === null ? "—" : `${pct >= 0 ? "+" : ""}${fmt(pct)}%`}
                  </td>
                  <td className="py-1.5 pr-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-300">
                    {peer.pe_ratio != null ? (
                      <span>
                        {fmt(peer.pe_ratio, 1)}
                        {pePremium !== null && (
                          <span className={`ml-1 text-xs ${pePremium > 15 ? "text-red-400" : pePremium < -15 ? "text-emerald-400" : "text-slate-400"}`}>
                            {pePremium >= 0 ? "+" : ""}{pePremium.toFixed(0)}%
                          </span>
                        )}
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {medianPe && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-800/20">
                <td colSpan={4} className="py-1.5 pl-4 text-xs font-medium text-slate-500">Sector median</td>
                <td className="py-1.5 pr-4 text-right font-mono text-xs font-semibold text-slate-600 dark:text-slate-300">{medianPe.toFixed(1)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </div>
  );
}
