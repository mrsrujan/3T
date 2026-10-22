import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.config import settings
from app.db import Base, SessionLocal, engine
from app.models import TradingCalendar
from app.routers import (
    ai,
    alerts,
    earnings,
    global_markets,
    heatmap,
    holdings,
    market_data,
    news,
    persistence,
    rankings,
    refresh,
    scanner,
    screener,
    search,
    stock,
    watchlist,
)
from app.services.backfill import backfill_market
from app.services.refresh_orchestrator import (
    RefreshAlreadyRunningError,
    needs_catchup,
    refresh_market,
    sweep_interrupted_jobs,
)
from app.services.scheduler import scheduler, start_scheduler

# Uvicorn only configures its own loggers - without this, INFO from app.* and
# apscheduler (scheduled/skipped/failed refreshes) never reaches docker logs,
# which is how a refresh pipeline stayed silently wedged for days.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

logger = logging.getLogger(__name__)


def _has_any_trading_days(market: str) -> bool:
    db = SessionLocal()
    try:
        return db.query(TradingCalendar).filter(TradingCalendar.market == market).first() is not None
    finally:
        db.close()


async def _backfill_if_empty(market: str) -> None:
    if _has_any_trading_days(market):
        return

    def _run() -> None:
        db = SessionLocal()
        try:
            summary = backfill_market(db, market)
            logger.info("Startup backfill for %s: %s", market, summary)
        finally:
            db.close()

    await asyncio.to_thread(_run)


async def _catchup_if_stale(market: str) -> None:
    """Self-heal missed scheduled refreshes: if the process wasn't alive at
    the cron moment (dev restarts, machine asleep, container down), the data
    silently stays a day behind until the next cron. This closes that gap on
    every startup."""

    def _run() -> None:
        db = SessionLocal()
        try:
            if not needs_catchup(db, market):
                return
            logger.info("Catch-up refresh for %s: stored data is behind the last session", market)
            try:
                summary = refresh_market(db, market, job_type="scheduled")
                logger.info("Catch-up refresh for %s: %s", market, summary)
            except RefreshAlreadyRunningError:
                logger.info("Catch-up refresh for %s skipped - already running", market)
        finally:
            db.close()

    await asyncio.to_thread(_run)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Alembic owns schema in production (runs as initContainer in K8s or
    # `alembic upgrade head` locally). create_all is a dev-only convenience
    # so first-time local SQLite users don't have to run Alembic manually.
    Base.metadata.create_all(bind=engine)

    # Startup side-effects (sweep, backfill, catchup, scheduler) only run when
    # this process is the scheduling authority. In K8s, API pods have
    # STOCKS_SCHEDULER_ENABLED=false and the dedicated CronJobs own this work;
    # otherwise N API replicas race against each other and the DB.
    if settings.scheduler_enabled:
        db = SessionLocal()
        try:
            swept = sweep_interrupted_jobs(db)
            if swept:
                logger.warning("Marked %d refresh job(s) interrupted by the last shutdown as failed", swept)
        finally:
            db.close()
        asyncio.create_task(_backfill_if_empty("IN"))
        asyncio.create_task(_catchup_if_stale("IN"))
        start_scheduler()
    yield
    if settings.scheduler_enabled:
        scheduler.shutdown(wait=False)


app = FastAPI(title="Stocks Tracker API", lifespan=lifespan)

app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    # Must stay False with wildcard origins (the spec forbids ACAO:* with
    # credentials) - this API uses no cookies or auth headers anyway.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ai.router)
app.include_router(scanner.router)
app.include_router(rankings.router)
app.include_router(persistence.router)
app.include_router(refresh.router)
app.include_router(news.router)
app.include_router(search.router)
app.include_router(stock.router)
app.include_router(heatmap.router)
app.include_router(watchlist.router)
app.include_router(holdings.router)
app.include_router(global_markets.router)
app.include_router(alerts.router)
app.include_router(screener.router)
app.include_router(earnings.router)
app.include_router(market_data.router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/debug/scheduler")
def scheduler_state() -> dict:
    """Ground truth on whether the cron scheduler is alive and what it will
    run next - added after a silently-missed refresh; cheap to keep."""
    return {
        "running": scheduler.running,
        "jobs": [
            {"id": job.id, "next_run_time": str(job.next_run_time)}
            for job in scheduler.get_jobs()
        ],
    }
