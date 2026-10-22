"""Sector-grouped heatmap data. Only sector-tagged symbols appear (see
known gap: ~751/2500 India symbols, all 518 US symbols)."""

from __future__ import annotations

from datetime import date
from itertools import groupby

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import TradingCalendar


def _nearest_available_date(db: Session, market: str, requested: date) -> date | None:
    # trading_calendar is tiny (~400 rows/market) - pulling all candidates
    # and picking nearest in Python keeps the SQL portable across dialects.
    rows = (
        db.query(TradingCalendar.trade_date)
        .filter(TradingCalendar.market == market)
        .all()
    )
    if not rows:
        return None
    return min((row[0] for row in rows), key=lambda d: abs((d - requested).days))


def get_heatmap(db: Session, market: str, trade_date: date) -> dict | None:
    """Returns None (caller 404s) if there's no data for that date at all;
    an empty sectors list is valid (just means no sector-tagged symbols have
    data yet)."""
    rows = db.execute(
        text(
            """
            SELECT s.sector, s.symbol, s.name, dm.pct_change, dm.volume
            FROM daily_metrics dm
            JOIN symbols s ON s.symbol_id = dm.symbol_id
            WHERE dm.market = :market AND dm.trade_date = :trade_date
              AND s.sector IS NOT NULL
            ORDER BY s.sector, dm.pct_change DESC
            """
        ),
        {"market": market, "trade_date": trade_date.isoformat()},
    ).all()

    if not rows:
        any_data = db.execute(
            text("SELECT 1 FROM daily_metrics WHERE market = :market AND trade_date = :trade_date LIMIT 1"),
            {"market": market, "trade_date": trade_date.isoformat()},
        ).first()
        if not any_data:
            return None
        return {"sectors": []}

    sectors = []
    for sector, group in groupby(rows, key=lambda r: r.sector):
        symbols = [
            {
                "symbol": r.symbol,
                "name": r.name,
                "pct_change": r.pct_change,
                "volume": r.volume,
                "market_cap": None,
            }
            for r in group
        ]
        sectors.append({"sector": sector, "symbols": symbols})

    return {"sectors": sectors}


def get_heatmap_or_nearest(db: Session, market: str, trade_date: date) -> tuple[dict | None, date | None]:
    result = get_heatmap(db, market, trade_date)
    if result is None:
        return None, _nearest_available_date(db, market, trade_date)
    return result, None
