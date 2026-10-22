from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.deps import get_db
from app.schemas import (
    HoldingCreateRequest,
    HoldingItem,
    HoldingsResponse,
    HoldingsSummaryResponse,
    HoldingUpdateRequest,
    SellHoldingRequest,
)
from app.services.holdings_service import (
    create_holding,
    delete_holding,
    get_holdings,
    get_holdings_summary,
    sell_holding,
    update_holding,
)

router = APIRouter(prefix="/api", tags=["holdings"])

VALID_MARKETS = {"IN"}


@router.get("/holdings", response_model=HoldingsResponse)
def list_holdings(db: Session = Depends(get_db)) -> HoldingsResponse:
    return HoldingsResponse(items=[HoldingItem(**h) for h in get_holdings(db)])


@router.get("/holdings/summary", response_model=HoldingsSummaryResponse)
def holdings_summary(db: Session = Depends(get_db)) -> HoldingsSummaryResponse:
    return HoldingsSummaryResponse(**get_holdings_summary(db))


@router.post("/holdings", status_code=201, response_model=HoldingItem)
def add_holding(payload: HoldingCreateRequest, db: Session = Depends(get_db)) -> HoldingItem:
    if payload.market not in VALID_MARKETS:
        raise HTTPException(status_code=400, detail=f"market must be one of {sorted(VALID_MARKETS)}")
    if payload.quantity <= 0:
        raise HTTPException(status_code=400, detail="quantity must be positive")

    result = create_holding(
        db, payload.market, payload.symbol.upper(), payload.quantity, payload.buy_price, payload.buy_date, payload.notes
    )
    if result is None:
        raise HTTPException(
            status_code=404, detail=f"Unknown symbol {payload.symbol} for market {payload.market}"
        )
    return HoldingItem(**result)


@router.put("/holdings/{holding_id}", response_model=HoldingItem)
def edit_holding(holding_id: int, payload: HoldingUpdateRequest, db: Session = Depends(get_db)) -> HoldingItem:
    result = update_holding(db, holding_id, payload.quantity, payload.buy_price, payload.buy_date, payload.notes)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Holding {holding_id} not found")
    return HoldingItem(**result)


@router.post("/holdings/{holding_id}/sell", response_model=HoldingItem)
def close_holding(holding_id: int, payload: SellHoldingRequest, db: Session = Depends(get_db)) -> HoldingItem:
    if payload.sell_price <= 0:
        raise HTTPException(status_code=400, detail="sell_price must be positive")
    result = sell_holding(db, holding_id, payload.sell_price, payload.sell_date)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Holding {holding_id} not found")
    return HoldingItem(**result)


@router.delete("/holdings/{holding_id}", status_code=204, response_model=None)
def remove_holding(holding_id: int, db: Session = Depends(get_db)):
    removed = delete_holding(db, holding_id)
    if not removed:
        raise HTTPException(status_code=404, detail=f"Holding {holding_id} not found")
