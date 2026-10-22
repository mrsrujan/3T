import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAlertTriggers, useMarkTriggersRead } from "../../hooks/useAlerts";

function formatTimeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function AlertBell() {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { data } = useAlertTriggers(true);
  const markRead = useMarkTriggersRead();
  const unreadCount = data?.items.length ?? 0;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // System notification for triggers that appear after the first poll (the
  // initial batch is skipped so a page load doesn't replay old alerts).
  // No-ops entirely until the user grants permission from Settings.
  const seenIdsRef = useRef<Set<number> | null>(null);
  useEffect(() => {
    if (!data) return;
    if (seenIdsRef.current === null) {
      seenIdsRef.current = new Set(data.items.map((t) => t.id));
      return;
    }
    const seen = seenIdsRef.current;
    for (const t of data.items) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification("Stocks Tracker alert", { body: t.message, tag: `alert-${t.id}` });
        } catch {
          // Some webviews expose Notification but throw on construction.
        }
      }
    }
  }, [data]);

  function handleSelect(triggerId: number, market: string, symbol: string) {
    markRead.mutate([triggerId]);
    setIsOpen(false);
    navigate(`/stock/${market}/${symbol}`);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="relative rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        aria-label="Alerts"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
          <path d="M10 2a5 5 0 00-5 5v2.586l-1.707 1.707A1 1 0 004 13h12a1 1 0 00.707-1.707L15 9.586V7a5 5 0 00-5-5zM8.5 16a1.5 1.5 0 003 0h-3z" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {isOpen && (
        <div className="absolute right-0 top-full z-30 mt-1 w-80 rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-800">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Alerts</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markRead.mutate(undefined)}
                className="text-xs text-cyan-600 hover:underline dark:text-cyan-400"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {unreadCount === 0 && (
              <p className="px-3 py-6 text-center text-sm text-slate-400">No new alerts.</p>
            )}
            {data?.items.map((t) => (
              <button
                key={t.id}
                onClick={() => handleSelect(t.id, t.market, t.symbol)}
                className="block w-full border-b border-slate-50 px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
              >
                <div className="font-medium text-slate-700 dark:text-slate-200">{t.message}</div>
                <div className="mt-0.5 text-xs text-slate-400">{formatTimeAgo(t.triggered_at)}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
