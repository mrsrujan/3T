from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.deps import get_db
from app.services import nse_market_service, portfolio_risk_service

router = APIRouter(prefix="/api", tags=["market-data"])


@router.get("/fii-dii")
def fii_dii(days: int = Query(default=20, ge=1, le=90)) -> dict:
    data = nse_market_service.get_fii_dii(days=days)
    return {"items": data}


@router.get("/portfolio/risk")
def portfolio_risk(db: Session = Depends(get_db)) -> dict:
    return portfolio_risk_service.get_portfolio_risk(db)
