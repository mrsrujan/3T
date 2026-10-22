import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { HeatmapSector, Market } from "../../api/types";

// Diverging red -> neutral gray -> green, validated for CVD separation
// (node scripts/validate_palette.js "#dc2626,#059669" -> ΔE 23.0, well past
// the >=12 target). Matches the red/green convention used everywhere else in
// this app (RankingTable, StockHeader, etc.) rather than introducing a
// second diverging pair just for this view.
const NEGATIVE = [220, 38, 38]; // red-600
const NEUTRAL = [148, 163, 184]; // slate-400
const POSITIVE = [5, 150, 105]; // emerald-600
const MAX_MAGNITUDE = 5; // pct_change at/beyond this is "full" color intensity

type SizeBy = "volume" | "market_cap";

// Different metrics need different sqrt-divisors to land in a similar
// visual tile-size range (market cap is ~1e9-1e12, volume is ~1e5-1e8).
const SIZE_DIVISOR: Record<SizeBy, number> = { volume: 8, market_cap: 400 };

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function colorFor(pctChange: number | null): string {
  if (pctChange === null) return `rgb(${NEUTRAL.join(",")})`;
  const t = Math.min(Math.abs(pctChange) / MAX_MAGNITUDE, 1);
  const target = pctChange >= 0 ? POSITIVE : NEGATIVE;
  const rgb = NEUTRAL.map((n, i) => Math.round(lerp(n, target[i], t)));
  return `rgb(${rgb.join(",")})`;
}

interface Props {
  market: Market;
  sectors: HeatmapSector[];
}

export function SectorHeatmap({ market, sectors }: Props) {
  const navigate = useNavigate();
  const [sizeBy, setSizeBy] = useState<SizeBy>("volume");

  if (sectors.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        No sector-tagged symbols have data for this date yet.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span>Colored by % change:</span>
        <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: colorFor(-5) }} />
        <span>-5%</span>
        <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: colorFor(0) }} />
        <span>0%</span>
        <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: colorFor(5) }} />
        <span>+5%</span>

        <span className="ml-3">Size by:</span>
        <div className="inline-flex rounded-md border border-slate-300 dark:border-slate-700">
          {(["volume", "market_cap"] as SizeBy[]).map((opt) => (
            <button
              key={opt}
              onClick={() => setSizeBy(opt)}
              className={`px-2 py-0.5 text-xs font-medium ${
                sizeBy === opt
                  ? "bg-cyan-600 text-white"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {opt === "volume" ? "Volume" : "Market Cap"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {sectors.map((sector) => (
          <div key={sector.sector}>
            <h3 className="mb-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
              {sector.sector}
            </h3>
            <div className="flex flex-wrap gap-0.5">
              {sector.symbols.map((sym) => {
                const metric = sizeBy === "volume" ? sym.volume : sym.market_cap;
                const size = Math.max(56, Math.min(140, Math.sqrt(metric ?? 1) / SIZE_DIVISOR[sizeBy]));
                return (
                  <button
                    key={sym.symbol}
                    onClick={() => navigate(`/stock/${market}/${sym.symbol}`)}
                    title={`${sym.symbol} ${sym.pct_change === null ? "" : (sym.pct_change >= 0 ? "+" : "") + sym.pct_change.toFixed(2) + "%"}`}
                    style={{ backgroundColor: colorFor(sym.pct_change), width: size, height: size * 0.6 }}
                    className="flex flex-col items-center justify-center rounded-sm p-1 text-center text-white shadow-sm ring-1 ring-white/20 transition-transform hover:z-10 hover:scale-105 hover:ring-2 dark:ring-black/20"
                  >
                    <span className="truncate text-[11px] font-semibold leading-tight">{sym.symbol}</span>
                    <span className="text-[10px] leading-tight opacity-90">
                      {sym.pct_change === null ? "—" : `${sym.pct_change >= 0 ? "+" : ""}${sym.pct_change.toFixed(1)}%`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
