from datetime import date, datetime

from app.models import AlertRule, DailyMetric, Symbol
from app.services.alert_service import _rule_condition_met, check_alerts, list_triggers


class FakeMetric:
    def __init__(self, close=None, pct_change=None, rel_volume=None):
        self.close = close
        self.pct_change = pct_change
        self.rel_volume = rel_volume


def test_rule_condition_met_price_above():
    met, value = _rule_condition_met("price_above", 100.0, FakeMetric(close=150.0))
    assert met and value == 150.0
    met, _ = _rule_condition_met("price_above", 100.0, FakeMetric(close=99.0))
    assert not met


def test_rule_condition_met_pct_change_below():
    met, value = _rule_condition_met("pct_change_below", -5.0, FakeMetric(pct_change=-7.5))
    assert met and value == -7.5
    met, _ = _rule_condition_met("pct_change_below", -5.0, FakeMetric(pct_change=-2.0))
    assert not met


def test_rule_condition_met_handles_none_values():
    met, value = _rule_condition_met("rel_volume_above", 2.0, FakeMetric(rel_volume=None))
    assert not met and value is None


def _seed_symbol_with_metric(db, close=150.0):
    symbol = Symbol(
        market="IN",
        symbol="TEST",
        name="Test Corp",
        is_active=1,
        first_seen=date(2026, 1, 1),
        last_seen=date(2026, 7, 8),
    )
    db.add(symbol)
    db.flush()
    db.add(
        DailyMetric(
            symbol_id=symbol.symbol_id,
            market="IN",
            trade_date=date(2026, 7, 8),
            close=close,
            prev_close=140.0,
            pct_change=7.14,
            volume=1000,
        )
    )
    db.commit()
    return symbol


def test_check_alerts_triggers_and_is_idempotent(db):
    symbol = _seed_symbol_with_metric(db, close=150.0)
    db.add(
        AlertRule(
            symbol_id=symbol.symbol_id,
            market="IN",
            rule_type="price_above",
            threshold=100.0,
            is_active=1,
            created_at=datetime(2026, 7, 1),
        )
    )
    db.commit()

    assert check_alerts(db, "IN") == 1
    # Re-running for the same trading day must not duplicate the trigger.
    assert check_alerts(db, "IN") == 0
    assert len(list_triggers(db)) == 1


def test_check_alerts_skips_inactive_rules(db):
    symbol = _seed_symbol_with_metric(db, close=150.0)
    db.add(
        AlertRule(
            symbol_id=symbol.symbol_id,
            market="IN",
            rule_type="price_above",
            threshold=100.0,
            is_active=0,
            created_at=datetime(2026, 7, 1),
        )
    )
    db.commit()

    assert check_alerts(db, "IN") == 0
    assert list_triggers(db) == []
