"""Single-user portfolio holdings CRUD, with P&L always computed live at
read time against the latest daily_metrics close (never stored)."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import Holding


def _parse_date(value) -> date | None:
    if value is None:
        return None
    return date.fromisoformat(value) if isinstance(value, str) else value


def _with_pnl(row) -> dict:
    is_closed = row.sell_price is not None
    cost_basis = row.buy_price * row.quantity

    if is_closed:
        # Realized: valued at the actual sell price, latest close irrelevant.
        current_price = row.sell_price
        market_value = row.sell_price * row.quantity
    else:
        current_price = row.close
        market_value = current_price * row.quantity if current_price is not None else None

    pnl = market_value - cost_basis if market_value is not None else None
    pnl_pct = (pnl / cost_basis * 100) if pnl is not None and cost_basis else None
    return {
        "id": row.id,
        "market": row.market,
        "symbol": row.symbol,
        "name": row.name,
        "sector": row.sector,
        "quantity": row.quantity,
        "buy_price": row.buy_price,
        "buy_date": _parse_date(row.buy_date),
        "sell_price": row.sell_price,
        "sell_date": _parse_date(row.sell_date),
        "is_closed": is_closed,
        "notes": row.notes,
        "current_price": current_price,
        "market_value": market_value,
        "pnl": pnl,
        "pnl_pct": pnl_pct,
    }


def get_holdings(db: Session) -> list[dict]:
    rows = db.execute(
        text(
            """
            SELECT h.id, h.market, s.symbol, s.name, s.sector, h.quantity, h.buy_price, h.buy_date,
                   h.sell_price, h.sell_date, h.notes, dm.close
            FROM holdings h
            JOIN symbols s ON s.symbol_id = h.symbol_id
            LEFT JOIN daily_metrics dm ON dm.symbol_id = h.symbol_id
              AND dm.trade_date = (SELECT MAX(trade_date) FROM daily_metrics WHERE symbol_id = h.symbol_id)
            ORDER BY h.created_at DESC
            """
        )
    ).all()
    return [_with_pnl(r) for r in rows]


def get_holdings_summary(db: Session) -> dict:
    holdings = get_holdings(db)
    open_holdings = [h for h in holdings if not h["is_closed"]]
    closed_holdings = [h for h in holdings if h["is_closed"]]

    # Open positions drive invested/market-value; closed ones only contribute
    # a realized-P&L figure (their capital is no longer deployed).
    by_market: dict[str, dict] = {}
    for h in open_holdings:
        cost = h["buy_price"] * h["quantity"]
        mv = h["market_value"] if h["market_value"] is not None else cost
        bucket = by_market.setdefault(h["market"], {"invested": 0.0, "market_value": 0.0, "realized_pnl": 0.0})
        bucket["invested"] += cost
        bucket["market_value"] += mv

    for h in closed_holdings:
        bucket = by_market.setdefault(h["market"], {"invested": 0.0, "market_value": 0.0, "realized_pnl": 0.0})
        bucket["realized_pnl"] += h["pnl"] or 0.0

    for bucket in by_market.values():
        bucket["pnl"] = bucket["market_value"] - bucket["invested"]
        bucket["pnl_pct"] = (bucket["pnl"] / bucket["invested"] * 100) if bucket["invested"] else None

    invested_inr = sum(bucket["invested"] for bucket in by_market.values())
    mv_inr = sum(bucket["market_value"] for bucket in by_market.values())
    realized_inr = sum(bucket["realized_pnl"] for bucket in by_market.values())

    summary: dict = {
        "fx_rate_usd_inr": None,
        "total_invested_inr": invested_inr,
        "total_market_value_inr": mv_inr,
        "total_pnl_inr": mv_inr - invested_inr,
        "total_pnl_pct": ((mv_inr - invested_inr) / invested_inr * 100) if invested_inr else None,
        "total_market_value_usd": None,
        "total_realized_pnl_inr": realized_inr,
        "by_market": by_market,
        "allocation": [],
    }

    by_sector: dict[str, float] = {}
    for h in open_holdings:
        mv = h["market_value"]
        if mv is None:
            continue
        sector = h["sector"] or "Other"
        by_sector[sector] = by_sector.get(sector, 0.0) + mv
    total_alloc = sum(by_sector.values())
    if total_alloc > 0:
        summary["allocation"] = sorted(
            (
                {"label": sector, "value_inr": value, "pct": value / total_alloc * 100}
                for sector, value in by_sector.items()
            ),
            key=lambda a: -a["value_inr"],
        )

    return summary


def sell_holding(db: Session, holding_id: int, sell_price: float, sell_date_: date) -> dict | None:
    holding = db.query(Holding).filter(Holding.id == holding_id).first()
    if holding is None:
        return None
    holding.sell_price = sell_price
    holding.sell_date = sell_date_
    db.commit()
    return next((h for h in get_holdings(db) if h["id"] == holding_id), None)


def create_holding(
    db: Session, market: str, symbol: str, quantity: float, buy_price: float, buy_date_: date, notes: str | None
) -> dict | None:
    symbol_row = db.execute(
        text("SELECT symbol_id FROM symbols WHERE market = :market AND symbol = :symbol"),
        {"market": market, "symbol": symbol},
    ).first()
    if symbol_row is None:
        return None

    holding = Holding(
        symbol_id=symbol_row.symbol_id,
        market=market,
        quantity=quantity,
        buy_price=buy_price,
        buy_date=buy_date_,
        notes=notes,
        created_at=datetime.utcnow(),
    )
    db.add(holding)
    db.commit()
    db.refresh(holding)

    return next((h for h in get_holdings(db) if h["id"] == holding.id), None)


def update_holding(
    db: Session,
    holding_id: int,
    quantity: float | None,
    buy_price: float | None,
    buy_date_: date | None,
    notes: str | None,
) -> dict | None:
    holding = db.query(Holding).filter(Holding.id == holding_id).first()
    if holding is None:
        return None

    if quantity is not None:
        holding.quantity = quantity
    if buy_price is not None:
        holding.buy_price = buy_price
    if buy_date_ is not None:
        holding.buy_date = buy_date_
    if notes is not None:
        holding.notes = notes
    db.commit()

    return next((h for h in get_holdings(db) if h["id"] == holding_id), None)


def delete_holding(db: Session, holding_id: int) -> bool:
    deleted = db.query(Holding).filter(Holding.id == holding_id).delete()
    db.commit()
    return deleted > 0
