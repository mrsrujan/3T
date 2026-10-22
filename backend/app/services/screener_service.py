from __future__ import annotations

from datetime import date
from typing import Literal

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import to_date


SortBy = Literal["pct_change", "volume", "rel_volume", "market_cap"]
MarketCapTier = Literal["small", "mid", "large"]

_MARKET_CAP_BOUNDS: dict[MarketCapTier, tuple[float | None, float | None]] = {
    "small": (None, 2e9),
    "mid": (2e9, 10e9),
    "large": (10e9, None),
}

_SORT_COL: dict[str, str] = {
    "pct_change": "dm.pct_change",
    "volume": "dm.volume",
    "rel_volume": "dm.rel_volume",
    "market_cap": "dm.close",  # proxy until fundamentals cache is consulted
}


def screen(
    db: Session,
    market: str,
    sector: str | None = None,
    min_pct_change: float | None = None,
    max_pct_change: float | None = None,
    min_rel_volume: float | None = None,
    market_cap_tier: MarketCapTier | None = None,
    min_pe: float | None = None,
    max_pe: float | None = None,
    sort_by: SortBy = "pct_change",
    limit: int = 50,
) -> tuple[list[dict], date | None]:
    """Returns (items, trade_date). Items are dicts matching ScreenerItem fields."""
    conditions = [
        "dm.market = :market",
        "s.is_active = 1",
        "dm.trade_date = (SELECT MAX(trade_date) FROM trading_calendar WHERE market = :market)",
        "dm.close IS NOT NULL",
    ]
    params: dict = {"market": market, "limit": min(limit, 200)}

    if sector:
        conditions.append("s.sector = :sector")
        params["sector"] = sector

    if min_pct_change is not None:
        conditions.append("dm.pct_change >= :min_pct")
        params["min_pct"] = min_pct_change

    if max_pct_change is not None:
        conditions.append("dm.pct_change <= :max_pct")
        params["max_pct"] = max_pct_change

    if min_rel_volume is not None:
        conditions.append("dm.rel_volume >= :min_relvol")
        params["min_relvol"] = min_rel_volume

    sort_col = _SORT_COL.get(sort_by, "dm.pct_change")
    where_clause = " AND ".join(conditions)

    sql = f"""
        SELECT s.symbol, s.name, s.sector,
               dm.close, dm.pct_change, dm.volume, dm.rel_volume, dm.trade_date
        FROM daily_metrics dm
        JOIN symbols s ON s.symbol_id = dm.symbol_id
        WHERE {where_clause}
        ORDER BY {sort_col} DESC NULLS LAST
        LIMIT :limit
    """
    rows = db.execute(text(sql), params).all()

    # Fetch trade_date independently so we return 200 with empty items
    # even when all rows are filtered out by pct_change/rel_volume conditions.
    date_row = db.execute(
        text("SELECT MAX(trade_date) AS trade_date FROM trading_calendar WHERE market = :market"),
        {"market": market},
    ).one()
    trade_date = to_date(date_row.trade_date)

    # Post-filter fundamentals from in-memory cache.
    # We include symbols with no cache entry (unknowns) to avoid excluding
    # everything on a fresh start when the cache is cold.
    from app.services.fundamentals import get_fundamentals

    items = []
    for r in rows:
        fund = get_fundamentals(r.symbol, market) if (market_cap_tier or min_pe or max_pe) else {}

        market_cap = fund.get("market_cap")
        pe = fund.get("pe_ratio")

        if market_cap_tier and market_cap is not None:
            lo, hi = _MARKET_CAP_BOUNDS[market_cap_tier]
            if lo is not None and market_cap < lo:
                continue
            if hi is not None and market_cap >= hi:
                continue

        if min_pe is not None and pe is not None and pe < min_pe:
            continue
        if max_pe is not None and pe is not None and pe > max_pe:
            continue

        items.append({
            "symbol": r.symbol,
            "name": r.name,
            "sector": r.sector,
            "close": r.close,
            "pct_change": r.pct_change,
            "volume": r.volume,
            "rel_volume": r.rel_volume,
            "market_cap": market_cap,
            "setups": [],
        })

    # Annotate with technical setups from the scanner cache (best-effort, non-blocking).
    try:
        from app.services.scanner_service import get_setups_map
        setups_map = get_setups_map(db, market)
        for item in items:
            item["setups"] = setups_map.get(item["symbol"], [])
    except Exception:
        pass

    return items, trade_date
