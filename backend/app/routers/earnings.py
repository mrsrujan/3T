from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from app.deps import get_db
from app.schemas import EarningsItem, EarningsResponse
from app.services.earnings_service import get_earnings_for_symbols

router = APIRouter(prefix="/api", tags=["earnings"])

VALID_MARKETS = {"IN"}


@router.get("/earnings", response_model=EarningsResponse)
def earnings(
    market: str = Query(...),
    symbols: str = Query(..., description="Comma-separated list of symbols, max 50"),
    db: Session = Depends(get_db),
) -> EarningsResponse:
    if market not in VALID_MARKETS:
        raise HTTPException(status_code=400, detail=f"market must be one of {sorted(VALID_MARKETS)}")

    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()][:50]
    if not symbol_list:
        raise HTTPException(status_code=400, detail="symbols must be a non-empty comma-separated list")

    # Resolve names from DB for the response.
    name_map: dict[str, str | None] = {}
    rows = db.execute(
        text("SELECT symbol, name FROM symbols WHERE market = :market AND symbol IN :syms")
            .bindparams(bindparam("syms", expanding=True)),
        {"market": market, "syms": symbol_list},
    ).all()
    for r in rows:
        name_map[r.symbol] = r.name

    raw = get_earnings_for_symbols(symbol_list, market)
    items = [
        EarningsItem(
            symbol=r["symbol"],
            name=name_map.get(r["symbol"]),
            earnings_date=r["earnings_date"],
            eps_estimate=r.get("eps_estimate"),
        )
        for r in raw
    ]
    items.sort(key=lambda x: x.earnings_date)

    return EarningsResponse(items=items)
