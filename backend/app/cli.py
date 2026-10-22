"""CLI entry points for scheduled jobs.

Each subcommand corresponds to a K8s CronJob: the pod runs
`python -m app.cli <subcommand>`, the function executes once, and the
pod exits with 0 on success or 1 on failure. Same code paths the
APScheduler in-process scheduler invokes for local dev.
"""

from __future__ import annotations

import argparse
import logging
import sys

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


def _refresh(market: str) -> int:
    from app.db import SessionLocal
    from app.services.refresh_orchestrator import RefreshAlreadyRunningError, refresh_market

    db = SessionLocal()
    try:
        summary = refresh_market(db, market, job_type="scheduled")
        logger.info("Scheduled refresh for %s: %s", market, summary)
        return 0
    except RefreshAlreadyRunningError:
        logger.info("Scheduled refresh for %s skipped - already running", market)
        return 0
    except Exception:
        logger.exception("Scheduled refresh for %s failed", market)
        return 1
    finally:
        db.close()


def cmd_india_refresh(_args: argparse.Namespace) -> int:
    return _refresh("IN")


def cmd_catchup(_args: argparse.Namespace) -> int:
    """Refresh if we fell behind the last session, and sweep any 'running'
    rows left over from a crashed previous run."""
    from app.db import SessionLocal
    from app.services.refresh_orchestrator import (
        RefreshAlreadyRunningError,
        needs_catchup,
        refresh_market,
        sweep_interrupted_jobs,
    )

    exit_code = 0
    db = SessionLocal()
    try:
        swept = sweep_interrupted_jobs(db)
        if swept:
            logger.warning("Marked %d refresh job(s) interrupted by a prior crash as failed", swept)
    finally:
        db.close()

    db = SessionLocal()
    try:
        if not needs_catchup(db, "IN"):
            logger.info("Catchup check for IN: up to date")
            return exit_code
        logger.info("Catchup refresh for IN: stored data is behind the last session")
        summary = refresh_market(db, "IN", job_type="scheduled")
        logger.info("Catchup refresh for IN: %s", summary)
    except RefreshAlreadyRunningError:
        logger.info("Catchup refresh for IN skipped - already running")
    except Exception:
        logger.exception("Catchup refresh failed for IN")
        exit_code = 1
    finally:
        db.close()

    return exit_code


def cmd_backfill(args: argparse.Namespace) -> int:
    """One-off first-run bootstrap. Not a scheduled CronJob - trigger with
    `kubectl create job --from=job/stockmantra-backfill` or run the standalone
    Job manifest. Idempotent: if the DB already has data, it's a no-op."""
    from app.db import SessionLocal
    from app.services.backfill import backfill_market

    db = SessionLocal()
    try:
        logger.info("Backfilling IN...")
        summary = backfill_market(db, "IN", calendar_days=args.days)
        logger.info("Backfill IN: %s", summary)
        return 0
    except Exception:
        logger.exception("Backfill failed")
        return 1
    finally:
        db.close()


def cmd_sector_weekly(_args: argparse.Namespace) -> int:
    from app.db import SessionLocal
    from app.services.sector_service import refresh_sector_data

    db = SessionLocal()
    try:
        summary = refresh_sector_data(db)
        logger.info("Weekly sector refresh: %s", summary)
        return 0
    except Exception:
        logger.exception("Weekly sector refresh failed")
        return 1
    finally:
        db.close()


SUBCOMMANDS = {
    "india-refresh": cmd_india_refresh,
    "catchup": cmd_catchup,
    "sector-weekly": cmd_sector_weekly,
    "backfill": cmd_backfill,
}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    for name, _fn in SUBCOMMANDS.items():
        sp = sub.add_parser(name)
        if name == "backfill":
            sp.add_argument("--days", type=int, default=None)
    args = parser.parse_args(argv)
    return SUBCOMMANDS[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
