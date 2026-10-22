import type { Category } from "../../api/types";

// "Trending" (rel_volume ranking) needs a 20-day baseline. Omitted under
// the 7-day history config - would always be null.
const CATEGORIES: { value: Category; label: string }[] = [
  { value: "gainers", label: "Top Gainers" },
  { value: "losers", label: "Top Losers" },
  { value: "most_active", label: "Most Active" },
];

export const CATEGORY_LABELS: Record<Category, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.label]),
) as Record<Category, string>;

interface Props {
  category: Category;
  onChange: (category: Category) => void;
}

export function CategoryTabs({ category, onChange }: Props) {
  return (
    <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
      {CATEGORIES.map((c) => (
        <button
          key={c.value}
          onClick={() => onChange(c.value)}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            category === c.value
              ? "border-cyan-600 text-cyan-600 dark:border-cyan-400 dark:text-cyan-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
