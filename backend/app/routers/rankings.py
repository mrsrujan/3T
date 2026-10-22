from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from app.deps import get_db
from app.models import TradingCalendar
from app.schemas import RankingItem, RankingsResponse, TradingDaysResponse

router = APIRouter(prefix="/api", tags=["rankings"])

VALID_MARKETS = {"IN"}

# category -> (order_by_expression, extra_where)
CATEGORY_SQL = {
    "gainers": ("dm.pct_change DESC", "dm.pct_change IS NOT NULL"),
    "losers": ("dm.pct_change ASC", "dm.pct_change IS NOT NULL"),
    "most_active": ("dm.volume DESC", "dm.volume IS NOT NULL"),
    "trending": ("dm.rel_volume DESC", "dm.rel_volume IS NOT NULL"),
}


def _validate_market(market: str) -> None:
    if market not in VALID_MARKETS:
        raise HTTPException(status_code=400, detail=f"market must be one of {sorted(VALID_MARKETS)}")


def _validate_category(category: str) -> None:
    if category not in CATEGORY_SQL:
        raise HTTPException(status_code=400, detail=f"category must be one of {sorted(CATEGORY_SQL)}")


@router.get("/trading-days", response_model=TradingDaysResponse)
def get_trading_days(
    market: str = Query(...),
    limit: int = Query(30, ge=1, le=500),
    db: Session = Depends(get_db),
) -> TradingDaysResponse:
    _validate_market(market)
    rows = (
        db.query(TradingCalendar.trade_date)
        .filter(TradingCalendar.market == market)
        .order_by(TradingCalendar.trade_date.desc())
        .limit(limit)
        .all()
    )
    dates = [row[0] for row in rows]
    return TradingDaysResponse(market=market, dates=dates)


def _nearest_available_date(db: Session, market: str, requested: date) -> date | None:
    # trading_calendar is tiny (~400 rows/market) - pulling all candidates
    # and picking nearest in Python keeps the SQL portable across dialects
    # (SQLite's julianday / Postgres's date-subtraction aren't interchangeable).
    rows = (
        db.query(TradingCalendar.trade_date)
        .filter(TradingCalendar.market == market)
        .all()
    )
    if not rows:
        return None
    return min((row[0] for row in rows), key=lambda d: abs((d - requested).days))


@router.get("/rankings", response_model=RankingsResponse)
def get_rankings(
    market: str = Query(...),
    date: date = Query(...),
    category: str = Query(...),
    top_n: int = Query(25, ge=1, le=500),
    db: Session = Depends(get_db),
) -> RankingsResponse:
    _validate_market(market)
    _validate_category(category)

    order_by, extra_where = CATEGORY_SQL[category]
    rows = db.execute(
        text(
            f"""
            SELECT dm.symbol_id, s.symbol, s.name, s.sector, dm.close, dm.prev_close, dm.pct_change,
                   dm.volume, dm.turnover, dm.rel_volume
            FROM daily_metrics dm
            JOIN symbols s ON s.symbol_id = dm.symbol_id
            WHERE dm.market = :market AND dm.trade_date = :trade_date AND {extra_where}
            ORDER BY {order_by}
            LIMIT :top_n
            """
        ),
        {"market": market, "trade_date": date.isoformat(), "top_n": top_n},
    ).all()

    if not rows:
        nearest = _nearest_available_date(db, market, date)
        detail = {"error": "no data for this date", "nearest_available_date": nearest.isoformat() if nearest else None}
        raise HTTPException(status_code=404, detail=detail)

    sparks = _sparkline_closes(db, market, date, [r.symbol_id for r in rows])

    items = [
        RankingItem(
            symbol=r.symbol,
            name=r.name,
            sector=r.sector,
            close=r.close,
            prev_close=r.prev_close,
            pct_change=r.pct_change,
            volume=r.volume,
            turnover=r.turnover,
            rel_volume=r.rel_volume,
            spark=sparks.get(r.symbol_id),
        )
        for r in rows
    ]
    return RankingsResponse(market=market, date=date, category=category, top_n=top_n, items=items)


SPARKLINE_TRADING_DAYS = 30


# ── Persistence endpoint ───────────────────────────────────────────────────────

class PersistenceItem(BaseModel):
    symbol: str
    name: str | None
    sector: str | None
    days_present: int
    num_dates_requested: int
    avg_rank: float
    current_price: float | None
    change_value: float | None
    change_pct: float | None


class PersistenceResponse(BaseModel):
    market: str
    category: str
    top_n: int
    mode: str
    dates_used: list[str]
    dropped_dates: list[str]
    items: list[PersistenceItem]


