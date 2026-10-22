import { useNavigate } from "react-router-dom";
import { useAlertTriggers } from "../hooks/useAlerts";
import { AlertRuleForm } from "../components/alerts/AlertRuleForm";
import { AlertRulesList } from "../components/alerts/AlertRulesList";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { formatInMarketTime } from "../lib/marketTime";
import type { Market } from "../api/types";

function formatDateTime(iso: string, market: Market): string {
  return formatInMarketTime(iso, market, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function RecentTriggers() {
  const { data, isLoading } = useAlertTriggers(false);
  const navigate = useNavigate();

  if (isLoading) return <LoadingSpinner label="Loading alert history…" />;
  if (!data || data.items.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        No alerts have triggered yet. Alerts are checked once per daily refresh, not intraday.
      </p>
    );
  }

  return (
    <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
      {data.items.map((t) => (
        <button
          key={t.id}
          onClick={() => navigate(`/stock/${t.market}/${t.symbol}`)}
          className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-900/60 ${
            t.is_read ? "" : "bg-cyan-50/60 dark:bg-cyan-950/30"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-slate-700 dark:text-slate-200">{t.message}</span>
            <span className="shrink-0 text-xs text-slate-400">{formatDateTime(t.triggered_at, t.market)}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

export function AlertsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h2 className="mb-1 text-base font-semibold text-slate-900 dark:text-slate-100">Alerts</h2>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Checked once per daily refresh (scheduled or manual) — not intraday.
      </p>

      <AlertRuleForm />
      <AlertRulesList />

      <h3 className="mb-3 mt-8 text-sm font-semibold font-mono uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Recent Triggers
      </h3>
      <RecentTriggers />
    </div>
  );
}
