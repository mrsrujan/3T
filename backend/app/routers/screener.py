from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.deps import get_db
from app.schemas import ScreenerItem, ScreenerResponse
from app.services.screener_service import MarketCapTier, SortBy, screen

router = APIRouter(prefix="/api", tags=["screener"])

VALID_MARKETS = {"IN"}


@router.get("/screener", response_model=ScreenerResponse)
def screener(
    market: str = Query(...),
    sector: str | None = Query(None),
    min_pct_change: float | None = Query(None),
    max_pct_change: float | None = Query(None),
    min_rel_volume: float | None = Query(None),
    market_cap_tier: MarketCapTier | None = Query(None),
    min_pe: float | None = Query(None),
    max_pe: float | None = Query(None),
    sort_by: SortBy = Query("pct_change"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> ScreenerResponse:
    if market not in VALID_MARKETS:
        raise HTTPException(status_code=400, detail=f"market must be one of {sorted(VALID_MARKETS)}")

    items, trade_date = screen(
        db, market,
        sector=sector,
        min_pct_change=min_pct_change,
        max_pct_change=max_pct_change,
        min_rel_volume=min_rel_volume,
        market_cap_tier=market_cap_tier,
        min_pe=min_pe,
        max_pe=max_pe,
        sort_by=sort_by,
        limit=limit,
    )

    if trade_date is None:
        raise HTTPException(status_code=404, detail="No trading data available for this market")

    return ScreenerResponse(
        market=market,
        date=trade_date,
        total=len(items),
        items=[ScreenerItem(**i) for i in items],
    )
