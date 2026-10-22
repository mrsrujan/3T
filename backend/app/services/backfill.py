"""First-run backfill: pull ~`backfill_calendar_days` of history
so the persistence view is immediately useful and the 20-day rolling
rel_volume window is primed (instead of being null for a month)."""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pandas as pd
from sqlalchemy.orm import Session

from app.config import settings
from app.models import RefreshLog
from app.services.computation import compute_derived_metrics, upsert_daily_metrics
from app.services.india_fetch import NSESession

INDIA_TZ = ZoneInfo("Asia/Kolkata")

logger = logging.getLogger(__name__)

INDIA_REQUEST_DELAY_SECONDS = 0.5


def backfill_market(
    db: Session, market: str, calendar_days: int | None = None, job_type: str = "backfill"
) -> dict:
    """Fetch + compute + upsert a trailing `calendar_days` window for `market`.

    Idempotent (upsert on symbol_id/trade_date), so this same pipeline is
    reused for both the first-run backfill (job_type="backfill", wide window)
    and the routine daily refresh (job_type="scheduled"/"manual", narrower
    window) - see services/refresh_orchestrator.py.
    """
    calendar_days = calendar_days or settings.backfill_calendar_days
    log = RefreshLog(
        started_at=datetime.utcnow(),
        market=market,
        job_type=job_type,
        status="running",
    )
    db.add(log)
    db.commit()

    try:
        if market == "IN":
            summary = _backfill_india(db, calendar_days)
        else:
            raise ValueError(f"Unknown market: {market}")

        log.status = "success"
        log.symbols_processed = summary.get("symbols_processed", 0)
        log.symbols_failed = summary.get("symbols_failed", 0)
    except Exception as exc:
        logger.exception("Backfill failed for market %s", market)
        log.status = "failed"
        log.error_message = str(exc)[:2048]
        summary = {"market": market, "error": str(exc)}
    finally:
        log.finished_at = datetime.utcnow()
        db.commit()

    return summary


def _backfill_india(db: Session, calendar_days: int) -> dict:
    session = NSESession()
    session.warm_up()

    today = datetime.now(INDIA_TZ).date()
    start = today - timedelta(days=calendar_days)

    frames: list[pd.DataFrame] = []
    days_tried = 0
    d = start
    while d <= today:
        days_tried += 1
        df = session.fetch_bhavcopy(d)
        if df is not None:
            frames.append(df)
        d += timedelta(days=1)
        time.sleep(INDIA_REQUEST_DELAY_SECONDS)

    if not frames:
        return {"market": "IN", "symbols_processed": 0, "symbols_failed": 0, "rows_upserted": 0}

    raw = pd.concat(frames, ignore_index=True)
    computed = compute_derived_metrics(raw)
    rows_upserted = upsert_daily_metrics(db, "IN", computed)

    return {
        "market": "IN",
        "symbols_processed": raw["symbol"].nunique(),
        "symbols_failed": 0,
        "trading_days_found": len(frames),
        "days_tried": days_tried,
        "rows_upserted": rows_upserted,
    }
