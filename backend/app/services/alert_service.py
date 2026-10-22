"""Alert rule evaluation and CRUD. Rules are EOD-only (checked once per
refresh, scheduled or manual - see refresh_orchestrator.py), never intraday.
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from app.db import dialect_insert
from app.models import AlertRule, AlertTrigger

RULE_LABELS = {
    "pct_change_above": "% change above",
    "pct_change_below": "% change below",
    "price_above": "price above",
    "price_below": "price below",
    "rel_volume_above": "rel. volume above",
}

VALID_RULE_TYPES = set(RULE_LABELS)


def _rule_condition_met(rule_type: str, threshold: float, metric_row) -> tuple[bool, float | None]:
    if rule_type == "pct_change_above":
        v = metric_row.pct_change
        return (v is not None and v > threshold), v
    if rule_type == "pct_change_below":
        v = metric_row.pct_change
        return (v is not None and v < threshold), v
    if rule_type == "price_above":
        v = metric_row.close
        return (v is not None and v > threshold), v
    if rule_type == "price_below":
        v = metric_row.close
        return (v is not None and v < threshold), v
    if rule_type == "rel_volume_above":
        v = metric_row.rel_volume
        return (v is not None and v > threshold), v
    return False, None


def check_alerts(db: Session, market: str) -> int:
    """Evaluate all active rules for `market` against each symbol's latest
    daily_metrics row. Idempotent per trading day via the (rule_id, trade_date)
    unique constraint - safe to call from both scheduled and manual refreshes."""
    rules = db.execute(
        text(
            "SELECT ar.id, ar.symbol_id, ar.rule_type, ar.threshold, s.symbol "
            "FROM alert_rules ar JOIN symbols s ON s.symbol_id = ar.symbol_id "
            "WHERE ar.market = :market AND ar.is_active = 1"
        ),
        {"market": market},
    ).all()
    if not rules:
        return 0

    now = datetime.utcnow()
    triggered_rows = []
    for rule in rules:
        metric = db.execute(
            text(
                "SELECT trade_date, close, pct_change, rel_volume FROM daily_metrics "
                "WHERE symbol_id = :symbol_id AND market = :market "
                "ORDER BY trade_date DESC LIMIT 1"
            ),
            {"symbol_id": rule.symbol_id, "market": market},
        ).first()
        if metric is None:
            continue

        met, value = _rule_condition_met(rule.rule_type, rule.threshold, metric)
        if not met or value is None:
            continue

        label = RULE_LABELS[rule.rule_type]
        message = f"{rule.symbol} {label} {rule.threshold:g} (currently {value:.2f})"
        triggered_rows.append(
            {
                "rule_id": rule.id,
                "symbol_id": rule.symbol_id,
                "market": market,
                # raw text() queries bypass SQLAlchemy type coercion:
                # SQLite returns ISO strings, Postgres returns date objects.
                "trade_date": (
                    metric.trade_date
                    if isinstance(metric.trade_date, date)
                    else date.fromisoformat(metric.trade_date)
                ),
                "triggered_at": now,
                "trigger_value": value,
                "message": message,
                "is_read": 0,
            }
        )

    if not triggered_rows:
        return 0

    stmt = dialect_insert()(AlertTrigger).values(triggered_rows)
    stmt = stmt.on_conflict_do_nothing(index_elements=["rule_id", "trade_date"])
    result = db.execute(stmt)
    db.commit()
    return result.rowcount or 0


def _rule_to_dict(row) -> dict:
    return {
        "id": row.id,
        "market": row.market,
        "symbol": row.symbol,
        "name": row.name,
        "rule_type": row.rule_type,
        "threshold": row.threshold,
        "is_active": bool(row.is_active),
        "created_at": row.created_at,
    }


def list_rules(db: Session, market: str | None = None) -> list[dict]:
    where = "WHERE ar.market = :market" if market else ""
    rows = db.execute(
        text(
            f"""
            SELECT ar.id, ar.market, s.symbol, s.name, ar.rule_type, ar.threshold, ar.is_active, ar.created_at
            FROM alert_rules ar
            JOIN symbols s ON s.symbol_id = ar.symbol_id
            {where}
            ORDER BY ar.created_at DESC
            """
        ),
        {"market": market} if market else {},
    ).all()
    return [_rule_to_dict(r) for r in rows]


def create_rule(db: Session, market: str, symbol: str, rule_type: str, threshold: float) -> dict | None:
    symbol_row = db.execute(
        text("SELECT symbol_id FROM symbols WHERE market = :market AND symbol = :symbol"),
        {"market": market, "symbol": symbol},
    ).first()
    if symbol_row is None:
        return None

    rule = AlertRule(
        symbol_id=symbol_row.symbol_id,
        market=market,
        rule_type=rule_type,
        threshold=threshold,
        is_active=1,
        created_at=datetime.utcnow(),
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)

    return next((r for r in list_rules(db) if r["id"] == rule.id), None)


def update_rule(db: Session, rule_id: int, is_active: bool | None) -> dict | None:
    rule = db.query(AlertRule).filter(AlertRule.id == rule_id).first()
    if rule is None:
        return None
    if is_active is not None:
        rule.is_active = int(is_active)
    db.commit()
    return next((r for r in list_rules(db) if r["id"] == rule_id), None)


def delete_rule(db: Session, rule_id: int) -> bool:
    deleted = db.query(AlertRule).filter(AlertRule.id == rule_id).delete()
    db.commit()
    return deleted > 0


def _trigger_to_dict(row) -> dict:
    return {
        "id": row.id,
        "market": row.market,
        "symbol": row.symbol,
        "name": row.name,
        "trade_date": date.fromisoformat(row.trade_date) if isinstance(row.trade_date, str) else row.trade_date,
        "triggered_at": row.triggered_at,
        "trigger_value": row.trigger_value,
        "message": row.message,
        "is_read": bool(row.is_read),
    }


def list_triggers(db: Session, unread_only: bool = False, limit: int = 50) -> list[dict]:
    where = "WHERE at.is_read = 0" if unread_only else ""
    rows = db.execute(
        text(
            f"""
            SELECT at.id, at.market, s.symbol, s.name, at.trade_date, at.triggered_at,
                   at.trigger_value, at.message, at.is_read
            FROM alert_triggers at
            JOIN symbols s ON s.symbol_id = at.symbol_id
            {where}
            ORDER BY at.triggered_at DESC
            LIMIT :limit
            """
        ),
        {"limit": limit},
    ).all()
    return [_trigger_to_dict(r) for r in rows]


def mark_triggers_read(db: Session, trigger_ids: list[int] | None = None) -> int:
    """Marks specific triggers read, or all unread triggers if trigger_ids is None."""
    if trigger_ids is not None:
        if not trigger_ids:
            return 0
        result = db.execute(
            text("UPDATE alert_triggers SET is_read = 1 WHERE id IN :ids AND is_read = 0").bindparams(
                bindparam("ids", expanding=True)
            ),
            {"ids": trigger_ids},
        )
    else:
        result = db.execute(text("UPDATE alert_triggers SET is_read = 1 WHERE is_read = 0"))
    db.commit()
    return result.rowcount or 0
