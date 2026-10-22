import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postRefresh, ApiError } from "../../api/client";
import { useRefreshStatus } from "../../hooks/useRefreshStatus";
import { useMarket } from "../../context/MarketContext";
import { FlagIcon } from "../common/FlagIcon";
import type { Market } from "../../api/types";

const MARKET_LABEL: Record<Market, string> = { IN: "India" };
const NOTICE_TIMEOUT_MS = 4000;

// Backend timestamps are naive UTC (no zone suffix); pin them to UTC so the
// tooltip shows the viewer's local time instead of a time 5-10h off.
function formatLastRefresh(iso: string): string {
  const parsed = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  return Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleString();
}

export function RefreshButton() {
  const { market } = useMarket();
  const queryClient = useQueryClient();
  const { data: status, refetch } = useRefreshStatus(market);
  const wasRunning = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);

  function showNotice(text: string) {
    setNotice(text);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), NOTICE_TIMEOUT_MS);
  }

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  const mutation = useMutation({
    mutationFn: (target: Market) => postRefresh(target),
    onSuccess: (_data, target) => {
      showNotice(`${MARKET_LABEL[target]} refresh started`);
      refetch();
    },
    onError: (err, target) => {
      if (err instanceof ApiError && err.status === 409) {
        showNotice(`A ${MARKET_LABEL[target]} refresh is already running`);
      } else {
        console.error(err);
        showNotice(`Could not start ${MARKET_LABEL[target]} refresh`);
      }
      refetch();
    },
  });

  const isRunning = status?.status === "running";

  useEffect(() => {
    if (wasRunning.current && !isRunning) {
      // A refresh just finished - invalidate cached data so tables refetch.
      queryClient.invalidateQueries({ queryKey: ["rankings"] });
      queryClient.invalidateQueries({ queryKey: ["persistence"] });
      queryClient.invalidateQueries({ queryKey: ["trading-days"] });
    }
    wasRunning.current = isRunning;
  }, [isRunning, queryClient]);

  const title =
    status?.status === "failed"
      ? `Last ${MARKET_LABEL[market]} refresh failed${status.error_message ? `: ${status.error_message}` : ""}`
      : status?.finished_at
        ? `Last ${MARKET_LABEL[market]} refresh: ${formatLastRefresh(status.finished_at)}`
        : `Refresh ${MARKET_LABEL[market]} data`;

  return (
    <div className="relative">
      <button
        onClick={() => mutation.mutate(market)}
        disabled={isRunning || mutation.isPending}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        title={title}
      >
        <span className={isRunning ? "animate-spin" : ""}>&#x21bb;</span>
        <FlagIcon code={market} className="h-3 w-4 rounded-[1px]" />
        {isRunning ? `Refreshing ${MARKET_LABEL[market]}…` : `Refresh ${MARKET_LABEL[market]}`}
      </button>
      {notice && (
        <div className="absolute right-0 top-full z-20 mt-1 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 shadow-md dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          {notice}
        </div>
      )}
    </div>
  );
}
