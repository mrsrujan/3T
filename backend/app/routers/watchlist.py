from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.deps import get_db
from app.schemas import WatchlistAddRequest, WatchlistItem, WatchlistResponse
from app.services.watchlist_service import add_to_watchlist, get_watchlist, remove_from_watchlist

router = APIRouter(prefix="/api", tags=["watchlist"])

VALID_MARKETS = {"IN"}


@router.get("/watchlist", response_model=WatchlistResponse)
def list_watchlist(market: str = Query("ALL"), db: Session = Depends(get_db)) -> WatchlistResponse:
    if market != "ALL" and market not in VALID_MARKETS:
        raise HTTPException(status_code=400, detail=f"market must be ALL or one of {sorted(VALID_MARKETS)}")
    items = get_watchlist(db, market)
    return WatchlistResponse(items=[WatchlistItem(**i) for i in items])


@router.post("/watchlist", status_code=201, response_model=WatchlistItem)
def create_watchlist_item(payload: WatchlistAddRequest, db: Session = Depends(get_db)) -> WatchlistItem:
    if payload.market not in VALID_MARKETS:
        raise HTTPException(status_code=400, detail=f"market must be one of {sorted(VALID_MARKETS)}")

    result = add_to_watchlist(db, payload.market, payload.symbol.upper())
    if result is None:
        raise HTTPException(
            status_code=404, detail=f"Unknown symbol {payload.symbol} for market {payload.market}"
        )
    return WatchlistItem(**result, name=None, close=None, pct_change=None)


@router.delete("/watchlist/{market}/{symbol}", status_code=204, response_model=None)
def delete_watchlist_item(market: str, symbol: str, db: Session = Depends(get_db)):
    if market not in VALID_MARKETS:
        raise HTTPException(status_code=400, detail=f"market must be one of {sorted(VALID_MARKETS)}")
    removed = remove_from_watchlist(db, market, symbol.upper())
    if not removed:
        raise HTTPException(status_code=404, detail=f"{symbol} is not in the {market} watchlist")
