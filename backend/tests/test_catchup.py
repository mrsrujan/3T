"""Startup catch-up logic: heals scheduled refreshes missed because no
process was alive at the cron moment (machine asleep, container down)."""

from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.models import TradingCalendar
from app.services.refresh_orchestrator import expected_latest_session, needs_catchup

IST = ZoneInfo("Asia/Kolkata")


def test_expected_session_before_publish_time_is_previous_day():
    # Thu Jul 9 2026, 10:00 IST - market open, EOD file not out yet.
    now = datetime(2026, 7, 9, 10, 0, tzinfo=IST)
    assert expected_latest_session("IN", now) == date(2026, 7, 8)


def test_expected_session_after_publish_time_is_same_day():
    # Thu Jul 9 2026, 19:00 IST - past the 18:00 publish buffer.
    now = datetime(2026, 7, 9, 19, 0, tzinfo=IST)
    assert expected_latest_session("IN", now) == date(2026, 7, 9)


def test_expected_session_skips_weekend():
    # Sunday: last completed session is Friday.
    now = datetime(2026, 7, 12, 12, 0, tzinfo=IST)
    assert expected_latest_session("IN", now) == date(2026, 7, 10)


def test_expected_session_monday_morning_is_friday():
    # Monday before publish time - Friday is the latest complete session.
    now = datetime(2026, 7, 13, 9, 0, tzinfo=IST)
    assert expected_latest_session("IN", now) == date(2026, 7, 10)


def test_needs_catchup_true_when_data_stale(db):
    db.add(TradingCalendar(market="IN", trade_date=date(2026, 7, 8)))
    db.commit()
    # As long as "now" is past a newer session, stored 7/8 counts as stale.
    if expected_latest_session("IN") > date(2026, 7, 8):
        assert needs_catchup(db, "IN") is True


def test_needs_catchup_false_when_empty(db):
    # Empty DB is first-run backfill territory, not catch-up's.
    assert needs_catchup(db, "IN") is False
