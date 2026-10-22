"""On-demand fundamentals fetch via yfinance `.info`, cached in memory for 6h.
Bulk DB-writing functions have been removed; use get_fundamentals(symbol, market)
for per-symbol on-demand access.
"""

from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import pandas as pd
import yfinance as yf

from app.services.cache import _cache

logger = logging.getLogger(__name__)

MAX_WORKERS = 2  # Yahoo rate-limits aggressively; higher concurrency just
                 # burns through retries without improving throughput.
RETRY_BACKOFF_SECONDS = (1, 2, 4)
RATE_LIMIT_BACKOFF_SECONDS = (5, 15, 30)  # longer backoff specifically for 429s
FUNDAMENTALS_CACHE_TTL = 6 * 3600  # 6 hours


def _clean(value):
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    return value


def _yf_ticker_symbol(market: str, symbol: str) -> str:
    return f"{symbol}.NS"


def _is_rate_limit_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return "too many requests" in text or "rate limit" in text


def _fetch_one(market: str, symbol: str) -> dict:
    yf_symbol = _yf_ticker_symbol(market, symbol)
    last_error: str | None = None
    delay = 0

    for attempt in range(1, len(RETRY_BACKOFF_SECONDS) + 2):
        if delay:
            time.sleep(delay)
        try:
            info = yf.Ticker(yf_symbol).info or {}
            market_cap = info.get("marketCap")
            trailing_pe = info.get("trailingPE")
            forward_pe = info.get("forwardPE")
            # Detect staleness: when Yahoo has no forward estimates (common for
            # Indian NSE stocks), it returns the trailing P/E as forward. Null
            # out forward_pe when it is identical to trailing_pe.
            if forward_pe is not None and trailing_pe is not None and forward_pe == trailing_pe:
                forward_pe = None
            record = {
                "symbol": symbol,
                "market_cap": market_cap,
                "pe_ratio": trailing_pe,
                "forward_pe": forward_pe,
                "dividend_yield": info.get("dividendYield"),
                "roe": info.get("returnOnEquity"),
                "book_value": info.get("bookValue"),
                "debt_to_equity": info.get("debtToEquity"),
                "error_message": None,
            }
            # market_cap is the most reliably-populated field for a real,
            # covered ticker - its absence usually means yfinance has no (or
            # very thin) coverage for this symbol, not a transient failure.
            record["fetch_status"] = "ok" if market_cap is not None else "partial"
            return record
        except Exception as exc:
            last_error = str(exc)
            logger.warning("Fundamentals fetch attempt %d failed for %s: %s", attempt, yf_symbol, exc)
            # Rate-limit errors need a much longer cooldown than transient
            # network hiccups - short backoff just burns through retries
            # without the limit ever clearing.
            backoff_seq = RATE_LIMIT_BACKOFF_SECONDS if _is_rate_limit_error(exc) else RETRY_BACKOFF_SECONDS
            delay = backoff_seq[min(attempt - 1, len(backoff_seq) - 1)]

    return {
        "symbol": symbol,
        "market_cap": None,
        "pe_ratio": None,
        "forward_pe": None,
        "dividend_yield": None,
        "roe": None,
        "book_value": None,
        "debt_to_equity": None,
        "fetch_status": "failed",
        "error_message": (last_error or "unknown error")[:500],
    }


def _fetch_sector_one(market: str, symbol: str) -> dict:
    yf_symbol = _yf_ticker_symbol(market, symbol)
    delay = 0

    for attempt in range(1, len(RETRY_BACKOFF_SECONDS) + 2):
        if delay:
            time.sleep(delay)
        try:
            info = yf.Ticker(yf_symbol).info or {}
            return {"symbol": symbol, "sector": info.get("sector"), "industry": info.get("industry")}
        except Exception as exc:
            logger.warning("Sector fetch attempt %d failed for %s: %s", attempt, yf_symbol, exc)
            backoff_seq = RATE_LIMIT_BACKOFF_SECONDS if _is_rate_limit_error(exc) else RETRY_BACKOFF_SECONDS
            delay = backoff_seq[min(attempt - 1, len(backoff_seq) - 1)]

    return {"symbol": symbol, "sector": None, "industry": None}


def fetch_sector_for_symbols(symbols: list[str], market: str) -> pd.DataFrame:
    """Fallback sector/industry source via yfinance .info, for symbols that
    have no sector from the NSE source (india_sector.py). That stays the
    authoritative/preferred source where available - this only fills symbols
    still NULL after that pass, so a symbol's sector never gets silently
    overwritten with a different taxonomy (Yahoo's GICS-like labels vs NSE's
    own industry labels)."""
    results: list[dict] = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(_fetch_sector_one, market, sym): sym for sym in symbols}
        for future in as_completed(futures):
            results.append(future.result())
    return pd.DataFrame(results)


def fetch_fundamentals_for_symbols(symbols: list[str], market: str) -> pd.DataFrame:
    results: list[dict] = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(_fetch_one, market, sym): sym for sym in symbols}
        for future in as_completed(futures):
            results.append(future.result())
    return pd.DataFrame(results)


def get_fundamentals(symbol: str, market: str) -> dict:
    """On-demand fetch for a single symbol. Returns {} on any failure."""
    cache_key = f"fundamentals:{market}:{symbol}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached
    result = _fetch_one(market, symbol)
    _cache.set(cache_key, result, FUNDAMENTALS_CACHE_TTL)
    return result
