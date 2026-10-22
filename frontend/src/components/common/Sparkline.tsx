interface Props {
  values: number[] | null | undefined;
  width?: number;
  height?: number;
}

// Tiny inline trend line for table rows. Pure SVG - deliberately not
// lightweight-charts, which would be absurd overhead at this size.
export function Sparkline({ values, width = 72, height = 22 }: Props) {
  if (!values || values.length < 2) {
    return <span className="text-xs text-slate-300 dark:text-slate-700">—</span>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const pad = 2;

  const points = values
    .map((v, i) => `${(i * stepX).toFixed(1)},${(height - pad - ((v - min) / range) * (height - pad * 2)).toFixed(1)}`)
    .join(" ");

  const up = values[values.length - 1] >= values[0];
  const stroke = up ? "#059669" : "#dc2626"; // emerald-600 / red-600, the app's gain/loss pair

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="shrink-0">
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
