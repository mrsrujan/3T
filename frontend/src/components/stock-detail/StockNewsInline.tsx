import { useNews } from "../../hooks/useNews";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { ErrorBanner } from "../common/ErrorBanner";
import { NewsItem } from "../news/NewsItem";
import type { Market } from "../../api/types";

export function StockNewsInline({ market, symbol, name }: { market: Market; symbol: string; name?: string | null }) {
  const { data, isLoading, error } = useNews(market, symbol, name);

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold font-mono uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Recent news
      </h3>
      {isLoading && <LoadingSpinner label="Loading news…" />}
      {error && <ErrorBanner message="Failed to load news." />}
      {data && data.articles.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">No recent news found.</p>
      )}
      {data && data.articles.length > 0 && (
        <ul>
          {data.articles.map((article, idx) => (
            <NewsItem key={idx} article={article} />
          ))}
        </ul>
      )}
    </div>
  );
}
