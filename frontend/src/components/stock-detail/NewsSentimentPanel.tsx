import { useState } from "react";
import { useNewsSentiment } from "../../hooks/useNewsSentiment";
import type { Market } from "../../api/types";

const sentimentColor = {
  positive: "text-green-600 dark:text-green-400 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20",
  negative: "text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20",
  neutral: "text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30",
};

const sentimentBadge = {
  positive: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  negative: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  neutral: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

export function NewsSentimentPanel({ market, symbol, name }: { market: Market; symbol: string; name: string }) {
  const { data, isLoading } = useNewsSentiment(market, symbol, name);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (isLoading) return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <p className="text-xs text-slate-400">Loading sentiment…</p>
    </div>
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">News Sentiment</h3>
        {data && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${sentimentBadge[data.overall_sentiment]}`}>
            {data.overall_sentiment} · {data.article_count} articles
          </span>
        )}
      </div>

      {!data || data.article_count === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No recent news found for this symbol.</p>
      ) : (
        <div className="space-y-2">
          {Object.entries(data.categories).map(([catId, cat]) => (
            <div
              key={catId}
              className={`rounded-lg border px-3 py-2 ${sentimentColor[cat.sentiment]}`}
            >
              <button
                className="flex w-full items-center justify-between text-left"
                onClick={() => setExpanded(expanded === catId ? null : catId)}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                  <span className="ml-1 rounded-full bg-white/60 px-1.5 py-0.5 text-xs font-semibold dark:bg-black/20">
                    {cat.article_count}
                  </span>
                </span>
                <span className="text-xs opacity-60 capitalize">{cat.sentiment} {expanded === catId ? "▲" : "▼"}</span>
              </button>
              {expanded === catId && cat.headlines.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-current/20 pt-2">
                  {cat.headlines.map((h, i) => (
                    <li key={i} className="text-xs opacity-80">{h}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
