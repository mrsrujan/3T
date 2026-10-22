from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.deps import get_db
from app.schemas import ScannerItem, ScannerResponse, SectorItem, SectorRotationResponse, StockTechnicalsResponse
from app.services.scanner_service import get_sector_rotation, get_symbol_technicals, scan

router = APIRouter(prefix="/api", tags=["scanner"])

VALID_MARKETS = {"IN"}
VALID_SETUPS = {"breakout", "rs_leader", "new_52w_high", "new_52w_low", "swing_rsi", "swing_macd", "volume_surge"}
VALID_SORT = {"rs_score", "pct_change", "rel_volume", "volume"}


def _validate_market(market: str) -> None:
    if market not in VALID_MARKETS:
        raise HTTPException(status_code=400, detail=f"market must be one of {sorted(VALID_MARKETS)}")


@router.get("/scanner", response_model=ScannerResponse)
def scanner(
    market: str = Query(...),
    setups: str | None = Query(None, description="Comma-separated setup ids"),
    sector: str | None = Query(None),
    sort_by: str = Query("rs_score"),
    limit: int = Query(100, ge=1, le=300),
    db: Session = Depends(get_db),
) -> ScannerResponse:
    _validate_market(market)
    if sort_by not in VALID_SORT:
        raise HTTPException(status_code=400, detail=f"sort_by must be one of {sorted(VALID_SORT)}")

    setup_list: list[str] | None = None
    if setups:
        setup_list = [s.strip() for s in setups.split(",") if s.strip() in VALID_SETUPS]

    items, trade_date = scan(db, market, setups=setup_list, sector=sector, sort_by=sort_by, limit=limit)

    if trade_date is None:
        raise HTTPException(status_code=404, detail="No trading data available for this market")

    return ScannerResponse(
        market=market,
        date=trade_date,
        total=len(items),
        items=[ScannerItem(**i) for i in items],
    )


@router.get("/sector-rotation", response_model=SectorRotationResponse)
def sector_rotation(
    market: str = Query(...),
    db: Session = Depends(get_db),
) -> SectorRotationResponse:
    _validate_market(market)
    sectors, trade_date = get_sector_rotation(db, market)

    if trade_date is None:
        raise HTTPException(status_code=404, detail="No trading data available for this market")

    return SectorRotationResponse(
        market=market,
        date=trade_date,
        sectors=[SectorItem(**s) for s in sectors],
    )


@router.get("/stock/{market}/{symbol}/technicals", response_model=StockTechnicalsResponse)
def stock_technicals(
    market: str,
    symbol: str,
    db: Session = Depends(get_db),
) -> StockTechnicalsResponse:
    _validate_market(market)
    data = get_symbol_technicals(db, market, symbol.upper())
    return StockTechnicalsResponse(market=market, symbol=symbol.upper(), **data)
