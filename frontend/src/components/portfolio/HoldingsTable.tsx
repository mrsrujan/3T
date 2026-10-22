import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { HoldingItem } from "../../api/types";
import { useHoldingsMutations } from "../../hooks/useHoldings";
import { FlagIcon } from "../common/FlagIcon";

function formatNumber(value: number | null, digits = 2): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function pnlClassOf(pnl: number | null): string {
  return pnl === null
    ? "text-slate-400"
    : pnl >= 0
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-red-600 dark:text-red-400";
}

const todayIso = () => new Intl.DateTimeFormat("en-CA").format(new Date());

function SellForm({ holding, onDone }: { holding: HoldingItem; onDone: () => void }) {
  const { sell } = useHoldingsMutations();
  const [price, setPrice] = useState(
    holding.current_price !== null ? holding.current_price.toFixed(2) : "",
  );
  const [date, setDate] = useState(todayIso());

  function confirm() {
    const p = Number(price);
    if (!p || p <= 0) return;
    sell.mutate({ id: holding.id, sellPrice: p, sellDate: date }, { onSuccess: onDone });
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
      <input
        type="number"
        step="any"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder="Sell price"
        className="w-24 rounded-lg border border-slate-300 px-2 py-1 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      />
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="rounded-lg border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      />
      <button
        onClick={confirm}
        disabled={sell.isPending}
        className="rounded-lg bg-cyan-600 px-2 py-1 text-xs font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
      >
        Confirm
      </button>
      <button onClick={onDone} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
        Cancel
      </button>
    </div>
  );
}

function OpenHoldingsTable({ items }: { items: HoldingItem[] }) {
  const navigate = useNavigate();
  const { remove } = useHoldingsMutations();
  const [sellingId, setSellingId] = useState<number | null>(null);

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="w-full min-w-[880px] text-sm">
        <thead className="bg-slate-100 text-left text-xs font-mono uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          <tr>
            <th className="px-3 py-2">Market</th>
            <th className="px-3 py-2">Symbol</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2 text-right">Qty</th>
            <th className="px-3 py-2 text-right">Buy Price</th>
            <th className="px-3 py-2">Buy Date</th>
            <th className="px-3 py-2 text-right">Current</th>
            <th className="px-3 py-2 text-right">Market Value</th>
            <th className="px-3 py-2 text-right">P&amp;L</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((h) => (
            <tr
              key={h.id}
              onClick={() => navigate(`/stock/${h.market}/${h.symbol}`)}
              className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/60"
            >
              <td className="px-3 py-2 text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <FlagIcon code={h.market} /> {h.market}
                </span>
              </td>
              <td className="px-3 py-2 font-medium text-cyan-600 dark:text-cyan-400">{h.symbol}</td>
              <td className="max-w-[160px] truncate px-3 py-2 text-slate-500 dark:text-slate-400">
                {h.name ?? "—"}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">{formatNumber(h.quantity)}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">{formatNumber(h.buy_price)}</td>
              <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{h.buy_date}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">{formatNumber(h.current_price)}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">{formatNumber(h.market_value)}</td>
              <td className={`px-3 py-2 text-right font-mono tabular-nums font-medium ${pnlClassOf(h.pnl)}`}>
                {h.pnl === null
                  ? "—"
                  : `${h.pnl >= 0 ? "+" : ""}${formatNumber(h.pnl)} (${h.pnl_pct !== null ? `${h.pnl >= 0 ? "+" : ""}${formatNumber(h.pnl_pct)}%` : "—"})`}
              </td>
              <td className="px-3 py-2 text-right">
                {sellingId === h.id ? (
                  <SellForm holding={h} onDone={() => setSellingId(null)} />
                ) : (
                  <span className="flex items-center justify-end gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSellingId(h.id);
                      }}
                      className="text-xs font-medium text-cyan-600 hover:underline dark:text-cyan-400"
                    >
                      Sell
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        remove.mutate(h.id);
                      }}
                      className="text-xs text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                    >
                      Remove
                    </button>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClosedHoldingsTable({ items }: { items: HoldingItem[] }) {
  const navigate = useNavigate();
  const { remove } = useHoldingsMutations();

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="bg-slate-100 text-left text-xs font-mono uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          <tr>
            <th className="px-3 py-2">Market</th>
            <th className="px-3 py-2">Symbol</th>
            <th className="px-3 py-2 text-right">Qty</th>
            <th className="px-3 py-2 text-right">Buy</th>
            <th className="px-3 py-2">Buy Date</th>
            <th className="px-3 py-2 text-right">Sell</th>
            <th className="px-3 py-2">Sell Date</th>
            <th className="px-3 py-2 text-right">Realized P&amp;L</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((h) => (
            <tr
              key={h.id}
              onClick={() => navigate(`/stock/${h.market}/${h.symbol}`)}
              className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/60"
            >
              <td className="px-3 py-2 text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <FlagIcon code={h.market} /> {h.market}
                </span>
              </td>
              <td className="px-3 py-2 font-medium text-cyan-600 dark:text-cyan-400">{h.symbol}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">{formatNumber(h.quantity)}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">{formatNumber(h.buy_price)}</td>
              <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{h.buy_date}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">{formatNumber(h.sell_price)}</td>
              <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{h.sell_date ?? "—"}</td>
              <td className={`px-3 py-2 text-right font-mono tabular-nums font-medium ${pnlClassOf(h.pnl)}`}>
                {h.pnl === null
                  ? "—"
                  : `${h.pnl >= 0 ? "+" : ""}${formatNumber(h.pnl)} (${h.pnl_pct !== null ? `${h.pnl >= 0 ? "+" : ""}${formatNumber(h.pnl_pct)}%` : "—"})`}
              </td>
              <td className="px-3 py-2 text-right">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    remove.mutate(h.id);
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

export function HoldingsTable({ items }: { items: HoldingItem[] }) {
  const open = items.filter((h) => !h.is_closed);
  const closed = items.filter((h) => h.is_closed);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        No holdings yet. Add one above to start tracking your portfolio.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {open.length > 0 ? (
        <OpenHoldingsTable items={open} />
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">No open positions.</p>
      )}

      {closed.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold font-mono uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Closed Positions
          </h3>
          <ClosedHoldingsTable items={closed} />
        </div>
      )}
    </div>
  );
}
