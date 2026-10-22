from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from app.db import to_date
from app.deps import get_db
from app.schemas import PersistenceItem, PersistenceResponse

router = APIRouter(prefix="/api", tags=["persistence"])

VALID_MARKETS = {"IN"}

# category -> (rank order direction, extra_where against daily_metrics alias dm)
CATEGORY_SQL = {
    "gainers": ("pct_change DESC", "pct_change IS NOT NULL"),
    "losers": ("pct_change ASC", "pct_change IS NOT NULL"),
    "most_active": ("volume DESC", "volume IS NOT NULL"),
    "trending": ("rel_volume DESC", "rel_volume IS NOT NULL"),
}


def _validate_market(market: str) -> None:
    if market not in VALID_MARKETS:
        raise HTTPException(status_code=400, detail=f"market must be one of {sorted(VALID_MARKETS)}")


def _validate_category(category: str) -> None:
    if category not in CATEGORY_SQL:
        raise HTTPException(status_code=400, detail=f"category must be one of {sorted(CATEGORY_SQL)}")


def _resolve_last_n_dates(db: Session, market: str, n: int) -> list[date]:
    rows = db.execute(
        text(
            "SELECT trade_date FROM trading_calendar WHERE market = :market "
            "ORDER BY trade_date DESC LIMIT :n"
        ),
        {"market": market, "n": n},
    ).all()
    return [to_date(row[0]) for row in rows]


def _resolve_explicit_dates(db: Session, market: str, requested: list[date]) -> tuple[list[date], list[date]]:
    rows = db.execute(
        text("SELECT trade_date FROM trading_calendar WHERE market = :market"),
        {"market": market},
    ).all()
    known = {to_date(row[0]) for row in rows}
    valid = [d for d in requested if d in known]
    dropped = [d for d in requested if d not in known]
    return valid, dropped


@router.get("/persistence", response_model=PersistenceResponse)
def get_persistence(
    market: str = Query(...),
    category: str = Query(...),
    top_n: int = Query(25, ge=1, le=500),
    mode: str = Query("last_n", pattern="^(last_n|explicit)$"),
    n: int = Query(5, ge=2, le=90),
    dates: str | None = Query(None, description="Comma-separated ISO dates, required when mode=explicit"),
    min_days: int | None = Query(
        None, ge=1, description="Qualify with at least this many days present; defaults to all selected days"
    ),
    db: Session = Depends(get_db),
) -> PersistenceResponse:
    _validate_market(market)
    _validate_category(category)

    dropped_dates: list[date] = []
    if mode == "last_n":
        dates_used = _resolve_last_n_dates(db, market, n)
    else:
        if not dates:
            raise HTTPException(status_code=400, detail="dates is required when mode=explicit")
        try:
            requested = [date.fromisoformat(d.strip()) for d in dates.split(",") if d.strip()]
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"invalid date in 'dates': {exc}") from exc
        dates_used, dropped_dates = _resolve_explicit_dates(db, market, requested)

    if len(dates_used) < 2:
        raise HTTPException(
            status_code=400,
            detail="need at least 2 valid trading days in the selected range for a persistence view",
        )

    # Default preserves the original "must appear every single day" behavior;
    # callers can lower this to "at least K of N days" instead.
    effective_min_days = min(min_days, len(dates_used)) if min_days is not None else len(dates_used)

    order_expr, extra_where = CATEGORY_SQL[category]

    rows = db.execute(
        text(
            f"""
            WITH ranked AS (
                SELECT symbol_id, trade_date,
                       RANK() OVER (PARTITION BY trade_date ORDER BY {order_expr}) AS rnk
                FROM daily_metrics
                WHERE market = :market AND trade_date IN :dates_used AND {extra_where}
            ),
            topn AS (
                SELECT * FROM ranked WHERE rnk <= :top_n
            )
            SELECT symbol_id, COUNT(DISTINCT trade_date) AS days_present, AVG(rnk) AS avg_rank
            FROM topn
            GROUP BY symbol_id
            HAVING days_present >= :min_days
            ORDER BY days_present DESC, avg_rank ASC
            """
        ).bindparams(bindparam("dates_used", expanding=True)),
        {
            "market": market,
            "dates_used": [d.isoformat() for d in dates_used],
            "top_n": top_n,
            "min_days": effective_min_days,
        },
    ).all()

    if not rows:
        return PersistenceResponse(
            market=market,
            category=category,
            top_n=top_n,
            mode=mode,
            dates_used=dates_used,
            dropped_dates=dropped_dates,
            items=[],
        )

    symbol_ids = [r.symbol_id for r in rows]
    name_rows = db.execute(
        text("SELECT symbol_id, symbol, name, sector FROM symbols WHERE symbol_id IN :ids").bindparams(
            bindparam("ids", expanding=True)
        ),
        {"ids": symbol_ids},
    ).all()
    symbol_by_id = {r.symbol_id: (r.symbol, r.name, r.sector) for r in name_rows}

    # Current price + change over the selected window: close on the most
    # recent vs. earliest date in dates_used (not necessarily where the
    # symbol ranked in the top-N, just its regular daily close).
    window_start, window_end = min(dates_used), max(dates_used)
    price_rows = db.execute(
        text(
            "SELECT symbol_id, trade_date, close FROM daily_metrics "
            "WHERE symbol_id IN :ids AND trade_date IN :boundary_dates"
        ).bindparams(bindparam("ids", expanding=True), bindparam("boundary_dates", expanding=True)),
        {
            "ids": symbol_ids,
            "boundary_dates": [window_start.isoformat(), window_end.isoformat()],
        },
    ).all()
    start_close: dict[int, float] = {}
    end_close: dict[int, float] = {}
    for r in price_rows:
        td = to_date(r.trade_date)
        if td == window_start:
            start_close[r.symbol_id] = r.close
        if td == window_end:
            end_close[r.symbol_id] = r.close

    def _price_fields(symbol_id: int) -> dict:
        current = end_close.get(symbol_id)
        start = start_close.get(symbol_id)
        change_value = current - start if current is not None and start else None
        change_pct = (change_value / start * 100) if change_value is not None and start else None
        return {"current_price": current, "change_value": change_value, "change_pct": change_pct}

    items = [
        PersistenceItem(
            symbol=symbol_by_id[r.symbol_id][0],
            name=symbol_by_id[r.symbol_id][1],
            sector=symbol_by_id[r.symbol_id][2],
            days_present=r.days_present,
            num_dates_requested=len(dates_used),
            avg_rank=r.avg_rank,
            **_price_fields(r.symbol_id),
        )
        for r in rows
    ]
    return PersistenceResponse(
        market=market,
        category=category,
        top_n=top_n,
        mode=mode,
        dates_used=dates_used,
        dropped_dates=dropped_dates,
        items=items,
    )
