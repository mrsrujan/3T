interface Props {
  n: number;
  onChange: (n: number) => void;
}

export function LastNDaysInput({ n, onChange }: Props) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
      Last
      <input
        type="number"
        min={2}
        max={90}
        value={n}
        onChange={(e) => onChange(Math.max(2, Math.min(90, Number(e.target.value) || 2)))}
        className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      />
      trading days
    </label>
  );
}
