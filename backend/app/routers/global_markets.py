from fastapi import APIRouter, HTTPException, Query

from app.schemas import GlobalMarketsResponse, IndexHistoryResponse
from app.services.global_markets_service import (
    BENCHMARK_INDEX,
    VALID_HISTORY_SYMBOLS,
    get_global_markets,
    get_index_history,
    get_symbol_history,
)

router = APIRouter(prefix="/api", tags=["global-markets"])


@router.get("/global-markets", response_model=GlobalMarketsResponse)
def global_markets() -> GlobalMarketsResponse:
    return GlobalMarketsResponse(**get_global_markets())


@router.get("/index-history", response_model=IndexHistoryResponse)
def index_history(
    market: str = Query(...),
    days: int = Query(180, ge=5, le=2100),
) -> IndexHistoryResponse:
    if market not in BENCHMARK_INDEX:
        raise HTTPException(status_code=400, detail=f"market must be one of {sorted(BENCHMARK_INDEX)}")
    return IndexHistoryResponse(market=market, **get_index_history(market, days))


@router.get("/symbol-history", response_model=IndexHistoryResponse)
def symbol_history(
    symbol: str = Query(...),
    days: int = Query(180, ge=5, le=1825),
) -> IndexHistoryResponse:
    if symbol not in VALID_HISTORY_SYMBOLS:
        raise HTTPException(status_code=400, detail=f"Unknown symbol: {symbol}")
    result = get_symbol_history(symbol, days)
    return IndexHistoryResponse(market=symbol, **result)
