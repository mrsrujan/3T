from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.deps import get_db
from app.models import RefreshLog
from app.schemas import RefreshRequest, RefreshStatusResponse
from app.services.refresh_orchestrator import (
    RefreshAlreadyRunningError,
    is_job_running,
    refresh_market,
)

router = APIRouter(prefix="/api", tags=["refresh"])

VALID_MARKETS = {"IN"}


def _run_refresh_in_background(markets: list[str]) -> None:
    db = SessionLocal()
    try:
        for market in markets:
            try:
                refresh_market(db, market, job_type="manual")
            except RefreshAlreadyRunningError:
                pass  # guarded again at trigger time; a concurrent run just wins
    finally:
        db.close()


@router.post("/refresh", status_code=202)
def trigger_refresh(
    payload: RefreshRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> dict:
    markets = ["IN"] if payload.market == "BOTH" else [payload.market]
    for market in markets:
        if market not in VALID_MARKETS:
            raise HTTPException(status_code=400, detail=f"market must be one of {sorted(VALID_MARKETS)} or BOTH")
        if is_job_running(db, market):
            raise HTTPException(status_code=409, detail=f"A refresh job is already running for {market}")

    background_tasks.add_task(_run_refresh_in_background, markets)
    return {"status": "running", "markets": markets}


@router.get("/refresh/status/latest", response_model=RefreshStatusResponse)
def get_latest_refresh_status(
    market: str | None = None,
    db: Session = Depends(get_db),
) -> RefreshStatusResponse:
    query = db.query(RefreshLog)
    if market:
        query = query.filter(RefreshLog.market == market)
    log = query.order_by(RefreshLog.job_id.desc()).first()
    if not log:
        raise HTTPException(status_code=404, detail="no refresh jobs found")

    return RefreshStatusResponse(
        job_id=log.job_id,
        market=log.market,
        job_type=log.job_type,
        status=log.status,
        started_at=log.started_at.isoformat(),
        finished_at=log.finished_at.isoformat() if log.finished_at else None,
        symbols_processed=log.symbols_processed,
        symbols_failed=log.symbols_failed,
        error_message=log.error_message,
    )
