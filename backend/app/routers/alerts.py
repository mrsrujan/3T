from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.deps import get_db
from app.schemas import (
    AlertRuleCreateRequest,
    AlertRuleItem,
    AlertRulesResponse,
    AlertRuleUpdateRequest,
    AlertTriggerItem,
    AlertTriggersResponse,
    MarkTriggersReadRequest,
)
from app.services.alert_service import (
    VALID_RULE_TYPES,
    create_rule,
    delete_rule,
    list_rules,
    list_triggers,
    mark_triggers_read,
    update_rule,
)

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

VALID_MARKETS = {"IN"}


@router.get("/rules", response_model=AlertRulesResponse)
def get_rules(market: str | None = Query(None), db: Session = Depends(get_db)) -> AlertRulesResponse:
    return AlertRulesResponse(items=[AlertRuleItem(**r) for r in list_rules(db, market)])


@router.post("/rules", status_code=201, response_model=AlertRuleItem)
def add_rule(payload: AlertRuleCreateRequest, db: Session = Depends(get_db)) -> AlertRuleItem:
    if payload.market not in VALID_MARKETS:
        raise HTTPException(status_code=400, detail=f"market must be one of {sorted(VALID_MARKETS)}")
    if payload.rule_type not in VALID_RULE_TYPES:
        raise HTTPException(status_code=400, detail=f"rule_type must be one of {sorted(VALID_RULE_TYPES)}")

    result = create_rule(db, payload.market, payload.symbol.upper(), payload.rule_type, payload.threshold)
    if result is None:
        raise HTTPException(
            status_code=404, detail=f"Unknown symbol {payload.symbol} for market {payload.market}"
        )
    return AlertRuleItem(**result)


@router.patch("/rules/{rule_id}", response_model=AlertRuleItem)
def edit_rule(rule_id: int, payload: AlertRuleUpdateRequest, db: Session = Depends(get_db)) -> AlertRuleItem:
    result = update_rule(db, rule_id, payload.is_active)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Alert rule {rule_id} not found")
    return AlertRuleItem(**result)


@router.delete("/rules/{rule_id}", status_code=204, response_model=None)
def remove_rule(rule_id: int, db: Session = Depends(get_db)):
    removed = delete_rule(db, rule_id)
    if not removed:
        raise HTTPException(status_code=404, detail=f"Alert rule {rule_id} not found")


@router.get("/triggers", response_model=AlertTriggersResponse)
def get_triggers(
    unread_only: bool = Query(False), limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db)
) -> AlertTriggersResponse:
    return AlertTriggersResponse(items=[AlertTriggerItem(**t) for t in list_triggers(db, unread_only, limit)])


@router.post("/triggers/mark-read", response_model=None)
def post_mark_read(payload: MarkTriggersReadRequest, db: Session = Depends(get_db)) -> dict:
    count = mark_triggers_read(db, payload.trigger_ids)
    return {"marked_read": count}
