from __future__ import annotations

import logging
from datetime import date, datetime

from curl_cffi import requests as curl_requests

from app.services.cache import _cache

logger = logging.getLogger(__name__)

NSE_CALENDAR_TTL = 6 * 3600     # 6 hours (whole NSE calendar)
NSE_CALENDAR_CACHE_KEY = "nse:event_calendar"

NSE_CALENDAR_URL = "https://www.nseindia.com/api/event-calendar"
NSE_CALENDAR_REFERER = "https://www.nseindia.com/companies-listing/corporate-filings-board-meetings"


# ---------------------------------------------------------------------------
# NSE (India) earnings calendar
# ---------------------------------------------------------------------------

def _fetch_nse_event_calendar() -> dict[str, str]:
    """Fetch NSE event-calendar and return {symbol: date_iso} for board meetings
    that include Financial Results. Uses curl_cffi Chrome fingerprint to bypass
    Akamai TLS inspection (same as the Bhavcopy fetch)."""
    session = curl_requests.Session(impersonate="chrome124")
    session.headers.update({"Accept-Language": "en-US,en;q=0.9"})
    session.get("https://www.nseindia.com/", timeout=20)

    r = session.get(NSE_CALENDAR_URL, headers={"Referer": NSE_CALENDAR_REFERER}, timeout=20)
    r.raise_for_status()

    today_iso = date.today().isoformat()
    result: dict[str, str] = {}
    for item in r.json():
        if "financial results" not in item.get("purpose", "").lower():
            continue
        try:
            dt = datetime.strptime(item["date"], "%d-%b-%Y").date()
            if dt.isoformat() >= today_iso:
                result[item["symbol"]] = dt.isoformat()
        except (ValueError, KeyError):
            pass
    return result


def _get_nse_calendar() -> dict[str, str]:
    cached = _cache.get(NSE_CALENDAR_CACHE_KEY)
    if cached is not None:
        return cached
    try:
        data = _fetch_nse_event_calendar()
    except Exception:
        logger.warning("NSE event-calendar fetch failed; returning empty dict")
        data = {}
    _cache.set(NSE_CALENDAR_CACHE_KEY, data, NSE_CALENDAR_TTL)
    return data


def _get_earnings_in(symbols: list[str]) -> list[dict]:
    calendar = _get_nse_calendar()
    today_iso = date.today().isoformat()
    return [
        {"symbol": sym, "earnings_date": calendar[sym], "eps_estimate": None}
        for sym in symbols
        if sym in calendar and calendar[sym] >= today_iso
    ]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_earnings_for_symbols(symbols: list[str], market: str) -> list[dict]:
    return _get_earnings_in(symbols)
