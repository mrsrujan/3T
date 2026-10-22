"""AsyncIOScheduler wiring: daily NSE refresh cron timed after market close
plus a staleness watchdog.

The cron alone is not reliable on this deployment: APScheduler wakeups are
asyncio timers on the monotonic clock, and Docker Desktop's VM freezes while
the Windows host sleeps - a timer aimed at the cron moment can fire hours
late (and a run >misfire_grace_time late is discarded outright). The
watchdog closes that gap: every tick it compares stored data against the
last completed session and refreshes if behind, so a missed cron heals
within one tick of the machine being awake.

Requires the `tzdata` package on Windows - zoneinfo has no bundled IANA
database there and CronTrigger(timezone=...) raises ZoneInfoNotFoundError
without it.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.db import SessionLocal
from app.services.refresh_orchestrator import (
    RefreshAlreadyRunningError,
    needs_catchup,
    refresh_market,
)
from app.services.sector_service import refresh_sector_data

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

WATCHDOG_INTERVAL_MINUTES = 30
# A successful refresh that still leaves the data behind means the expected
# session has nothing to publish (exchange holiday, or the source is late) -
# back off instead of refetching the whole universe every tick all day.
_WATCHDOG_RETRY = timedelta(hours=3)
_last_watchdog_attempt: dict[str, datetime] = {}


def _run_scheduled_refresh(market: str) -> None:
    db = SessionLocal()
    try:
        summary = refresh_market(db, market, job_type="scheduled")
        logger.info("Scheduled refresh for %s: %s", market, summary)
    except RefreshAlreadyRunningError:
        logger.info("Scheduled refresh for %s skipped - already running", market)
    finally:
        db.close()


def _run_catchup_watchdog() -> None:
    market = "IN"
    db = SessionLocal()
    try:
        if not needs_catchup(db, market):
            return
        last = _last_watchdog_attempt.get(market)
        if last is not None and datetime.utcnow() - last < _WATCHDOG_RETRY:
            return
        _last_watchdog_attempt[market] = datetime.utcnow()
        logger.info("Watchdog: %s data is behind the last session, refreshing", market)
        summary = refresh_market(db, market, job_type="scheduled")
        logger.info("Watchdog refresh for %s: %s", market, summary)
    except RefreshAlreadyRunningError:
        logger.info("Watchdog refresh for %s skipped - already running", market)
    except Exception:
        logger.exception("Watchdog refresh failed for %s", market)
    finally:
        db.close()


def _run_weekly_sector_refresh() -> None:
    db = SessionLocal()
    try:
        summary = refresh_sector_data(db)
        logger.info("Weekly sector refresh: %s", summary)
    except Exception:
        logger.exception("Weekly sector refresh failed")
    finally:
        db.close()


def start_scheduler() -> None:
    # misfire_grace_time: APScheduler's default tolerance is ~1s - if the
    # process is briefly down or the event loop busy at the cron moment, the
    # run is silently skipped until the NEXT day. A generous grace window +
    # coalesce means a late process still runs the missed job exactly once.
    scheduler.add_job(
        _run_scheduled_refresh,
        CronTrigger(hour=18, minute=0, timezone="Asia/Kolkata"),
        args=["IN"],
        id="in_daily_refresh",
        replace_existing=True,
        misfire_grace_time=6 * 3600,
        coalesce=True,
    )
    scheduler.add_job(
        _run_weekly_sector_refresh,
        CronTrigger(day_of_week="sun", hour=3, minute=15, timezone="Asia/Kolkata"),
        id="weekly_sector_refresh",
        replace_existing=True,
    )
    scheduler.add_job(
        _run_catchup_watchdog,
        IntervalTrigger(minutes=WATCHDOG_INTERVAL_MINUTES),
        id="catchup_watchdog",
        replace_existing=True,
        coalesce=True,
        # No grace cutoff: however late the tick fires (host was asleep), run
        # it - catching up late is this job's entire purpose.
        misfire_grace_time=None,
    )
    scheduler.start()
