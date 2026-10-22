"""Persistence endpoint behavior, especially the min_days threshold ("in the
top-N on at least K of the selected days") added on top of the original
"every single day" semantics."""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.deps import get_db
from app.main import app
from app.models import DailyMetric, Symbol, TradingCalendar


@pytest.fixture()
def client(engine):
    TestSession = sessionmaker(bind=engine)

    def override_get_db():
        session = TestSession()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture()
def seeded(db):
    """3 trading days; ALWAYS is a top gainer all 3 days, SOMETIMES only 2."""
    days = [date(2026, 7, 6), date(2026, 7, 7), date(2026, 7, 8)]
    for d in days:
        db.add(TradingCalendar(market="IN", trade_date=d))

    symbols = {}
    for name in ("ALWAYS", "SOMETIMES", "FILLER"):
        s = Symbol(market="IN", symbol=name, name=name, is_active=1, first_seen=days[0], last_seen=days[-1])
        db.add(s)
        db.flush()
        symbols[name] = s

    pct = {
        "ALWAYS": [10.0, 10.0, 10.0],
        "SOMETIMES": [9.0, 9.0, -50.0],  # drops out of the top-2 on day 3
        "FILLER": [1.0, 1.0, 8.0],
    }
    for name, changes in pct.items():
        for d, chg in zip(days, changes):
            db.add(
                DailyMetric(
                    symbol_id=symbols[name].symbol_id,
                    market="IN",
                    trade_date=d,
                    close=100.0 + chg,
                    prev_close=100.0,
                    pct_change=chg,
                    volume=1000,
                )
            )
    db.commit()
    return symbols


def _get_symbols(client, **params):
    defaults = {"market": "IN", "category": "gainers", "top_n": 2, "mode": "last_n", "n": 3}
    defaults.update(params)
    resp = client.get("/api/persistence", params=defaults)
    assert resp.status_code == 200, resp.text
    return {item["symbol"]: item for item in resp.json()["items"]}


def test_default_requires_every_day(client, seeded):
    items = _get_symbols(client)
    assert set(items) == {"ALWAYS"}
    assert items["ALWAYS"]["days_present"] == 3


def test_min_days_relaxes_threshold(client, seeded):
    items = _get_symbols(client, min_days=2)
    assert set(items) == {"ALWAYS", "SOMETIMES"}
    assert items["SOMETIMES"]["days_present"] == 2


def test_items_include_window_price_change(client, seeded):
    items = _get_symbols(client, min_days=2)
    always = items["ALWAYS"]
    # current price = day-3 close (110), window start = day-1 close (110)
    assert always["current_price"] == pytest.approx(110.0)
    assert always["change_value"] == pytest.approx(0.0)
