"""Regression test for the India name-wipe bug: the daily symbols upsert used
to overwrite `name` with NULL on every refresh for markets whose price source
has no name column (NSE Bhavcopy). See memory: stocks-india-name-wipe-bug."""

from datetime import date

import pandas as pd

from app.models import Symbol
from app.services.computation import _upsert_symbols


def _bhavcopy_like_df(symbol: str) -> pd.DataFrame:
    # India's Bhavcopy frame: prices but NO name column.
    return pd.DataFrame(
        [{"symbol": symbol, "trade_date": date(2026, 7, 9), "close": 100.0}]
    )


def test_upsert_preserves_existing_name_when_source_has_none(db):
    db.add(
        Symbol(
            market="IN",
            symbol="RELIANCE",
            name="Reliance Industries Limited",
            is_active=1,
            first_seen=date(2026, 1, 1),
            last_seen=date(2026, 7, 8),
        )
    )
    db.commit()

    _upsert_symbols(db, "IN", ["RELIANCE"], _bhavcopy_like_df("RELIANCE"))

    row = db.query(Symbol).filter_by(market="IN", symbol="RELIANCE").one()
    assert row.name == "Reliance Industries Limited"
    assert row.last_seen == date(2026, 7, 9)


def test_upsert_updates_name_when_source_provides_one(db):
    db.add(
        Symbol(
            market="IN",
            symbol="INFY",
            name="Old Name",
            is_active=1,
            first_seen=date(2026, 1, 1),
            last_seen=date(2026, 7, 8),
        )
    )
    db.commit()

    df = pd.DataFrame(
        [{"symbol": "INFY", "name": "Infosys Limited", "trade_date": date(2026, 7, 9), "close": 100.0}]
    )
    _upsert_symbols(db, "IN", ["INFY"], df)

    row = db.query(Symbol).filter_by(market="IN", symbol="INFY").one()
    assert row.name == "Infosys Limited"


def test_upsert_creates_new_symbol(db):
    _upsert_symbols(db, "IN", ["NEWSYM"], _bhavcopy_like_df("NEWSYM"))
    row = db.query(Symbol).filter_by(market="IN", symbol="NEWSYM").one()
    assert row.name is None
    assert row.is_active == 1
