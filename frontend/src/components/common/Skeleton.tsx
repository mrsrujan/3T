function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200 dark:bg-slate-800 ${className}`} />;
}

export function SkeletonTable({ rows = 8 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
      <div className="bg-slate-100 px-3 py-2.5 dark:bg-slate-900">
        <Bar className="h-3 w-1/3" />
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-3 py-3">
            <Bar className="h-3 w-8" />
            <Bar className="h-3 w-24" />
            <Bar className="h-3 flex-1" />
            <Bar className="h-3 w-16" />
            <Bar className="h-3 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          <Bar className="h-3 w-1/2" />
          <Bar className="mt-3 h-7 w-2/3" />
          <Bar className="mt-3 h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart() {
  return <Bar className="h-[420px] w-full" />;
}
