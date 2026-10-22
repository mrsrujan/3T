import type { NewsArticle } from "../../api/types";

export function NewsItem({ article }: { article: NewsArticle }) {
  return (
    <li className="border-b border-slate-100 py-3 last:border-0 dark:border-slate-800">
      <a
        href={article.link}
        target="_blank"
        rel="noreferrer"
        className="text-sm font-medium text-slate-800 hover:text-cyan-600 dark:text-slate-200 dark:hover:text-cyan-400"
      >
        {article.title}
      </a>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {[article.source, article.published_at].filter(Boolean).join(" · ")}
      </div>
    </li>
  );
}
