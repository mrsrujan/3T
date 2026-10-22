import { FlagIcon } from "../common/FlagIcon";
import type { SearchResultItem } from "../../api/types";

interface Props {
  items: SearchResultItem[];
  isLoading: boolean;
  onSelect: (item: SearchResultItem) => void;
}

export function SearchResultsDropdown({ items, isLoading, onSelect }: Props) {
  return (
    <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
      {isLoading && (
        <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">Searching…</div>
      )}
      {!isLoading && items.length === 0 && (
        <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">No matches</div>
      )}
      {!isLoading &&
        items.map((item) => (
          <button
            key={`${item.market}-${item.symbol}`}
            onClick={() => onSelect(item)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <span>
              <span className="font-medium text-slate-800 dark:text-slate-100">{item.symbol}</span>
              {item.name && (
                <span className="ml-2 text-slate-500 dark:text-slate-400">{item.name}</span>
              )}
            </span>
            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <FlagIcon code={item.market} /> {item.market}
            </span>
          </button>
        ))}
    </div>
  );
}
