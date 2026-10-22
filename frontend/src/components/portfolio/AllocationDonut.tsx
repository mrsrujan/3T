import type { AllocationSlice } from "../../api/types";

// Sector allocation of open positions. Hand-rolled SVG donut - a charting
// dependency would be overkill for one static ring. Colors are a fixed
// categorical sequence (assigned by allocation rank, largest first).
const SLICE_COLORS = [
  "#0891b2", // cyan-600
  "#f59e0b", // amber-500
  "#8b5cf6", // violet-500
  "#10b981", // emerald-500
  "#f43f5e", // rose-500
  "#3b82f6", // blue-500
  "#a3a3a3", // neutral-400 for the tail
];

function colorFor(index: number): string {
  return SLICE_COLORS[Math.min(index, SLICE_COLORS.length - 1)];
}

export function AllocationDonut({ allocation }: { allocation: AllocationSlice[] }) {
  if (allocation.length === 0) return null;

  const size = 160;
  const radius = 60;
  const strokeWidth = 26;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const segments = allocation.map((slice, i) => {
    const length = (slice.pct / 100) * circumference;
    const seg = (
      <circle
        key={slice.label}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={colorFor(i)}
        strokeWidth={strokeWidth}
        strokeDasharray={`${Math.max(length - 1.5, 0)} ${circumference}`}
        strokeDashoffset={-offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    );
    offset += length;
    return seg;
  });

  return (
    <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <h3 className="mb-3 text-sm font-semibold font-mono uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Allocation by Sector
      </h3>
      <div className="flex flex-wrap items-center gap-6">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          {segments}
        </svg>
        <ul className="min-w-0 flex-1 space-y-1.5">
          {allocation.map((slice, i) => (
            <li key={slice.label} className="flex items-center gap-2 text-sm">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: colorFor(i) }}
              />
              <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">
                {slice.label}
              </span>
              <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                {slice.pct.toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
