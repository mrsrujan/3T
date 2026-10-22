"""On-demand live quote for a single symbol via yfinance `fast_info` - a
low-frequency, single-symbol read (one call per open stock-detail page,
polled client-side every ~30s), the same category of usage already allowed
for India in fundamentals.py. Never used for bulk/universe price data - that
stays on NSE Bhavcopy for India, exactly as before.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime
from zoneinfo import ZoneInfo

import yfinance as yf

logger = logging.getLogger(__name__)

RETRY_BACKOFF_SECONDS = (1, 2, 4)

# Short in-process cache so multiple tabs/devices polling the same symbol
# don't each hit yfinance - one upstream call per symbol per TTL window.
CACHE_TTL_SECONDS = 20
_quote_cache: dict[tuple[str, str], tuple[float, dict]] = {}

INTRADAY_CACHE_TTL_SECONDS = 60
_intraday_cache: dict[tuple[str, str], tuple[float, list[dict]]] = {}

MARKET_TZ = {
    "IN": ZoneInfo("Asia/Kolkata"),
}
# (open_hour, open_minute, close_hour, close_minute) in the market's own zone
MARKET_HOURS = {
    "IN": (9, 15, 15, 30),
}


def is_market_open(market: str) -> bool:
    tz = MARKET_TZ[market]
    now = datetime.now(tz)
    if now.weekday() >= 5:  # Sat/Sun
        return False
    open_h, open_m, close_h, close_m = MARKET_HOURS[market]
    open_minutes = open_h * 60 + open_m
    close_minutes = close_h * 60 + close_m
    now_minutes = now.hour * 60 + now.minute
    return open_minutes <= now_minutes <= close_minutes


def _yf_ticker_symbol(market: str, symbol: str) -> str:
    return f"{symbol}.NS"


def get_live_quote(market: str, symbol: str) -> dict:
    cache_key = (market, symbol)
    cached = _quote_cache.get(cache_key)
    if cached and (time.time() - cached[0]) < CACHE_TTL_SECONDS:
        return cached[1]

    yf_symbol = _yf_ticker_symbol(market, symbol)
    market_open = is_market_open(market)

    last_error: str | None = None
    delay = 0
    for attempt in range(1, len(RETRY_BACKOFF_SECONDS) + 2):
        if delay:
            time.sleep(delay)
        try:
            fast_info = yf.Ticker(yf_symbol).fast_info
            price = fast_info.get("lastPrice")
            prev_close = fast_info.get("previousClose")
            if price is None:
                raise ValueError("no lastPrice in fast_info")
            change_value = price - prev_close if prev_close else None
            change_pct = (change_value / prev_close * 100) if change_value is not None and prev_close else None
            quote = {
                "price": price,
                "change_value": change_value,
                "change_pct": change_pct,
                "is_market_open": market_open,
                "as_of": datetime.utcnow().isoformat(),
            }
            _quote_cache[cache_key] = (time.time(), quote)
            return quote
        except Exception as exc:
            last_error = str(exc)
            logger.warning("Live quote attempt %d failed for %s: %s", attempt, yf_symbol, exc)
            delay = RETRY_BACKOFF_SECONDS[min(attempt - 1, len(RETRY_BACKOFF_SECONDS) - 1)]

    logger.error("Live quote failed for %s: %s", yf_symbol, last_error)
    return {
        "price": None,
        "change_value": None,
        "change_pct": None,
        "is_market_open": market_open,
        "as_of": datetime.utcnow().isoformat(),
    }


def get_intraday(market: str, symbol: str) -> list[dict]:
    """5-minute bars for the most recent session via yfinance. Returns [] on
    failure so the UI can fall back to the daily chart. Times are epoch
    seconds (UTC) - the chart lib renders them in the viewer's local zone."""
    cache_key = (market, symbol)
    cached = _intraday_cache.get(cache_key)
    if cached and (time.time() - cached[0]) < INTRADAY_CACHE_TTL_SECONDS:
        return cached[1]

    yf_symbol = _yf_ticker_symbol(market, symbol)
    try:
        hist = yf.Ticker(yf_symbol).history(period="1d", interval="5m")
    except Exception:
        logger.exception("Intraday fetch failed for %s", yf_symbol)
        return []

    points: list[dict] = []
    for ts, row in hist.iterrows():
        close = row.get("Close")
        if close is None or close != close:  # NaN check
            continue
        points.append(
            {
                "time": int(ts.timestamp()),
                "price": round(float(close), 4),
                "volume": int(row["Volume"]) if row.get("Volume") == row.get("Volume") else None,
            }
        )

    _intraday_cache[cache_key] = (time.time(), points)
    return points
