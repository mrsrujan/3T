import { useWatchlist, useWatchlistMutations } from "../../hooks/useWatchlist";
import type { Market } from "../../api/types";

interface Props {
  market: Market;
  symbol: string;
}

export function WatchlistStarButton({ market, symbol }: Props) {
  const { data } = useWatchlist("ALL");
  const { add, remove } = useWatchlistMutations();

  const isWatched = data?.items.some((i) => i.market === market && i.symbol === symbol) ?? false;
  const isPending = add.isPending || remove.isPending;

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (isWatched) {
      remove.mutate({ market, symbol });
    } else {
      add.mutate({ market, symbol });
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={isPending}
      title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
      className={`text-base leading-none ${
        isWatched ? "text-amber-400" : "text-slate-300 hover:text-amber-400 dark:text-slate-600"
      } disabled:opacity-50`}
    >
      {isWatched ? "★" : "☆"}
    </button>
  );
}
