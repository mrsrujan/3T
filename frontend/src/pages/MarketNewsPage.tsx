import { useState } from "react";
import { Link } from "react-router-dom";
import { useMarket } from "../context/MarketContext";
import { useMarketNews } from "../hooks/useMarketNews";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { ErrorBanner } from "../components/common/ErrorBanner";
import { EmptyState } from "../components/common/EmptyState";
import type { MarketNewsArticle } from "../api/types";

type ArticleCategory = "earnings" | "market-move" | "analysis" | "policy" | "corporate" | "other";

const CAT: Record<
  ArticleCategory,
  { label: string; accent: string; text: string; dot: string }
> = {
  earnings:      { label: "EARNINGS",    accent: "bg-amber-400",  text: "text-amber-500 dark:text-amber-400",  dot: "bg-amber-400" },
  "market-move": { label: "MARKET",      accent: "bg-emerald-400",text: "text-emerald-600 dark:text-emerald-400",dot: "bg-emerald-400" },
  analysis:      { label: "ANALYSIS",   accent: "bg-blue-400",   text: "text-blue-600 dark:text-blue-400",    dot: "bg-blue-400" },
  policy:        { label: "POLICY",     accent: "bg-purple-400", text: "text-purple-600 dark:text-purple-400",dot: "bg-purple-400" },
  corporate:     { label: "CORPORATE",  accent: "bg-rose-400",   text: "text-rose-500 dark:text-rose-400",    dot: "bg-rose-400" },
  other:         { label: "NEWS",       accent: "bg-slate-300 dark:bg-slate-600", text: "text-slate-400",     dot: "bg-slate-400" },
};

const SYM_COLORS = [
  "bg-cyan-100 text-cyan-700 ring-cyan-200 dark:bg-cyan-900/40 dark:text-cyan-300 dark:ring-cyan-800",
  "bg-violet-100 text-violet-700 ring-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:ring-violet-800",
  "bg-orange-100 text-orange-700 ring-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:ring-orange-800",
  "bg-pink-100 text-pink-700 ring-pink-200 dark:bg-pink-900/40 dark:text-pink-300 dark:ring-pink-800",
  "bg-teal-100 text-teal-700 ring-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:ring-teal-800",
  "bg-indigo-100 text-indigo-700 ring-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:ring-indigo-800",
  "bg-lime-100 text-lime-700 ring-lime-200 dark:bg-lime-900/40 dark:text-lime-300 dark:ring-lime-800",
];
function symColor(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return SYM_COLORS[h % SYM_COLORS.length];
}

function classify(title: string): ArticleCategory {
  const t = title.toLowerCase();
  if (/\b(q[1-4]\b|fy\d{2}|earnings|results|net profit|quarterly profit|revenue|eps)\b/.test(t)) return "earnings";
  if (/\b(promoter|stake|acqui|merger|buyback|dividend|ipo|listing|founder)\b/.test(t)) return "corporate";
  if (/\b(analyst|outlook|forecast|target price|upgrade|downgrade|brokerages|expect|key reason|why\s)/.test(t)) return "analysis";
  if (/\b(rbi|fed|interest rate|inflation|gdp|policy|budget|sebi|government|regulat)\b/.test(t)) return "policy";
  if (/\b(soars|surges|jumps|rises|gains|falls|drops|plunges|rally|slumps|climbs|declines|high|low)\b/.test(t)) return "market-move";
  return "other";
}

function relTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface Enriched extends MarketNewsArticle { _cat: ArticleCategory }

// ── Symbol badge ───────────────────────────────────────────────────────────────
function SymBadge({ symbol, market }: { symbol: string; market: string }) {
  return (
    <Link
      to={`/stock/${market}/${symbol}`}
      onClick={(e) => e.stopPropagation()}
      className={`relative z-20 rounded px-2 py-0.5 text-xs font-bold ring-1 ${symColor(symbol)}`}
    >
      {symbol}
    </Link>
  );
}

