"""Global stock index and commodity snapshot for the "Global Markets" panel.

Unlike the main US/India stock universes (which use NSE Bhavcopy / yfinance
bulk downloads for thousands of tickers daily), this is a small fixed list of
~9 tickers refreshed occasionally - a good, low-volume fit for yfinance's
per-ticker `.history()`, which the app already treats as fine for
low-frequency reads (see fundamentals.py). Results are cached in-process for
CACHE_TTL_SECONDS so repeated page loads don't refetch from yfinance each time.
"""

from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

import yfinance as yf

logger = logging.getLogger(__name__)

MAX_WORKERS = 3
RETRY_BACKOFF_SECONDS = (1, 2, 4)
RATE_LIMIT_BACKOFF_SECONDS = (5, 15, 30)
CACHE_TTL_SECONDS = 15 * 60

# (ticker, display name, country code) - country code drives the flag shown
# in the UI, not just a label.
INDEXES = [
    ("^GSPC", "S&P 500", "US"),
    ("^NSEI", "Nifty 50", "IN"),
    ("^BSESN", "Sensex", "IN"),
    ("000001.SS", "Shanghai Composite", "CN"),
    ("^KS11", "KOSPI", "KR"),
    ("^TWII", "TAIEX", "TW"),
    ("^N225", "Nikkei 225", "JP"),
]

COMMODITIES = [
    ("GC=F", "Gold", "USD"),
    ("SI=F", "Silver", "USD"),
    ("CL=F", "Crude Oil (WTI)", "USD"),
    ("BZ=F", "Crude Oil (Brent)", "USD"),
    ("NG=F", "Natural Gas", "USD"),
    ("HG=F", "Copper", "USD"),
    ("PL=F", "Platinum", "USD"),
]

_cache: dict | None = None
_cache_at: float = 0.0


def _is_rate_limit_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return "too many requests" in text or "rate limit" in text


def _fetch_one(ticker: str) -> dict:
    delay = 0
    last_error: str | None = None

    for attempt in range(1, len(RETRY_BACKOFF_SECONDS) + 2):
        if delay:
            time.sleep(delay)
        try:
            hist = yf.Ticker(ticker).history(period="5d")
            closes = hist["Close"].dropna()
            if len(closes) < 1:
                return {"ticker": ticker, "price": None, "prev_close": None}
            price = float(closes.iloc[-1])
            prev_close = float(closes.iloc[-2]) if len(closes) >= 2 else None
            return {"ticker": ticker, "price": price, "prev_close": prev_close}
        except Exception as exc:
            last_error = str(exc)
            logger.warning("Global market fetch attempt %d failed for %s: %s", attempt, ticker, exc)
            backoff_seq = RATE_LIMIT_BACKOFF_SECONDS if _is_rate_limit_error(exc) else RETRY_BACKOFF_SECONDS
            delay = backoff_seq[min(attempt - 1, len(backoff_seq) - 1)]

    logger.error("Global market fetch failed for %s: %s", ticker, last_error)
    return {"ticker": ticker, "price": None, "prev_close": None}


def _fetch_all(items: list[tuple[str, str, str]]) -> dict[str, dict]:
    tickers = [t[0] for t in items]
    results: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(_fetch_one, t): t for t in tickers}
        for future in as_completed(futures):
            r = future.result()
            results[r["ticker"]] = r
    return results


def _build_items(items: list[tuple[str, str, str]], quotes: dict[str, dict]) -> list[dict]:
    out = []
    for ticker, name, code in items:
        q = quotes.get(ticker, {})
        price = q.get("price")
        prev_close = q.get("prev_close")
        change_value = price - prev_close if price is not None and prev_close is not None else None
        change_pct = (change_value / prev_close * 100) if change_value is not None and prev_close else None
        out.append(
            {
                "symbol": ticker,
                "name": name,
                "code": code,
                "price": price,
                "change_value": change_value,
                "change_pct": change_pct,
            }
        )
    return out


