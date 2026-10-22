"""Single-user watchlist CRUD."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import Watchlist


def get_watchlist(db: Session, market: str | None) -> list[dict]:
    market_clause = "AND w.market = :market" if market and market != "ALL" else ""
    params: dict = {}
    if market and market != "ALL":
        params["market"] = market

    rows = db.execute(
        text(
            f"""
            SELECT w.id, w.market, s.symbol, s.name, w.added_at, dm.close, dm.pct_change
            FROM watchlist w
            JOIN symbols s ON s.symbol_id = w.symbol_id
            LEFT JOIN daily_metrics dm ON dm.symbol_id = w.symbol_id
              AND dm.trade_date = (SELECT MAX(trade_date) FROM daily_metrics WHERE symbol_id = w.symbol_id)
            WHERE 1=1 {market_clause}
            ORDER BY w.added_at DESC
            """
        ),
        params,
    ).all()

    return [
        {
            "id": r.id,
            "market": r.market,
            "symbol": r.symbol,
            "name": r.name,
            "added_at": r.added_at,
            "close": r.close,
            "pct_change": r.pct_change,
        }
        for r in rows
    ]


def add_to_watchlist(db: Session, market: str, symbol: str) -> dict | None:
    """Returns None if the symbol is unknown; the created row dict otherwise
    (or the existing row if already present - idempotent)."""
    symbol_row = db.execute(
        text("SELECT symbol_id FROM symbols WHERE market = :market AND symbol = :symbol"),
        {"market": market, "symbol": symbol},
    ).first()
    if symbol_row is None:
        return None
    symbol_id = symbol_row.symbol_id

    existing = db.query(Watchlist).filter(Watchlist.symbol_id == symbol_id).first()
    if existing is None:
        entry = Watchlist(symbol_id=symbol_id, market=market, added_at=datetime.utcnow())
        db.add(entry)
        db.commit()
        db.refresh(entry)
    else:
        entry = existing

    return {"id": entry.id, "market": entry.market, "symbol": symbol, "added_at": entry.added_at}


def remove_from_watchlist(db: Session, market: str, symbol: str) -> bool:
    row = db.execute(
        text(
            "SELECT w.id FROM watchlist w JOIN symbols s ON s.symbol_id = w.symbol_id "
            "WHERE w.market = :market AND s.symbol = :symbol"
        ),
        {"market": market, "symbol": symbol},
    ).first()
    if row is None:
        return False
    db.query(Watchlist).filter(Watchlist.id == row.id).delete()
    db.commit()
    return True