// ── Breaking strip ─────────────────────────────────────────────────────────────
function BreakingStrip({ articles }: { articles: Enriched[] }) {
  const items = articles.filter((a) => {
    if (!a.published_at) return false;
    return Date.now() - new Date(a.published_at).getTime() < 3 * 60 * 60 * 1000;
  });
  if (items.length === 0) return null;
  return (
    <div className="mb-6 flex items-stretch overflow-hidden rounded-xl border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20">
      <div className="flex shrink-0 items-center gap-2 bg-red-600 px-4 py-3">
        <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
        <span className="text-xs font-bold uppercase tracking-widest text-white">Live</span>
      </div>
      <div className="flex items-center gap-6 overflow-x-auto px-4 py-3">
        {items.map((a) => (
          <a key={a.link} href={a.link} target="_blank" rel="noreferrer"
            className="group flex shrink-0 items-center gap-2.5">
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold ring-1 ${symColor(a.symbol)}`}>
              {a.symbol}
            </span>
            <span className="max-w-[260px] truncate text-sm font-medium text-slate-700 group-hover:text-red-600 dark:text-slate-300 dark:group-hover:text-red-400">
              {a.title}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

// ── Hero card ──────────────────────────────────────────────────────────────────
function HeroCard({ article, market }: { article: Enriched; market: string }) {
  const meta = CAT[article._cat];
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <a href={article.link} target="_blank" rel="noreferrer" className="absolute inset-0 z-0" aria-label={article.title} />
      <div className={`h-1 w-full ${meta.accent}`} />
      <div className="relative z-10 p-6 lg:p-8">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className={`text-[11px] font-bold uppercase tracking-widest ${meta.text}`}>
            {meta.label}
          </span>
          <span className="text-slate-300 dark:text-slate-700">|</span>
          <SymBadge symbol={article.symbol} market={market} />
          <span className="ml-auto text-sm text-slate-400 dark:text-slate-500">
            {relTime(article.published_at)}
          </span>
        </div>
        <h2 className="text-2xl font-bold leading-tight text-slate-900 group-hover:text-cyan-700 dark:text-white dark:group-hover:text-cyan-400 lg:text-3xl">
          {article.title}
        </h2>
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <span>{article.source}</span>
          <svg className="ml-auto h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </div>
      </div>
    </div>
  );
}

// ── Grid card ──────────────────────────────────────────────────────────────────
function ArticleCard({ article, market }: { article: Enriched; market: string }) {
  const meta = CAT[article._cat];
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <a href={article.link} target="_blank" rel="noreferrer" className="absolute inset-0 z-0" aria-label={article.title} />
      <div className={`h-0.5 w-full ${meta.accent}`} />
      <div className="relative z-10 flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center gap-2.5">
          <span className={`text-[10px] font-bold uppercase tracking-widest ${meta.text}`}>
            {meta.label}
          </span>
          <span className="text-slate-200 dark:text-slate-700">|</span>
          <SymBadge symbol={article.symbol} market={market} />
        </div>
        <h3 className="flex-1 text-[15px] font-semibold leading-snug text-slate-900 group-hover:text-cyan-600 dark:text-slate-50 dark:group-hover:text-cyan-400 line-clamp-3">
          {article.title}
        </h3>
        <div className="flex items-center gap-1.5 text-[12px] text-slate-400 dark:text-slate-500">
          <span className="truncate">{article.source}</span>
          {article.source && <span>·</span>}
          <span className="shrink-0 tabular-nums">{relTime(article.published_at)}</span>
          <svg className="ml-auto h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </div>
      </div>
    </div>
  );
}

// ── Trending panel ─────────────────────────────────────────────────────────────
function TrendingPanel({ articles, market }: { articles: Enriched[]; market: string }) {
  const symMap = articles.reduce((acc, a) => {
    if (!acc[a.symbol]) acc[a.symbol] = { count: 0, items: [] as Enriched[] };
    acc[a.symbol].count++;
    acc[a.symbol].items.push(a);
    return acc;
  }, {} as Record<string, { count: number; items: Enriched[] }>);

  const trending = Object.entries(symMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8);

  if (trending.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          Trending
        </h3>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {trending.map(([symbol, { count, items }], i) => {
          const latest = items[0];
          const meta = CAT[latest._cat];
          return (
            <div key={symbol} className="group px-5 py-4">
              <div className="mb-2 flex items-center gap-3">
                <span className="w-5 shrink-0 text-base font-bold tabular-nums text-slate-300 dark:text-slate-600">
                  {i + 1}
                </span>
                <Link
                  to={`/stock/${market}/${symbol}`}
                  className={`rounded px-2 py-0.5 text-xs font-bold ring-1 ${symColor(symbol)}`}
                >
                  {symbol}
                </Link>
                <span className={`text-[10px] font-bold uppercase tracking-widest ${meta.text}`}>
                  {meta.label}
                </span>
                <span className="ml-auto shrink-0 text-xs text-slate-400">
                  {count > 1 ? `${count} articles` : "1 article"}
                </span>
              </div>
              <a href={latest.link} target="_blank" rel="noreferrer" className="group/link block pl-8">
                <p className="text-[13px] font-medium leading-snug text-slate-700 group-hover/link:text-cyan-600 dark:text-slate-300 dark:group-hover/link:text-cyan-400 line-clamp-2">
                  {latest.title}
                </p>
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  {latest.source} · {relTime(latest.published_at)}
                </p>
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Topic filter ───────────────────────────────────────────────────────────────
function TopicFilter({
  articles,
  active,
  onChange,
}: {
  articles: Enriched[];
  active: ArticleCategory | "all";
  onChange: (k: ArticleCategory | "all") => void;
}) {
  const total = articles.length;
  const cats: ArticleCategory[] = ["earnings", "market-move", "analysis", "corporate", "policy", "other"];
  const rows = cats
    .map((k) => ({ key: k, count: articles.filter((a) => a._cat === k).length }))
    .filter((r) => r.count > 0);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          By Topic
        </h3>
      </div>
      <div className="p-3">
        <button
          onClick={() => onChange("all")}
          className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors ${
            active === "all"
              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
              : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"
          }`}
        >
          <span className="font-semibold">All topics</span>
          <span className="tabular-nums font-mono text-xs">{total}</span>
        </button>
        {rows.map(({ key, count }) => {
          const pct = Math.round((count / total) * 100);
          const meta = CAT[key];
          const isActive = active === key;
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                isActive
                  ? "bg-slate-100 dark:bg-slate-800"
                  : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
              }`}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
              <span className="text-slate-700 dark:text-slate-300">{meta.label.charAt(0) + meta.label.slice(1).toLowerCase()}</span>
              <div className="mx-1 h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className={`h-full rounded-full ${meta.accent}`} style={{ width: `${pct}%` }} />
              </div>
              <span className="tabular-nums text-xs font-mono text-slate-400">{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export function MarketNewsPage() {
  const { market } = useMarket();
  const { data, isLoading, error } = useMarketNews(market, 40);
  const [activeFilter, setActiveFilter] = useState<ArticleCategory | "all">("all");

  const enriched: Enriched[] = (data?.articles ?? []).map((a) => ({ ...a, _cat: classify(a.title) }));
  const visible = activeFilter === "all" ? enriched : enriched.filter((a) => a._cat === activeFilter);
  const [hero, ...rest] = visible;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 lg:px-10">
      {/* Page header */}
      <div className="mb-6 border-b border-slate-200 pb-5 dark:border-slate-800">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Market News</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {enriched.length > 0
            ? `${enriched.length} articles · watchlist stocks & top movers · last 7 days`
            : "Watchlist stocks & top movers · last 7 days"}
        </p>
      </div>

      {isLoading && <LoadingSpinner label="Loading news…" />}
      {error && <ErrorBanner message="Failed to load market news." />}

      {!isLoading && !error && enriched.length === 0 && (
        <EmptyState
          icon={
            <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z" />
            </svg>
          }
          title="No articles found"
          description="No recent news available."
        />
      )}

      {enriched.length > 0 && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_340px]">
          {/* ── Main feed ─────────────────────────────────── */}
          <div className="min-w-0">
            <BreakingStrip articles={enriched} />

            {visible.length === 0 ? (
              <EmptyState
                icon={
                  <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                }
                title="No articles in this category"
                description={`No ${activeFilter.replace("-", " ")} articles in the current feed.`}
                action={{ label: "Show all", onClick: () => setActiveFilter("all") }}
              />
            ) : (
              <div className="flex flex-col gap-5">
                {/* Hero */}
                <HeroCard article={hero} market={market} />

                {/* Section label */}
                {rest.length > 0 && (
                  <div className="flex items-center gap-3 pt-2">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                      Latest
                    </span>
                    <div className="flex-1 border-t border-slate-100 dark:border-slate-800" />
                  </div>
                )}

                {/* 2-column grid */}
                {rest.length > 0 && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {rest.map((a) => (
                      <ArticleCard key={a.link} article={a} market={market} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Sidebar ───────────────────────────────────── */}
          <div className="flex flex-col gap-5 lg:sticky lg:top-4 lg:self-start">
            <TrendingPanel articles={enriched} market={market} />
            <TopicFilter articles={enriched} active={activeFilter} onChange={setActiveFilter} />
          </div>
        </div>
      )}
    </div>
  );
}
