from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.deps import get_db
from app.schemas import (
    AnnualResponse,
    IntradayResponse,
    LiveQuoteResponse,
    QuarterlyResponse,
    StockDetailResponse,
    StockHistoryResponse,
    StockPeersResponse,
)
from app.services.live_quote_service import get_intraday, get_live_quote
from app.services.quarterly_service import get_annual, get_quarterly
from app.services.stock_detail_service import get_stock_detail, get_stock_history, get_stock_peers

router = APIRouter(prefix="/api", tags=["stock"])

VALID_MARKETS = {"IN"}


def _validate_market(market: str) -> None:
    if market not in VALID_MARKETS:
        raise HTTPException(status_code=400, detail=f"market must be one of {sorted(VALID_MARKETS)}")


@router.get("/stock/{market}/{symbol}", response_model=StockDetailResponse)
def stock_detail(market: str, symbol: str, db: Session = Depends(get_db)) -> StockDetailResponse:
    _validate_market(market)
    detail = get_stock_detail(db, market, symbol.upper())
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Unknown symbol {symbol} for market {market}")
    return StockDetailResponse(**detail)


@router.get("/stock/{market}/{symbol}/history", response_model=StockHistoryResponse)
def stock_history(
    market: str,
    symbol: str,
    # le is 1825 (5Y) + a 200-DMA lookback buffer the frontend adds so the
    # moving-average line is fully populated even at the widest range.
    days: int = Query(180, ge=5, le=2100),
    db: Session = Depends(get_db),
) -> StockHistoryResponse:
    _validate_market(market)
    points = get_stock_history(db, market, symbol.upper(), days)
    if points is None:
        raise HTTPException(status_code=404, detail=f"Unknown symbol {symbol} for market {market}")
    return StockHistoryResponse(market=market, symbol=symbol.upper(), points=points)


@router.get("/stock/{market}/{symbol}/live", response_model=LiveQuoteResponse)
def stock_live_quote(market: str, symbol: str) -> LiveQuoteResponse:
    _validate_market(market)
    quote = get_live_quote(market, symbol.upper())
    return LiveQuoteResponse(market=market, symbol=symbol.upper(), **quote)


@router.get("/stock/{market}/{symbol}/intraday", response_model=IntradayResponse)
def stock_intraday(market: str, symbol: str) -> IntradayResponse:
    _validate_market(market)
    points = get_intraday(market, symbol.upper())
    return IntradayResponse(market=market, symbol=symbol.upper(), points=points)


@router.get("/stock/{market}/{symbol}/peers", response_model=StockPeersResponse)
def stock_peers(
    market: str,
    symbol: str,
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
) -> StockPeersResponse:
    _validate_market(market)
    result = get_stock_peers(db, market, symbol.upper(), limit)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Unknown symbol {symbol} for market {market}")
    return StockPeersResponse(market=market, symbol=symbol.upper(), **result)


@router.get("/stock/{market}/{symbol}/annual", response_model=AnnualResponse)
def stock_annual(market: str, symbol: str) -> AnnualResponse:
    _validate_market(market)
    data = get_annual(market, symbol.upper())
    return AnnualResponse(market=market, symbol=symbol.upper(), **data)


@router.get("/stock/{market}/{symbol}/quarterly", response_model=QuarterlyResponse)
def stock_quarterly(market: str, symbol: str, db: Session = Depends(get_db)) -> QuarterlyResponse:
    _validate_market(market)
    sym_upper = symbol.upper()
    data = get_quarterly(market, sym_upper)

    quarterly_list: list[dict] = data.get("quarterly", [])
    dates = [q["period_end_date"] for q in quarterly_list if q.get("period_end_date")]
    if dates:
        min_date = min(dates)
        max_date_end = (date.fromisoformat(max(dates)) + timedelta(days=70)).isoformat()
        rows = db.execute(
            text(
                """
                SELECT dm.trade_date, dm.pct_change
                FROM daily_metrics dm
                JOIN symbols s ON dm.symbol_id = s.id
                WHERE s.symbol = :symbol AND s.market = :market
                  AND dm.trade_date >= :start_date AND dm.trade_date <= :end_date
                  AND dm.pct_change IS NOT NULL
                """
            ),
            {"symbol": sym_upper, "market": market, "start_date": min_date, "end_date": max_date_end},
        ).all()
        # period_end / window_end on the compare line are ISO strings, so key
        # by ISO strings too. Normalize because SQLite returns str but Postgres
        # returns native date here (raw text() bypasses SQLAlchemy coercion).
        date_pct: dict[str, float] = {
            (r.trade_date if isinstance(r.trade_date, str) else r.trade_date.isoformat()): r.pct_change
            for r in rows
        }
        for q in quarterly_list:
            period_end = q.get("period_end_date")
            if not period_end:
                continue
            window_end = (date.fromisoformat(period_end) + timedelta(days=70)).isoformat()
            moves = [v for d, v in date_pct.items() if period_end <= d <= window_end]
            if moves:
                q["price_reaction"] = max(moves, key=abs)

    return QuarterlyResponse(market=market, symbol=sym_upper, **data)
