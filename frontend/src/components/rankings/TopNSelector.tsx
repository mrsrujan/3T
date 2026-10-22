const OPTIONS = [10, 25, 50, 100];

interface Props {
  topN: number;
  onChange: (topN: number) => void;
}

export function TopNSelector({ topN, onChange }: Props) {
  return (
    <div className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
      <span>Top</span>
      <select
        value={topN}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      >
        {OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </div>
  );
}
