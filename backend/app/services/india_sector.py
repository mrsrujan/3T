"""Fetch India sector/industry classification from NSE's NIFTY Total Market
index constituent list - the same NSE archives domain and NSESession/curl_cffi
pattern as india_fetch.py's Bhavcopy fetch (Akamai TLS fingerprinting applies
here too).

Only covers ~751 of the ~2,500 India equity symbols this app tracks (the
Nifty Total Market universe) - the rest stay sector=NULL. That's an accepted
gap, not a bug: fundamentals/sector-driven features aren't very useful for
micro-cap/illiquid names anyway.
"""

from __future__ import annotations

import logging
from io import StringIO

import pandas as pd

from app.services.india_fetch import NSESession

logger = logging.getLogger(__name__)

NIFTY_TOTAL_MARKET_URL = (
    "https://nsearchives.nseindia.com/content/indices/ind_niftytotalmarket_list.csv"
)
REFERER = "https://www.nseindia.com/market-data/live-equity-market"
REQUEST_TIMEOUT_SECONDS = 20

# Full listed-equity master (symbol -> company name), not sector-scoped -
# covers ~2,384 of the ~2,509 symbols this app tracks (the gap is ETFs/funds
# like NIFTYETF, GOLDADD, which aren't companies and have no "name" in this
# sense). This is the only free NSE source with company names for the full
# equity universe; the Nifty Total Market list below only covers ~751.
EQUITY_LIST_URL = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv"
EQUITY_LIST_REFERER = "https://www.nseindia.com/market-data/securities-available-for-trading"


def fetch_india_sector_data(session: NSESession | None = None) -> pd.DataFrame:
    """Return DataFrame[symbol, sector] for India's Nifty Total Market universe."""
    session = session or NSESession()
    if not session._warmed_up:
        session.warm_up()

    resp = session.session.get(
        NIFTY_TOTAL_MARKET_URL,
        headers={"Referer": REFERER},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    resp.raise_for_status()

    df = pd.read_csv(StringIO(resp.text))
    df.columns = [c.strip() for c in df.columns]
    df = df.rename(columns={"Symbol": "symbol", "Industry": "sector"})
    df["symbol"] = df["symbol"].astype(str).str.strip()
    df["sector"] = df["sector"].astype(str).str.strip()

    return df[["symbol", "sector"]].drop_duplicates(subset="symbol").reset_index(drop=True)


def fetch_india_name_data(session: NSESession | None = None) -> pd.DataFrame:
    """Return DataFrame[symbol, name] for NSE's full listed-equity master."""
    session = session or NSESession()
    if not session._warmed_up:
        session.warm_up()

    resp = session.session.get(
        EQUITY_LIST_URL,
        headers={"Referer": EQUITY_LIST_REFERER},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    resp.raise_for_status()

    df = pd.read_csv(StringIO(resp.text))
    df.columns = [c.strip() for c in df.columns]
    df = df.rename(columns={"SYMBOL": "symbol", "NAME OF COMPANY": "name"})
    df["symbol"] = df["symbol"].astype(str).str.strip()
    df["name"] = df["name"].astype(str).str.strip()

    return df[["symbol", "name"]].drop_duplicates(subset="symbol").reset_index(drop=True)
