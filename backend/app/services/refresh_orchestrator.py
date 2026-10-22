"""Shared refresh path used by both the cron scheduler and POST /api/refresh.

Reuses the same idempotent fetch+compute+upsert pipeline as the first-run
backfill (services/backfill.py), just with a narrower trailing window and a
409-style guard against overlapping runs for the same market.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import RefreshLog
from app.services.alert_service import check_alerts
from app.services.backfill import backfill_market

REFRESH_WINDOW_DAYS = 45

# When NSE EOD data is considered publishable, in its own zone -
# kept aligned with the cron time in scheduler.py.
_MARKET_TZ = {"IN": ZoneInfo("Asia/Kolkata")}
_REFRESH_READY_HOUR = {"IN": 18}  # 6:00 PM IST


class RefreshAlreadyRunningError(Exception):
    pass


# The longest observed refresh is ~12 minutes (full IN bhavcopy window), so a
# "running" row older than this belongs to a process that died mid-run. It
# must not count as a live lock: one such stale row once blocked every
# scheduled US refresh with RefreshAlreadyRunningError for days.
RUNNING_LOCK_MAX_AGE = timedelta(hours=2)


def is_job_running(db: Session, market: str) -> bool:
    cutoff = datetime.utcnow() - RUNNING_LOCK_MAX_AGE
    return (
        db.query(RefreshLog)
        .filter(
            RefreshLog.status == "running",
            RefreshLog.market == market,
            RefreshLog.started_at > cutoff,
        )
        .first()
        is not None
    )


def sweep_interrupted_jobs(db: Session) -> int:
    """Mark leftover 'running' rows as failed. Called at startup: this is a
    single-process app, so nothing can genuinely be in flight when the process
    boots - any 'running' row is a previous process killed mid-refresh."""
    stale = db.query(RefreshLog).filter(RefreshLog.status == "running").all()
    for log in stale:
        log.status = "failed"
        log.finished_at = datetime.utcnow()
        log.error_message = "interrupted by process restart"
    if stale:
        db.commit()
    return len(stale)


def refresh_market(db: Session, market: str, job_type: str = "manual") -> dict:
    if is_job_running(db, market):
        raise RefreshAlreadyRunningError(f"A refresh job is already running for {market}")
    summary = backfill_market(db, market, calendar_days=REFRESH_WINDOW_DAYS, job_type=job_type)
    if "error" not in summary:
        summary["alerts_triggered"] = check_alerts(db, market)
    return summary


def expected_latest_session(market: str, now: datetime | None = None) -> date:
    """Most recent weekday whose EOD data should already be published, in the
    market's own timezone. Doesn't know about exchange holidays - on those,
    a catch-up refresh simply finds nothing new, which is harmless."""
    local = (now or datetime.now(_MARKET_TZ[market])).astimezone(_MARKET_TZ[market])
    candidate = local.date()
    if local.hour < _REFRESH_READY_HOUR[market]:
        candidate -= timedelta(days=1)
    while candidate.weekday() >= 5:  # walk back over Sat/Sun
        candidate -= timedelta(days=1)
    return candidate


def needs_catchup(db: Session, market: str) -> bool:
    """True when stored data is older than the last completed session -
    i.e. a scheduled refresh was missed (process down at the cron moment,
    machine asleep, etc.). Checked on every startup so gaps self-heal
    instead of silently waiting for the next day's cron."""
    row = db.execute(
        text("SELECT MAX(trade_date) FROM trading_calendar WHERE market = :market"),
        {"market": market},
    ).scalar()
    if row is None:
        return False  # empty DB is the first-run backfill's job, not catch-up's
    latest = date.fromisoformat(row) if isinstance(row, str) else row
    return latest < expected_latest_session(market)
