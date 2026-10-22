import { useState } from "react";
import { useSearch } from "../../hooks/useSearch";
import { useHoldingsMutations } from "../../hooks/useHoldings";
import type { Market } from "../../api/types";

// Device-local date, not UTC (toISOString() would roll over to the next day
// for anyone west of UTC in the evening) - this is just an editable default.
const todayIso = () => new Intl.DateTimeFormat("en-CA").format(new Date());

export function AddHoldingForm() {
  const [symbolQuery, setSymbolQuery] = useState("");
  const [selected, setSelected] = useState<{ market: Market; symbol: string } | null>(null);
  const [quantity, setQuantity] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [buyDate, setBuyDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: searchResults } = useSearch(symbolQuery);
  const { create } = useHoldingsMutations();

  function reset() {
    setSymbolQuery("");
    setSelected(null);
    setQuantity("");
    setBuyPrice("");
    setBuyDate(todayIso());
    setNotes("");
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!selected) {
      setError("Pick a stock from the search results first.");
      return;
    }
    const qty = Number(quantity);
    const price = Number(buyPrice);
    if (!qty || qty <= 0) {
      setError("Quantity must be a positive number.");
      return;
    }
    if (!price || price <= 0) {
      setError("Buy price must be a positive number.");
      return;
    }

    create.mutate(
      {
        market: selected.market,
        symbol: selected.symbol,
        quantity: qty,
        buy_price: price,
        buy_date: buyDate,
        notes: notes || undefined,
      },
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
        Quantity
        <input
          type="number"
          step="any"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
        Buy price
        <input
          type="number"
          step="any"
          value={buyPrice}
          onChange={(e) => setBuyPrice(e.target.value)}
          className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
        Buy date
        <input
          type="date"
          value={buyDate}
          onChange={(e) => setBuyDate(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
        Notes (optional)
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-40 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        />
      </label>

      <button
        type="submit"
        disabled={create.isPending}
        className="rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
      >
        {create.isPending ? "Adding…" : "Add Holding"}
      </button>

      {error && <p className="w-full text-sm text-red-600 dark:text-red-400">{error}</p>}
      {create.isError && (
        <p className="w-full text-sm text-red-600 dark:text-red-400">Failed to add holding.</p>
      )}
    </form>
  );
}
