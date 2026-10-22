import { useFiiDii } from "../../hooks/useFiiDii";
import type { FiiDiiItem } from "../../api/types";

function fmtCr(val: number | null): string {
  if (val === null) return "—";
  const abs = Math.abs(val);
  if (abs >= 10000) return `₹${(val / 1000).toFixed(1)}K Cr`;
  return `₹${val.toFixed(0)} Cr`;
}

function FlowBar({ fii, dii }: { fii: number | null; dii: number | null }) {
  const maxAbs = Math.max(Math.abs(fii ?? 0), Math.abs(dii ?? 0), 1);
  const fiiW = fii !== null ? (Math.abs(fii) / maxAbs) * 100 : 0;
  const diiW = dii !== null ? (Math.abs(dii) / maxAbs) * 100 : 0;
  const fiiPos = fii !== null && fii > 0;
  const diiPos = dii !== null && dii > 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="w-8 text-right text-[10px] text-slate-400">FII</span>
        <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className={`h-full rounded-full transition-all ${fiiPos ? "bg-green-500" : "bg-red-400"}`}
            style={{ width: `${fiiW}%` }}
          />
        </div>
        <span className={`w-20 text-right text-xs font-medium ${fiiPos ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
          {fii !== null ? `${fii > 0 ? "+" : ""}${fmtCr(fii)}` : "—"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-8 text-right text-[10px] text-slate-400">DII</span>
        <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className={`h-full rounded-full transition-all ${diiPos ? "bg-blue-500" : "bg-orange-400"}`}
            style={{ width: `${diiW}%` }}
          />
        </div>
        <span className={`w-20 text-right text-xs font-medium ${diiPos ? "text-blue-600 dark:text-blue-400" : "text-orange-500 dark:text-orange-400"}`}>
          {dii !== null ? `${dii > 0 ? "+" : ""}${fmtCr(dii)}` : "—"}
        </span>
      </div>
    </div>
  );
}

export function FiiDiiWidget() {
  const { data, isLoading } = useFiiDii(5);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="h-4 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700 mb-3" />
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-6 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      </div>
    );
  }

  const items = data?.items ?? [];
  if (!items.length) return null;
  const latest = items[0];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          FII / DII Flows
        </h3>
        <span className="text-[10px] text-slate-400">{latest.date}</span>
      </div>

      <FlowBar fii={latest.fii_net} dii={latest.dii_net} />

      {items.length > 1 && (
        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">5-Day Trend</p>
          <div className="space-y-1">
            {items.slice(0, 5).map((item: FiiDiiItem, i: number) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span className="w-20 text-slate-400 truncate">{item.date}</span>
                <span className={`w-16 text-right font-mono ${(item.fii_net ?? 0) > 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                  FII {item.fii_net !== null ? `${item.fii_net > 0 ? "+" : ""}${fmtCr(item.fii_net)}` : "—"}
                </span>
                <span className={`w-16 text-right font-mono ${(item.dii_net ?? 0) > 0 ? "text-blue-600 dark:text-blue-400" : "text-orange-500 dark:text-orange-400"}`}>
                  DII {item.dii_net !== null ? `${item.dii_net > 0 ? "+" : ""}${fmtCr(item.dii_net)}` : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
