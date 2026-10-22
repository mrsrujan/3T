"""Orchestrates sector/industry classification for both markets into the
symbols table. Update-only: never creates a Symbol row (those are created by
the price-ingestion path in computation.py) - just fills in sector/industry
for symbols that already exist.
"""

from __future__ import annotations

import logging

import pandas as pd
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.fundamentals import fetch_sector_for_symbols
from app.services.india_sector import fetch_india_name_data, fetch_india_sector_data

logger = logging.getLogger(__name__)

UPDATE_CHUNK_SIZE = 1000


def _chunked(items: list, size: int) -> list[list]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def upsert_sector_data(db: Session, market: str, df: pd.DataFrame) -> int:
    """Targeted UPDATE of symbols.sector/industry for rows that already exist.
    Returns the number of symbol rows the DataFrame covered (not necessarily
    the number actually updated - unknown symbols are silently skipped)."""
    if df.empty:
        return 0

    if "industry" not in df.columns:
        df = df.assign(industry=None)

    params = [
        {
            "market": market,
            "symbol": row["symbol"],
            "sector": row["sector"] if pd.notna(row["sector"]) else None,
            "industry": row["industry"] if pd.notna(row["industry"]) else None,
        }
        for _, row in df.iterrows()
    ]

    stmt = text(
        "UPDATE symbols SET sector = :sector, industry = :industry "
        "WHERE market = :market AND symbol = :symbol"
    )
    for batch in _chunked(params, UPDATE_CHUNK_SIZE):
        db.execute(stmt, batch)
    db.commit()

    return len(params)


def upsert_name_data(db: Session, market: str, df: pd.DataFrame) -> int:
    """Targeted UPDATE of symbols.name for rows that already exist. Same
    update-only contract as upsert_sector_data - never creates a Symbol row.
    Skips blank/NaN names so a bad row can't clobber an existing good name."""
    if df.empty:
        return 0

    params = [
        {"market": market, "symbol": row["symbol"], "name": row["name"]}
        for _, row in df.iterrows()
        if pd.notna(row["name"]) and str(row["name"]).strip()
    ]
    if not params:
        return 0

    stmt = text("UPDATE symbols SET name = :name WHERE market = :market AND symbol = :symbol")
    for batch in _chunked(params, UPDATE_CHUNK_SIZE):
        db.execute(stmt, batch)
    db.commit()

    return len(params)


def backfill_missing_sector_via_yfinance(db: Session, market: str) -> int:
    """Fallback pass for symbols the free sources (NSE Nifty Total Market CSV,
    Wikipedia GICS tables) don't cover - queries yfinance .info directly.
    Only ever touches rows still NULL, so it can't clobber the preferred
    free-source classification with a different taxonomy."""
    rows = db.execute(
        text("SELECT symbol FROM symbols WHERE market = :market AND sector IS NULL"),
        {"market": market},
    ).all()
    symbols = [r[0] for r in rows]
    if not symbols:
        return 0

    df = fetch_sector_for_symbols(symbols, market)
    df = df[df["sector"].notna()]
    return upsert_sector_data(db, market, df)


def refresh_sector_data(db: Session) -> dict:
    india_df = fetch_india_sector_data()
    india_count = upsert_sector_data(db, "IN", india_df)

    india_name_df = fetch_india_name_data()
    india_name_count = upsert_name_data(db, "IN", india_name_df)

    india_fallback_count = backfill_missing_sector_via_yfinance(db, "IN")

    logger.info(
        "Sector refresh: IN=%d rows (+%d yfinance fallback), IN names=%d rows",
        india_count,
        india_fallback_count,
        india_name_count,
    )
    return {
        "IN": india_count,
        "IN_fallback": india_fallback_count,
        "IN_names": india_name_count,
    }
