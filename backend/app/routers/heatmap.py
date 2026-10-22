from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.deps import get_db
from app.schemas import HeatmapResponse
from app.services.heatmap_service import get_heatmap_or_nearest

router = APIRouter(prefix="/api", tags=["heatmap"])

VALID_MARKETS = {"IN"}


@router.get("/heatmap", response_model=HeatmapResponse)
def heatmap(
    market: str = Query(...),
    date_param: date = Query(..., alias="date"),
    db: Session = Depends(get_db),
) -> HeatmapResponse:
    if market not in VALID_MARKETS:
        raise HTTPException(status_code=400, detail=f"market must be one of {sorted(VALID_MARKETS)}")

    result, nearest = get_heatmap_or_nearest(db, market, date_param)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "no data for this date", "nearest_available_date": nearest.isoformat() if nearest else None},
        )
    return HeatmapResponse(market=market, date=date_param, sectors=result["sectors"])
