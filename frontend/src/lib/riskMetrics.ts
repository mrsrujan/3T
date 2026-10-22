import type { HistoryPoint } from "../api/types";

function logReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > 0 && closes[i - 1] > 0) {
      out.push(Math.log(closes[i] / closes[i - 1]));
    }
  }
  return out;
}

export function ewmaVol(closes: number[], lambda = 0.94): number | null {
  const rets = logReturns(closes);
  if (rets.length < 22) return null;
  // Seed with variance of first 21 returns (warm-up) rather than a single
  // squared return, which would bias the EWMA for ~75 days on cold start.
  const seed = rets.slice(0, 21);
  const seedMean = seed.reduce((a, b) => a + b, 0) / seed.length;
  let v = seed.reduce((a, b) => a + (b - seedMean) ** 2, 0) / (seed.length - 1);
  for (let i = 21; i < rets.length; i++) {
    v = lambda * v + (1 - lambda) * rets[i] ** 2;
  }
  return Math.sqrt(v * 252) * 100;
}

export function longRunVol(closes: number[], n = 756): number | null {
  const all = logReturns(closes);
  const rets = all.slice(-n);
  if (rets.length < 2) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance * 252) * 100;
}

/** Historical 1-day VaR at 95% confidence (5th percentile of 3Y daily returns). */
export function var95(closes: number[], n = 756): number | null {
  const all = logReturns(closes);
  const rets = all.slice(-n);
  if (rets.length === 0) return null;
  const sorted = [...rets].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.05)] * 100;
}

/** 3-year CAGR using last 756 trading days (~3 years). */
export function cagr3y(closes: number[]): number | null {
  if (closes.length < 756) return null;  // fixed: was 757, caused edge-case null
  const start = closes[closes.length - 756];
  const end = closes[closes.length - 1];
  if (!start || start <= 0) return null;
  return ((end / start) ** (1 / 3) - 1) * 100;
}

/** 1-year annualised return (same window as Sharpe ratio). */
export function return1y(closes: number[]): number | null {
  if (closes.length < 252) return null;
  const start = closes[closes.length - 252];
  const end = closes[closes.length - 1];
  if (!start || start <= 0) return null;
  return ((end / start) - 1) * 100;
}

/** Sharpe ratio computed over 1Y daily returns (consistent window). */
export function sharpeRatio(closes: number[], rfAnnual: number): number | null {
  const all = logReturns(closes);
  const rets = all.slice(-252);
  if (rets.length < 2) return null;
  const rfDaily = Math.log(1 + rfAnnual / 100) / 252;
  const excess = rets.map((r) => r - rfDaily);
  const mean = excess.reduce((a, b) => a + b, 0) / excess.length;
  const variance = excess.reduce((a, b) => a + (b - mean) ** 2, 0) / (excess.length - 1);
  const vol = Math.sqrt(variance);
  return vol === 0 ? null : (mean / vol) * Math.sqrt(252);
}

export function rollingVolSeries(
  points: HistoryPoint[],
  window = 21,
  lambda = 0.94,
): { date: string; vol: number }[] {
  const closes = points.map((p) => p.close).filter((c): c is number => c !== null);
  const dates = points.filter((p) => p.close !== null).map((p) => p.trade_date);

  const rets = logReturns(closes);
  if (rets.length < window) return [];

  // Seed with variance of first 21 returns (consistent with ewmaVol)
  const seed = rets.slice(0, Math.min(21, rets.length));
  const seedMean = seed.reduce((a, b) => a + b, 0) / seed.length;
  let v = seed.reduce((a, b) => a + (b - seedMean) ** 2, 0) / (seed.length - 1);

  const vols: { date: string; vol: number }[] = [];
  for (let i = 21; i < rets.length; i++) {
    v = lambda * v + (1 - lambda) * rets[i] ** 2;
    vols.push({ date: dates[i + 1], vol: Math.sqrt(v * 252) * 100 });
  }
  return vols;
}

export function drawdownSeries(points: HistoryPoint[]): { date: string; dd: number }[] {
  const valid = points.filter((p) => p.close !== null);
  if (valid.length === 0) return [];

  const result: { date: string; dd: number }[] = [];
  let peak = valid[0].close as number;
  for (const p of valid) {
    const c = p.close as number;
    if (c > peak) peak = c;
    result.push({ date: p.trade_date, dd: ((c - peak) / peak) * 100 });
  }
  return result;
}

export function computeReturns(
  points: HistoryPoint[],
  periods: number[],
): Record<number, number | null> {
  const valid = points.filter((p) => p.close !== null);
  const last = valid[valid.length - 1]?.close ?? null;
  if (last === null) return Object.fromEntries(periods.map((d) => [d, null]));

  const result: Record<number, number | null> = {};
  for (const n of periods) {
    const ref = valid[valid.length - 1 - n];
    result[n] = ref?.close != null ? ((last - ref.close) / ref.close) * 100 : null;
  }
  return result;
}

export function computeBeta(
  stockReturns: number[],
  driverReturns: number[],
): { beta: number; rho: number } | null {
  const n = Math.min(stockReturns.length, driverReturns.length);
  if (n < 20) return null;
  const s = stockReturns.slice(-n);
  const d = driverReturns.slice(-n);

  const sm = s.reduce((a, b) => a + b, 0) / n;
  const dm = d.reduce((a, b) => a + b, 0) / n;

  let cov = 0, varD = 0, varS = 0;
  for (let i = 0; i < n; i++) {
    cov += (s[i] - sm) * (d[i] - dm);
    varD += (d[i] - dm) ** 2;
    varS += (s[i] - sm) ** 2;
  }

  if (varD === 0) return null;
  const beta = cov / varD;
  const rho = varD > 0 && varS > 0 ? cov / Math.sqrt(varD * varS) : 0;
  return { beta, rho };
}

export function alignedLogReturns(
  aPoints: { date: string; close: number }[],
  bPoints: { date: string; close: number }[],
): { aReturns: number[]; bReturns: number[] } {
  const aMap = new Map(aPoints.map((p) => [p.date, p.close]));
  const bMap = new Map(bPoints.map((p) => [p.date, p.close]));

  const dates = [...aMap.keys()].filter((d) => bMap.has(d)).sort();
  const aReturns: number[] = [];
  const bReturns: number[] = [];

  for (let i = 1; i < dates.length; i++) {
    const a0 = aMap.get(dates[i - 1])!;
    const a1 = aMap.get(dates[i])!;
    const b0 = bMap.get(dates[i - 1])!;
    const b1 = bMap.get(dates[i])!;
    if (a0 > 0 && a1 > 0 && b0 > 0 && b1 > 0) {
      aReturns.push(Math.log(a1 / a0));
      bReturns.push(Math.log(b1 / b0));
    }
  }
  return { aReturns, bReturns };
}
