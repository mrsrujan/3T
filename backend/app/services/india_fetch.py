"""Fetch NSE India's daily Bhavcopy (full-market end-of-day CSV) for a given date.

Bhavcopy covers every NSE-listed security in one request per day (no per-ticker
looping, no rate limits). Historical dates are available; weekends/holidays 404.
The NSE-live gainers/losers/most-active JSON endpoints are NOT used here because
they only reflect the current/live session, not historical dates.
"""

from __future__ import annotations

import logging
from datetime import date
from io import StringIO

import pandas as pd
from curl_cffi import requests as curl_requests

logger = logging.getLogger(__name__)

# NSE's Akamai edge fingerprints the TLS ClientHello (JA3), not just HTTP
# headers - plain `requests`/urllib3 gets a 403 even with byte-identical
# headers to a working curl request. curl_cffi impersonates a real Chrome
# TLS handshake, which gets through. Verified: plain `requests` -> 403,
# curl_cffi(impersonate="chrome124") -> 200, for the exact same headers.
IMPERSONATE = "chrome124"

NSE_HOME_URL = "https://www.nseindia.com/"
BHAVCOPY_URL_TEMPLATE = (
    "https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_{date_str}.csv"
)
BHAVCOPY_REFERER = "https://www.nseindia.com/all-reports"

REQUEST_TIMEOUT_SECONDS = 20

# Bhavcopy source columns -> our standardized names
COLUMN_RENAME = {
    "SYMBOL": "symbol",
    "SERIES": "series",
    "PREV_CLOSE": "prev_close",
    "OPEN_PRICE": "open",
    "HIGH_PRICE": "high",
    "LOW_PRICE": "low",
    "CLOSE_PRICE": "close",
    "TTL_TRD_QNTY": "volume",
    "TURNOVER_LACS": "turnover",
}


class NSESession:
    """A curl_cffi Session (Chrome TLS fingerprint) that carries NSE's cookies
    after a homepage warm-up."""

    def __init__(self) -> None:
        self.session = curl_requests.Session(impersonate=IMPERSONATE)
        self.session.headers.update({"Accept-Language": "en-US,en;q=0.9"})
        self._warmed_up = False

    def warm_up(self) -> None:
        resp = self.session.get(NSE_HOME_URL, timeout=REQUEST_TIMEOUT_SECONDS)
        resp.raise_for_status()
        self._warmed_up = True

    def fetch_bhavcopy(self, trade_date: date) -> pd.DataFrame | None:
        """Return a DataFrame of EQ-series rows for `trade_date`, or None if
        the date has no data (non-trading day) or the fetch ultimately fails.
        """
        if not self._warmed_up:
            self.warm_up()

        url = BHAVCOPY_URL_TEMPLATE.format(date_str=trade_date.strftime("%d%m%Y"))
        headers = {"Referer": BHAVCOPY_REFERER}

        resp = self.session.get(url, headers=headers, timeout=REQUEST_TIMEOUT_SECONDS)

        if resp.status_code == 404:
            logger.info("NSE bhavcopy: no data for %s (non-trading day)", trade_date)
            return None

        if resp.status_code in (401, 403):
            logger.warning("NSE bhavcopy: session rejected for %s, re-warming once", trade_date)
            self.warm_up()
            resp = self.session.get(url, headers=headers, timeout=REQUEST_TIMEOUT_SECONDS)
            if resp.status_code != 200:
                logger.error(
                    "NSE bhavcopy: retry failed for %s (status %s)", trade_date, resp.status_code
                )
                return None

        if resp.status_code != 200:
            logger.error(
                "NSE bhavcopy: unexpected status %s for %s", resp.status_code, trade_date
            )
            return None

        return _parse_bhavcopy_csv(resp.text, trade_date)


def _parse_bhavcopy_csv(csv_text: str, trade_date: date) -> pd.DataFrame:
    df = pd.read_csv(StringIO(csv_text))
    df.columns = [c.strip() for c in df.columns]

    missing = set(COLUMN_RENAME) - set(df.columns)
    if missing:
        raise ValueError(f"NSE bhavcopy for {trade_date} is missing expected columns: {missing}")

    df = df.rename(columns=COLUMN_RENAME)
    for col in ("symbol", "series"):
        df[col] = df[col].astype(str).str.strip()

    df = df[df["series"] == "EQ"].copy()
    df["trade_date"] = trade_date

    keep = [
        "symbol",
        "trade_date",
        "open",
        "high",
        "low",
        "close",
        "prev_close",
        "volume",
        "turnover",
    ]
    return df[keep].reset_index(drop=True)
