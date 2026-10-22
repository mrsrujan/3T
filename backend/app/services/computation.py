"""Compute derived ranking metrics (pct_change, avg_volume_20d, rel_volume)
from raw daily OHLCV, and upsert both raw + derived values into SQLite.

Same methodology for both markets so gainers/losers/most-active/trending are
comparable: values are computed once at ingest, top-N is always a read-time
ORDER BY ... LIMIT so N stays flexible in the UI.
"""

from __future__ import annotations

from datetime import date, datetime

import pandas as pd
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import dialect_insert
from app.models import Symbol, DailyMetric, TradingCalendar

ROLLING_WINDOW_DAYS = 20

# SQLite's default build here allows up to 32766 bound parameters per
# statement; chunk inserts well under that so wide upsert batches (thousands
# of symbols x weeks of history) never trip "too many SQL variables".
DAILY_METRICS_CHUNK_SIZE = 1000  # * 11 cols = 11,000 params
SYMBOLS_CHUNK_SIZE = 2000  # * 5 cols = 10,000 params


def _chunked(items: list, size: int) -> list[list]:
    return [items[i : i + size] for i in range(0, len(items), size)]

RAW_INPUT_COLUMNS = [
    "symbol",
    "trade_date",
    "open",
    "high",
    "low",
    "close",
    "volume",
]


def compute_derived_metrics(df: pd.DataFrame) -> pd.DataFrame:
    """Given raw per-symbol daily OHLCV (+ optional prev_close/turnover),
    return the same rows with prev_close, pct_change, avg_volume_20d and
    rel_volume filled in.

    - prev_close: kept as-given where present (e.g. NSE bhavcopy provides the
      exchange's authoritative previous close); computed via close.shift(1)
      per symbol wherever missing (always the case for US/yfinance).
    - avg_volume_20d: trailing 20-trading-day average volume, EXCLUDING the
      current day (shift(1) before rolling so today's volume can't leak into
      its own baseline).
    - rel_volume: volume / avg_volume_20d (NaN when the baseline is NaN or 0).
    """
    if df.empty:
        return df.assign(prev_close=[], pct_change=[], avg_volume_20d=[], rel_volume=[])

    out = df.sort_values(["symbol", "trade_date"]).reset_index(drop=True).copy()

    if "prev_close" not in out.columns:
        out["prev_close"] = pd.NA
    shifted_close = out.groupby("symbol")["close"].shift(1)
    out["prev_close"] = out["prev_close"].where(out["prev_close"].notna(), shifted_close)

    out["pct_change"] = (out["close"] - out["prev_close"]) / out["prev_close"] * 100

    trailing_avg_volume = out.groupby("symbol")["volume"].transform(
        lambda s: s.shift(1).rolling(window=ROLLING_WINDOW_DAYS, min_periods=1).mean()
    )
    out["avg_volume_20d"] = trailing_avg_volume
    out["rel_volume"] = out["volume"] / out["avg_volume_20d"]
    out.loc[out["avg_volume_20d"].isna() | (out["avg_volume_20d"] == 0), "rel_volume"] = pd.NA

    if "turnover" not in out.columns:
        out["turnover"] = pd.NA

    return out


def upsert_daily_metrics(db: Session, market: str, df: pd.DataFrame) -> int:
    """Upsert symbols + daily_metrics rows for `market`. Returns row count upserted."""
    if df.empty:
        return 0

    symbols = sorted(df["symbol"].unique())
    _upsert_symbols(db, market, symbols, df)
    symbol_id_map = _get_symbol_id_map(db, market, symbols)

    rows = []
    trade_dates: set[date] = set()
    for record in df.to_dict(orient="records"):
        trade_dates.add(record["trade_date"])
        rows.append(
            {
                "symbol_id": symbol_id_map[record["symbol"]],
                "market": market,
                "trade_date": record["trade_date"],
                "open": _clean(record.get("open")),
                "high": _clean(record.get("high")),
                "low": _clean(record.get("low")),
                "close": _clean(record.get("close")),
                "prev_close": _clean(record.get("prev_close")),
                "volume": _clean(record.get("volume")),
                "turnover": _clean(record.get("turnover")),
                "pct_change": _clean(record.get("pct_change")),
                "avg_volume_20d": _clean(record.get("avg_volume_20d")),
                "rel_volume": _clean(record.get("rel_volume")),
            }
        )

    update_col_names = (
        "open",
        "high",
        "low",
        "close",
        "prev_close",
        "volume",
        "turnover",
        "pct_change",
        "avg_volume_20d",
        "rel_volume",
    )
    for batch in _chunked(rows, DAILY_METRICS_CHUNK_SIZE):
        stmt = dialect_insert()(DailyMetric).values(batch)
        update_cols = {c: stmt.excluded[c] for c in update_col_names}
        stmt = stmt.on_conflict_do_update(
            index_elements=["symbol_id", "trade_date"], set_=update_cols
        )
        db.execute(stmt)

    _upsert_trading_calendar(db, market, trade_dates)
    db.commit()
    return len(rows)


def _clean(value):
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    return value


def _upsert_symbols(db: Session, market: str, symbols: list[str], df: pd.DataFrame) -> None:
    name_by_symbol: dict[str, str | None] = {}
    if "name" in df.columns:
        for record in df[["symbol", "name"]].drop_duplicates("symbol").to_dict(orient="records"):
            name_by_symbol[record["symbol"]] = record.get("name")

    min_date = df["trade_date"].min()
    max_date = df["trade_date"].max()

    rows = [
        {
            "market": market,
            "symbol": sym,
            "name": name_by_symbol.get(sym),
            "is_active": 1,
            "first_seen": min_date,
            "last_seen": max_date,
        }
        for sym in symbols
    ]
    for batch in _chunked(rows, SYMBOLS_CHUNK_SIZE):
        insert_stmt = dialect_insert()(Symbol).values(batch)
        upsert_stmt = insert_stmt.on_conflict_do_update(
            index_elements=["market", "symbol"],
            set_={
                "last_seen": insert_stmt.excluded.last_seen,
                "is_active": 1,
                # Bhavcopy (India's price source) has no name column, so a
                # plain overwrite here would silently null out every name
                # backfilled separately (sector_service.py) on the very next
                # daily refresh. COALESCE keeps the existing name whenever
                # this particular upsert has nothing better to offer.
                "name": func.coalesce(insert_stmt.excluded.name, Symbol.name),
            },
        )
        db.execute(upsert_stmt)
    db.commit()


def _get_symbol_id_map(db: Session, market: str, symbols: list[str]) -> dict[str, int]:
    rows = (
        db.query(Symbol.symbol, Symbol.symbol_id)
        .filter(Symbol.market == market, Symbol.symbol.in_(symbols))
        .all()
    )
    return {symbol: symbol_id for symbol, symbol_id in rows}


def _upsert_trading_calendar(db: Session, market: str, trade_dates: set[date]) -> None:
    if not trade_dates:
        return
    rows = [{"market": market, "trade_date": d} for d in trade_dates]
    stmt = dialect_insert()(TradingCalendar).values(rows)
    stmt = stmt.on_conflict_do_nothing(index_elements=["market", "trade_date"])
    db.execute(stmt)
