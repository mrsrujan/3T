from datetime import date as date_type

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

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


def _seed(db: Session) -> None:
    sym = Symbol(market="IN", symbol="AAPL", name="Apple", sector="Technology", is_active=1)
    db.add(sym)
    db.flush()
    today = date_type.today()
    db.add(TradingCalendar(market="IN", trade_date=today))
    db.add(DailyMetric(
        symbol_id=sym.symbol_id, market="IN", trade_date=today,
        close=150.0, pct_change=2.5, volume=1000000, rel_volume=1.2,
        avg_volume_20d=800000,
    ))
    db.commit()


def test_screener_returns_results(client, db: Session) -> None:
    _seed(db)
    resp = client.get("/api/screener?market=IN")
    assert resp.status_code == 200
    body = resp.json()
    assert body["market"] == "IN"
    assert isinstance(body["items"], list)


def test_screener_pct_change_filter(client, db: Session) -> None:
    _seed(db)
    resp = client.get("/api/screener?market=IN&min_pct_change=3.0")
    assert resp.status_code == 200
    # AAPL has pct_change=2.5, below filter, so no results
    assert resp.json()["total"] == 0


def test_screener_invalid_market(client) -> None:
    resp = client.get("/api/screener?market=XX")
    assert resp.status_code == 400
