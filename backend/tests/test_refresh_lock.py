"""Refresh run-lock hygiene: a 'running' row from a process killed mid-run
must not block scheduled refreshes forever."""

from datetime import datetime, timedelta

from app.models import RefreshLog
from app.services.refresh_orchestrator import (
    RUNNING_LOCK_MAX_AGE,
    is_job_running,
    sweep_interrupted_jobs,
)


def _running_row(started_at: datetime, market: str = "IN") -> RefreshLog:
    return RefreshLog(
        started_at=started_at,
        market=market,
        job_type="manual",
        status="running",
    )


def test_fresh_running_row_holds_the_lock(db):
    db.add(_running_row(datetime.utcnow() - timedelta(minutes=5)))
    db.commit()
    assert is_job_running(db, "IN") is True


def test_stale_running_row_does_not_hold_the_lock(db):
    db.add(_running_row(datetime.utcnow() - RUNNING_LOCK_MAX_AGE - timedelta(minutes=1)))
    db.commit()
    assert is_job_running(db, "IN") is False


def test_sweep_fails_interrupted_jobs(db):
    db.add(_running_row(datetime.utcnow() - timedelta(days=2)))
    db.add(_running_row(datetime.utcnow()))
    db.commit()

    assert sweep_interrupted_jobs(db) == 2

    rows = db.query(RefreshLog).all()
    assert all(r.status == "failed" for r in rows)
    assert all(r.finished_at is not None for r in rows)
    assert all(r.error_message == "interrupted by process restart" for r in rows)
    assert is_job_running(db, "IN") is False


def test_sweep_ignores_finished_jobs(db):
    row = _running_row(datetime.utcnow() - timedelta(hours=1))
    row.status = "success"
    row.finished_at = datetime.utcnow()
    db.add(row)
    db.commit()

    assert sweep_interrupted_jobs(db) == 0
    assert db.query(RefreshLog).one().status == "success"
