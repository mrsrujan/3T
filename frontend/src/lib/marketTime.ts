import type { Market } from "../api/types";

// NSE/BSE run on India Standard Time - "today" and "as of" timestamps must
// reflect the market's own clock, not the viewer's browser/device timezone.
const MARKET_TIMEZONE: Record<Market, string> = {
  IN: "Asia/Kolkata",
};

export function todayInMarket(market: Market): string {
  // en-CA locale formats as YYYY-MM-DD, matching our API's date format.
  return new Intl.DateTimeFormat("en-CA", { timeZone: MARKET_TIMEZONE[market] }).format(new Date());
}

export function formatInMarketTime(
  iso: string,
  market: Market,
  options: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" },
): string {
  return new Intl.DateTimeFormat(undefined, { timeZone: MARKET_TIMEZONE[market], ...options }).format(
    new Date(iso),
  );
}

// Mirrors backend/app/services/live_quote_service.py's MARKET_HOURS - keep
// these two in sync if trading hours ever change.
const MARKET_HOURS: Record<Market, { openMin: number; closeMin: number }> = {
  IN: { openMin: 9 * 60 + 15, closeMin: 15 * 60 + 30 },
};

export const MARKET_CLOSE_LABEL: Record<Market, string> = {
  IN: "3:30 PM IST",
};

function marketWeekday(market: Market): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: MARKET_TIMEZONE[market], weekday: "short" }).format(
    new Date(),
  );
}

export function isWeekdayInMarket(market: Market): boolean {
  const weekday = marketWeekday(market);
  return weekday !== "Sat" && weekday !== "Sun";
}

export function isMarketOpen(market: Market): boolean {
  if (!isWeekdayInMarket(market)) return false;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TIMEZONE[market],
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const nowMin = hour * 60 + minute;
  const { openMin, closeMin } = MARKET_HOURS[market];
  return nowMin >= openMin && nowMin <= closeMin;
}
