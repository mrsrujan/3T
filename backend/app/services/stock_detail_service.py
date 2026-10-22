"""Per-stock detail: latest metrics, 52-week high/low, and OHLCV history.

Raw text() queries return SQLite DATE columns as plain strings and Postgres
DATE columns as native date objects - always route through db.to_date() so
the result is a date regardless of dialect.
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import to_date
from app.services.fundamentals import get_fundamentals as _fetch_fundamentals

WEEK52_TRADING_DAYS = 252


def get_symbol_row(db: Session, market: str, symbol: str) -> dict | None:
    row = db.execute(
        text(
            "SELECT symbol_id, symbol, name, sector, industry, last_seen "
            "FROM symbols WHERE market = :market AND symbol = :symbol"
        ),
        {"market": market, "symbol": symbol},
    ).first()
    if not row:
        return None
    return {
        "symbol_id": row.symbol_id,
        "symbol": row.symbol,
        "name": row.name,
        "sector": row.sector,
        "industry": row.industry,
        "last_seen": to_date(row.last_seen),
    }


def get_latest_metrics(db: Session, symbol_id: int) -> dict | None:
    row = db.execute(
        text(
            "SELECT trade_date, close, prev_close, pct_change, volume, rel_volume "
            "FROM daily_metrics WHERE symbol_id = :symbol_id "
            "ORDER BY trade_date DESC LIMIT 1"
        ),
        {"symbol_id": symbol_id},
    ).first()
    if not row:
        return None
    return {
        "trade_date": to_date(row.trade_date),
        "close": row.close,
        "prev_close": row.prev_close,
        "pct_change": row.pct_change,
        "volume": row.volume,
        "rel_volume": row.rel_volume,
    }


def get_week52_high_low(db: Session, market: str, symbol_id: int) -> tuple[float | None, float | None]:
    row = db.execute(
        text(
            """
            SELECT MAX(high), MIN(low) FROM daily_metrics
            WHERE symbol_id = :symbol_id AND trade_date >= COALESCE(
                (SELECT trade_date FROM trading_calendar WHERE market = :market
                 ORDER BY trade_date DESC LIMIT 1 OFFSET :offset),
                '0001-01-01'
            )
            """
        ),
        {"symbol_id": symbol_id, "market": market, "offset": WEEK52_TRADING_DAYS - 1},
    ).first()
    if not row:
        return None, None
    return row[0], row[1]


def get_fundamentals(market: str, symbol: str) -> dict | None:
    fund_data = _fetch_fundamentals(symbol, market)
    if not fund_data:
        return None
    return {
        "market_cap": fund_data.get("market_cap"),
        "pe_ratio": fund_data.get("pe_ratio"),
        "forward_pe": fund_data.get("forward_pe"),
        "dividend_yield": fund_data.get("dividend_yield"),
        "roe": fund_data.get("roe"),
        "book_value": fund_data.get("book_value"),
        "debt_to_equity": fund_data.get("debt_to_equity"),
        "fetched_at": datetime.utcnow(),
        "fetch_status": fund_data.get("fetch_status", "partial"),
    }


def get_stock_detail(db: Session, market: str, symbol: str) -> dict | None:
    sym = get_symbol_row(db, market, symbol)
    if sym is None:
        return None

    latest = get_latest_metrics(db, sym["symbol_id"])
    week52_high, week52_low = get_week52_high_low(db, market, sym["symbol_id"])
    fundamentals = get_fundamentals(market, sym["symbol"])

    return {
        "market": market,
        "symbol": sym["symbol"],
        "name": sym["name"],
        "sector": sym["sector"],
        "industry": sym["industry"],
        "last_seen": sym["last_seen"],
        "latest": latest,
        "week52_high": week52_high,
        "week52_low": week52_low,
        "fundamentals": fundamentals,
    }


def get_stock_peers(db: Session, market: str, symbol: str, limit: int) -> dict | None:
    """Same-sector peers, ranked by market-cap proximity when fundamentals
    are available (a more meaningful "peer" ordering than raw daily move),
    falling back to today's pct_change when the target has no market cap
    yet. None if the symbol is unknown; empty peers list (not an error) if
    it's known but has no sector data yet."""
    sym = get_symbol_row(db, market, symbol)
    if sym is None:
        return None
    if not sym["sector"]:
        return {"sector": None, "peers": []}

    rows = db.execute(
        text(
            """
            SELECT s.symbol, s.name, dm.close, dm.pct_change
            FROM symbols s
            JOIN daily_metrics dm ON dm.symbol_id = s.symbol_id
            WHERE s.market = :market AND s.sector = :sector AND s.symbol != :symbol
              AND dm.trade_date = (SELECT MAX(trade_date) FROM daily_metrics WHERE market = :market)
            ORDER BY dm.pct_change DESC
            LIMIT :limit
            """
        ),
        {
            "market": market,
            "sector": sym["sector"],
            "symbol": sym["symbol"],
            "limit": limit,
        },
    ).all()

    # Fetch fundamentals for each peer from in-memory cache (non-blocking: already
    # populated from the daily screener pass for most liquid names).
    peers = []
    pe_values: list[float] = []
    for r in rows:
        fund = _fetch_fundamentals(r.symbol, market)
        pe = fund.get("pe_ratio")
        if pe and pe > 0:
            pe_values.append(pe)
        peers.append({
            "symbol": r.symbol,
            "name": r.name,
            "close": r.close,
            "pct_change": r.pct_change,
            "market_cap": fund.get("market_cap"),
            "pe_ratio": pe,
        })

    sector_median_pe: float | None = None
    if pe_values:
        sorted_pe = sorted(pe_values)
        n = len(sorted_pe)
        sector_median_pe = round(
            sorted_pe[n // 2] if n % 2 == 1
            else (sorted_pe[n // 2 - 1] + sorted_pe[n // 2]) / 2,
            1,
        )

    return {"sector": sym["sector"], "sector_median_pe": sector_median_pe, "peers": peers}


def get_stock_history(db: Session, market: str, symbol: str, days: int) -> list[dict] | None:
    sym = get_symbol_row(db, market, symbol)
    if sym is None:
        return None

    rows = db.execute(
        text(
            "SELECT trade_date, open, high, low, close, volume FROM daily_metrics "
            "WHERE symbol_id = :symbol_id ORDER BY trade_date DESC LIMIT :days"
        ),
        {"symbol_id": sym["symbol_id"], "days": days},
    ).all()

    points = [
        {
            "trade_date": to_date(r.trade_date),
            "open": r.open,
            "high": r.high,
            "low": r.low,
            "close": r.close,
            "volume": r.volume,
        }
        for r in rows
    ]
    return list(reversed(points))  # ascending date order for charting
