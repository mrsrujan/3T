/** Shared lightweight-charts theme options. All chart components should call
 *  this so colour choices are consistent between dark and light modes. */
export function chartTheme(isDark: boolean) {
  return {
    layout: {
      background: { color: isDark ? "#0f172a" : "#ffffff" },
      textColor: isDark ? "#94a3b8" : "#64748b",
      fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
    },
    grid: {
      vertLines: { color: isDark ? "#1e293b" : "#f1f5f9" },
      horzLines: { color: isDark ? "#1e293b" : "#f1f5f9" },
    },
    timeScale: { borderVisible: false },
    rightPriceScale: { borderVisible: false },
  } as const;
}

/** Price-line colour for historical data — readable in both modes. */
export const PRICE_LINE_COLOR = (isDark: boolean) => (isDark ? "#94a3b8" : "#334155");
