export function LoadingSpinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-slate-500 dark:text-slate-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-cyan-600 dark:border-slate-700 dark:border-t-cyan-400" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
