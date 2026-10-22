"""NSE market data: FII/DII flows.

All NSE calls use curl_cffi Chrome impersonation (same as earnings_service and
bhavcopy fetch) to bypass Akamai TLS fingerprinting.
"""
from __future__ import annotations

import logging
import time

from curl_cffi import requests as curl_requests

logger = logging.getLogger(__name__)

_CACHE: dict[str, tuple[float, object]] = {}
_TTL = 30 * 60  # 30 minutes


def _cached(key: str, ttl: int = _TTL):
    entry = _CACHE.get(key)
    if entry and time.time() - entry[0] < ttl:
        return entry[1]
    return None


def _store(key: str, value: object, ttl: int = _TTL):
    _CACHE[key] = (time.time(), value)


NSE_BASE = "https://www.nseindia.com"
NSE_HEADERS = {
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "application/json, text/plain, */*",
}


def _nse_session() -> curl_requests.Session:
    session = curl_requests.Session(impersonate="chrome124")
    session.headers.update(NSE_HEADERS)
    session.get(NSE_BASE + "/", timeout=20)
    return session


# ── FII / DII Flows ────────────────────────────────────────────────────────────

def get_fii_dii(days: int = 20) -> list[dict]:
    key = f"fii_dii:{days}"
    cached = _cached(key)
    if cached is not None:
        return cached  # type: ignore[return-value]

    result: list[dict] = []
    try:
        session = _nse_session()
        r = session.get(
            NSE_BASE + "/api/fiidiiTradeReact",
            headers={"Referer": NSE_BASE + "/market-data/fii-dii-stats"},
            timeout=20,
        )
        r.raise_for_status()
        data = r.json()
        for item in (data or [])[:days]:
            try:
                result.append({
                    "date": item.get("date", ""),
                    "fii_buy": _safe_float(item.get("fi_buy_val") or item.get("fiiBuy")),
                    "fii_sell": _safe_float(item.get("fi_sell_val") or item.get("fiiSell")),
                    "fii_net": _safe_float(item.get("fi_net_val") or item.get("fiiNet")),
                    "dii_buy": _safe_float(item.get("dii_buy_val") or item.get("diiBuy")),
                    "dii_sell": _safe_float(item.get("dii_sell_val") or item.get("diiSell")),
                    "dii_net": _safe_float(item.get("dii_net_val") or item.get("diiNet")),
                })
            except Exception:
                continue
    except Exception:
        logger.exception("FII/DII fetch failed")

    _store(key, result)
    return result


# ── Helpers ───────────────────────────────────────────────────────────────────

def _safe_float(val) -> float | None:
    if val is None:
        return None
    try:
        s = str(val).replace(",", "").strip()
        return float(s) if s else None
    except (ValueError, TypeError):
        return None