# Benchmark index for the stock-compare overlay.
BENCHMARK_INDEX = {
    "IN": ("^NSEI", "Nifty 50"),
}

INDEX_HISTORY_TTL_SECONDS = 60 * 60
_index_history_cache: dict[tuple[str, int], tuple[float, list[dict]]] = {}

# Whitelist of tickers allowed for arbitrary history fetches
VALID_HISTORY_SYMBOLS: dict[str, str] = {
    ticker: name for ticker, name, _ in INDEXES + COMMODITIES
}
# Macro/FX drivers for the Global linkages tab
VALID_HISTORY_SYMBOLS.update({
    "^TNX": "US 10Y Yield",
    "DX=F": "Dollar Index",
    "^INDIAVIX": "India VIX",
    "USDINR=X": "USD/INR",
})
# SPDR sector ETFs for the Global linkages tab (US sector overlay)
VALID_HISTORY_SYMBOLS.update({
    "XLK": "Tech ETF",
    "XLC": "Comm ETF",
    "XLV": "Health ETF",
    "XLF": "Financials ETF",
    "XLY": "Cons Disc ETF",
    "XLP": "Cons Staples ETF",
    "XLE": "Energy ETF",
    "XLI": "Industrials ETF",
    "XLB": "Materials ETF",
    "XLRE": "Real Estate ETF",
    "XLU": "Utilities ETF",
})


def get_index_history(market: str, days: int) -> dict:
    """Daily closes for the market's benchmark index, for overlay comparison
    against a stock. Index prices aren't in our DB (Bhavcopy/universe covers
    equities only), so this comes from yfinance with a long TTL cache."""
    ticker, name = BENCHMARK_INDEX[market]

    cache_key = (market, days)
    cached = _index_history_cache.get(cache_key)
    if cached and (time.time() - cached[0]) < INDEX_HISTORY_TTL_SECONDS:
        return {"symbol": ticker, "name": name, "points": cached[1]}

    try:
        hist = yf.Ticker(ticker).history(period=f"{days}d")
    except Exception:
        logger.exception("Index history fetch failed for %s", ticker)
        return {"symbol": ticker, "name": name, "points": []}

    points: list[dict] = []
    for ts, row in hist.iterrows():
        close = row.get("Close")
        if close is None or close != close:
            continue
        points.append({"trade_date": ts.date().isoformat(), "close": round(float(close), 2)})

    _index_history_cache[cache_key] = (time.time(), points)
    return {"symbol": ticker, "name": name, "points": points}


def get_symbol_history(symbol: str, days: int) -> dict:
    """Daily closes for any whitelisted world index or commodity ticker."""
    name = VALID_HISTORY_SYMBOLS[symbol]
    cache_key = (symbol, days)
    cached = _index_history_cache.get(cache_key)
    if cached and (time.time() - cached[0]) < INDEX_HISTORY_TTL_SECONDS:
        return {"symbol": symbol, "name": name, "points": cached[1]}

    try:
        hist = yf.Ticker(symbol).history(period=f"{days}d")
    except Exception:
        logger.exception("Symbol history fetch failed for %s", symbol)
        return {"symbol": symbol, "name": name, "points": []}

    points: list[dict] = []
    for ts, row in hist.iterrows():
        close = row.get("Close")
        if close is None or close != close:
            continue
        points.append({"trade_date": ts.date().isoformat(), "close": round(float(close), 4)})

    _index_history_cache[cache_key] = (time.time(), points)
    return {"symbol": symbol, "name": name, "points": points}


def get_global_markets(force_refresh: bool = False) -> dict:
    global _cache, _cache_at

    if not force_refresh and _cache is not None and (time.time() - _cache_at) < CACHE_TTL_SECONDS:
        return _cache

    all_items = INDEXES + COMMODITIES
    quotes = _fetch_all(all_items)

    result = {
        "indexes": _build_items(INDEXES, quotes),
        "commodities": _build_items(COMMODITIES, quotes),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }
    _cache = result
    _cache_at = time.time()
    return result
