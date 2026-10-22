from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.deps import get_db
from app.models import ForecastModel
from app.schemas import ForecastModelRunItem, ForecastModelStatusResponse, ForecastResponse
from app.services.forecast_service import get_stock_forecast
from app.services.forecast_training_service import run_weekly_training

router = APIRouter(prefix="/api", tags=["forecast"])

VALID_MARKETS = {"IN"}


def _validate_market(market: str) -> None:
    if market not in VALID_MARKETS:
        raise HTTPException(status_code=400, detail=f"market must be one of {sorted(VALID_MARKETS)}")


def _run_training_in_background(markets: list[str]) -> None:
    db = SessionLocal()
    try:
        for market in markets:
            run_weekly_training(db, market)
    finally:
        db.close()


@router.post("/forecast/train", status_code=202)
def trigger_forecast_training(
    background_tasks: BackgroundTasks,
    market: str = Query(default="BOTH"),
) -> dict:
    if market not in VALID_MARKETS | {"BOTH"}:
        raise HTTPException(status_code=400, detail=f"market must be one of {sorted(VALID_MARKETS)} or BOTH")
    markets = list(VALID_MARKETS) if market == "BOTH" else [market]
    background_tasks.add_task(_run_training_in_background, markets)
    return {"status": "queued", "markets": markets}


@router.get("/forecast/model-status", response_model=ForecastModelStatusResponse)
def forecast_model_status(db: Session = Depends(get_db)) -> ForecastModelStatusResponse:
    """Mirrors /api/debug/scheduler - surfaces both markets' active model
    metadata plus the last ~10 training runs (including failures), for
    debugging why a forecast is (or isn't) available."""
    active_by_market: dict[str, ForecastModel | None] = {}
    for market in sorted(VALID_MARKETS):
        active_by_market[market] = (
            db.query(ForecastModel)
            .filter(ForecastModel.market == market, ForecastModel.status == "active")
            .order_by(ForecastModel.trained_at.desc())
            .first()
        )

    recent_rows = db.query(ForecastModel).order_by(ForecastModel.trained_at.desc()).limit(10).all()

    return ForecastModelStatusResponse(
        models={
            market: (
                None
                if row is None
                else {
                    "market": row.market,
                    "trained_at": row.trained_at,
                    "training_row_count": row.training_row_count,
                    "holdout_accuracy": row.holdout_accuracy,
                    "holdout_auc": row.holdout_auc,
                    "holdout_baseline_accuracy": row.holdout_baseline_accuracy,
                }
            )
            for market, row in active_by_market.items()
        },
        recent_runs=[
            ForecastModelRunItem(
                market=row.market,
                trained_at=row.trained_at,
                training_row_count=row.training_row_count,
                holdout_accuracy=row.holdout_accuracy,
                holdout_auc=row.holdout_auc,
                holdout_baseline_accuracy=row.holdout_baseline_accuracy,
                status=row.status,
                error_message=row.error_message,
            )
            for row in recent_rows
        ],
    )


@router.get("/forecast/{market}/{symbol}", response_model=ForecastResponse)
def stock_forecast(market: str, symbol: str, db: Session = Depends(get_db)) -> ForecastResponse:
    _validate_market(market)
    result = get_stock_forecast(db, market, symbol.upper())
    if result is None:
        raise HTTPException(status_code=404, detail=f"Unknown symbol {symbol} for market {market}")
    return ForecastResponse(**result)