@router.get("/persistence", response_model=PersistenceResponse)
def get_persistence(
    market: str = Query(...),
    category: str = Query(...),
    top_n: int = Query(25, ge=1, le=500),
    mode: str = Query("last_n"),
    n: int = Query(5, ge=1, le=60),
    dates: str | None = Query(None),
    min_days: int = Query(1, ge=1),
    db: Session = Depends(get_db),
) -> PersistenceResponse:
    _validate_market(market)
    _validate_category(category)

    if mode == "last_n":
        rows = db.execute(
            text(
                "SELECT trade_date FROM trading_calendar WHERE market = :market "
                "ORDER BY trade_date DESC LIMIT :n"
            ),
            {"market": market, "n": n},
        ).all()
        requested_dates = [r[0] for r in rows]
    elif mode == "explicit" and dates:
        requested_dates = [d.strip() for d in dates.split(",") if d.strip()]
    else:
        raise HTTPException(status_code=400, detail="mode must be 'last_n' or 'explicit' (with dates)")

    order_by, extra_where = CATEGORY_SQL[category]

    # Collect top-N symbols per date and count appearances
    symbol_days: dict[str, list[int]] = {}  # symbol -> [rank on each day present]
    dates_used: list[str] = []
    dropped_dates: list[str] = []

    for trade_date in requested_dates:
        check = db.execute(
            text("SELECT 1 FROM daily_metrics WHERE market = :market AND trade_date = :d LIMIT 1"),
            {"market": market, "d": trade_date},
        ).first()
        if not check:
            dropped_dates.append(trade_date)
            continue
        dates_used.append(trade_date)

        day_rows = db.execute(
            text(
                f"""
                SELECT s.symbol
                FROM daily_metrics dm
                JOIN symbols s ON s.symbol_id = dm.symbol_id
                WHERE dm.market = :market AND dm.trade_date = :d AND {extra_where}
                ORDER BY {order_by}
                LIMIT :top_n
                """
            ),
            {"market": market, "d": trade_date, "top_n": top_n},
        ).all()

        for rank, r in enumerate(day_rows, 1):
            symbol_days.setdefault(r.symbol, []).append(rank)

    # Filter by min_days and sort by days_present desc, then avg_rank asc
    candidates = [
        (sym, ranks)
        for sym, ranks in symbol_days.items()
        if len(ranks) >= min_days
    ]
    candidates.sort(key=lambda x: (-len(x[1]), sum(x[1]) / len(x[1])))

    if not candidates:
        return PersistenceResponse(
            market=market,
            category=category,
            top_n=top_n,
            mode=mode,
            dates_used=dates_used,
            dropped_dates=dropped_dates,
            items=[],
        )

    symbols = [sym for sym, _ in candidates]
    latest_prices = db.execute(
        text(
            """
            SELECT s.symbol, s.name, s.sector, dm.close, dm.prev_close, dm.pct_change
            FROM daily_metrics dm
            JOIN symbols s ON s.symbol_id = dm.symbol_id
            WHERE dm.market = :market AND s.symbol IN :syms
              AND dm.trade_date = (
                SELECT MAX(trade_date) FROM daily_metrics
                WHERE symbol_id = dm.symbol_id
              )
            """
        ).bindparams(bindparam("syms", expanding=True)),
        {"market": market, "syms": symbols},
    ).all()
    price_map = {r.symbol: r for r in latest_prices}

    items = []
    num_dates = len(dates_used)
    for sym, ranks in candidates:
        p = price_map.get(sym)
        change_value: float | None = None
        if p and p.close is not None and p.prev_close is not None:
            change_value = p.close - p.prev_close
        items.append(
            PersistenceItem(
                symbol=sym,
                name=p.name if p else None,
                sector=p.sector if p else None,
                days_present=len(ranks),
                num_dates_requested=num_dates,
                avg_rank=round(sum(ranks) / len(ranks), 1),
                current_price=p.close if p else None,
                change_value=change_value,
                change_pct=p.pct_change if p else None,
            )
        )

    return PersistenceResponse(
        market=market,
        category=category,
        top_n=top_n,
        mode=mode,
        dates_used=dates_used,
        dropped_dates=dropped_dates,
        items=items,
    )


def _sparkline_closes(db: Session, market: str, as_of: date, symbol_ids: list[int]) -> dict[int, list[float]]:
    """Last ~30 trading-day closes per symbol (ascending), for the tiny
    inline trend chart in ranking rows. Values rounded to keep the response
    payload small - the sparkline only conveys shape, not precision."""
    if not symbol_ids:
        return {}

    rows = db.execute(
        text(
            """
            SELECT dm.symbol_id, dm.close
            FROM daily_metrics dm
            WHERE dm.market = :market AND dm.symbol_id IN :ids AND dm.close IS NOT NULL
              AND dm.trade_date IN (
                  SELECT trade_date FROM trading_calendar
                  WHERE market = :market AND trade_date <= :as_of
                  ORDER BY trade_date DESC LIMIT :days
              )
            ORDER BY dm.symbol_id, dm.trade_date
            """
        ).bindparams(bindparam("ids", expanding=True)),
        {"market": market, "ids": symbol_ids, "as_of": as_of.isoformat(), "days": SPARKLINE_TRADING_DAYS},
    ).all()

    sparks: dict[int, list[float]] = {}
    for r in rows:
        sparks.setdefault(r.symbol_id, []).append(round(r.close, 2))
    return sparks
