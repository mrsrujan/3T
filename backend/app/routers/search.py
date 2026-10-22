from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.deps import get_db
from app.schemas import SearchResponse, SearchResultItem
from app.services.search_service import VALID_MARKETS, search_symbols

router = APIRouter(prefix="/api", tags=["search"])


@router.get("/search", response_model=SearchResponse)
def search(
    q: str = Query(..., min_length=1),
    market: str = Query("ALL"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> SearchResponse:
    if market != "ALL" and market not in VALID_MARKETS:
        raise HTTPException(status_code=400, detail=f"market must be ALL or one of {sorted(VALID_MARKETS)}")

    results = search_symbols(db, q, market, limit)
    return SearchResponse(query=q, items=[SearchResultItem(**r) for r in results])
