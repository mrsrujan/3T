from datetime import date, datetime
from zoneinfo import ZoneInfo

# All trade_date values are the market's LOCAL trading date, never UTC-shifted,
# to avoid off-by-one-day bugs around each market's close time.
MARKET_TIMEZONES = {
    "IN": ZoneInfo("Asia/Kolkata"),
}


def latest_applicable_trading_date(market: str) -> date:
    """Today's date in `market`'s local timezone. Whether it's actually a
    trading day is resolved downstream by the fetch layer (404/skip)."""
    return datetime.now(MARKET_TIMEZONES[market]).date()
