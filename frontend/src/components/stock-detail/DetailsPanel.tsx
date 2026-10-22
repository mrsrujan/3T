import { formatInMarketTime } from "../../lib/marketTime";
import type { StockDetailResponse } from "../../api/types";

export function DetailsPanel({ detail }: { detail: StockDetailResponse }) {
  const rows = [
    { label: "Market", value: "India" },
    { label: "Sector", value: detail.sector ?? "—" },
    { label: "Industry", value: detail.industry ?? "—" },
    { label: "Last price update", value: detail.last_seen ?? "—" },
    {
      label: "Fundamentals updated",
      value: detail.fundamentals?.fetched_at
        ? formatInMarketTime(detail.fundamentals.fetched_at, detail.market)
        : "—",
    },
  ];

  return (
    <div className="h-full rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <h3 className="mb-2 text-sm font-semibold font-mono uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Details
      </h3>
      <dl className="space-y-2 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-3">
            <dt className="text-slate-400">{r.label}</dt>
            <dd className="text-right text-slate-700 dark:text-slate-200">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
