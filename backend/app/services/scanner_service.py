"""Technical setup scanner.

Pulls ~1 year of OHLCV per active symbol, computes RSI/MACD/SMA/52W metrics,
and flags which setup conditions each stock satisfies. Results are cached for
1 hour — the first call per market may take 3-5 s; all subsequent calls are
sub-millisecond."""

from __future__ import annotations

import logging
from datetime import date, timedelta

import numpy as np
import pandas as pd
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import to_date
from app.services.cache import _cache
from app.services.indicators import compute_macd, compute_rsi

logger = logging.getLogger(__name__)

SCANNER_TTL = 3_600  # seconds

SETUP_META: dict[str, dict] = {
    "breakout":    {"label": "Breakout",      "color": "emerald"},
    "rs_leader":   {"label": "RS Leader",     "color": "cyan"},
    "new_52w_high":{"label": "52W High",      "color": "amber"},
    "new_52w_low": {"label": "52W Low",       "color": "red"},
    "swing_rsi":   {"label": "RSI Pullback",  "color": "purple"},
    "swing_macd":  {"label": "MACD Cross",    "color": "blue"},
    "volume_surge":{"label": "Vol Surge",     "color": "orange"},
}


# ── public API ────────────────────────────────────────────────────────────────

def scan(
    db: Session,
    market: str,
    setups: list[str] | None = None,
    sector: str | None = None,
    sort_by: str = "rs_score",
    limit: int = 100,
) -> tuple[list[dict], date | None]:
    all_items, trade_date = _get_or_compute(db, market)
    items = list(all_items)

    if sector:
        items = [i for i in items if i.get("sector") == sector]

    if setups:
        want = set(setups)
        items = [i for i in items if want & set(i.get("setups", []))]

    _key: dict = {
        "rs_score":   lambda x: x.get("rs_percentile") or 0,
        "pct_change": lambda x: x.get("pct_change") or -999,
        "rel_volume": lambda x: x.get("rel_volume") or 0,
        "volume":     lambda x: x.get("volume") or 0,
    }
    items.sort(key=_key.get(sort_by, _key["rs_score"]), reverse=True)
    return items[:limit], trade_date


def get_sector_rotation(db: Session, market: str) -> tuple[list[dict], date | None]:
    cache_key = f"sector_rotation:{market}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    all_items, trade_date = _get_or_compute(db, market)
    by_sec: dict[str, dict] = {}
    for item in all_items:
        sec = item.get("sector")
        if not sec:
            continue
        if sec not in by_sec:
            by_sec[sec] = {"r1w": [], "r1m": [], "r3m": [], "n": 0}
        by_sec[sec]["n"] += 1
        for k, field in [("r1w", "return_1w"), ("r1m", "return_1m"), ("r3m", "return_3m")]:
            v = item.get(field)
            if v is not None:
                by_sec[sec][k].append(v)

    sectors = []
    for sec, d in by_sec.items():
        sectors.append({
            "sector": sec,
            "symbol_count": d["n"],
            "return_1w": float(np.median(d["r1w"])) if d["r1w"] else None,
            "return_1m": float(np.median(d["r1m"])) if d["r1m"] else None,
            "return_3m": float(np.median(d["r3m"])) if d["r3m"] else None,
        })
    sectors.sort(key=lambda x: x.get("return_3m") or -999, reverse=True)

    result = (sectors, trade_date)
    _cache.set(cache_key, result, SCANNER_TTL)
    return result


def get_symbol_technicals(db: Session, market: str, symbol: str) -> dict:
    """Single-symbol setup lookup — uses cached scanner data."""
    all_items, _ = _get_or_compute(db, market)
    sym = symbol.upper()
    for item in all_items:
        if item["symbol"] == sym:
            return {k: item.get(k) for k in (
                "setups", "rs_percentile", "rsi_14", "sma_20", "sma_50", "sma_200",
                "macd_hist", "week52_high", "week52_low", "distance_from_52w_high_pct",
                "return_1w", "return_1m", "return_3m",
            )}
    return {"setups": []}


def get_setups_map(db: Session, market: str) -> dict[str, list[str]]:
    """Returns {symbol: [setup_id, ...]} for all active symbols — for screener annotation."""
    all_items, _ = _get_or_compute(db, market)
    return {item["symbol"]: item.get("setups", []) for item in all_items}


# ── internals ─────────────────────────────────────────────────────────────────

def _get_or_compute(db: Session, market: str) -> tuple[list[dict], date | None]:
    cache_key = f"scanner:{market}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached
    result = _compute_all(db, market)
    _cache.set(cache_key, result, SCANNER_TTL)
    return result


def _compute_all(db: Session, market: str) -> tuple[list[dict], date | None]:
    td_row = db.execute(
        text("SELECT MAX(trade_date) as ld FROM trading_calendar WHERE market = :m"),
        {"m": market},
    ).one()
    trade_date = to_date(td_row.ld)
    if trade_date is None:
        return [], None

    # Compute the cutoff in Python so the SQL stays portable (SQLite's
    # date(:ld, '-395 days') modifier isn't valid Postgres).
    cutoff_date = trade_date - timedelta(days=395)

    # Pull ~13 months of OHLCV for all symbols active on the latest date
    hist_sql = text("""
        SELECT dm.symbol_id, s.symbol, s.name, s.sector,
               dm.trade_date, dm.close, dm.volume, dm.pct_change, dm.rel_volume
        FROM daily_metrics dm
        JOIN symbols s ON s.symbol_id = dm.symbol_id
        WHERE dm.market = :market
          AND s.is_active = 1
          AND dm.close IS NOT NULL
          AND dm.symbol_id IN (
              SELECT symbol_id FROM daily_metrics
              WHERE market = :market
                AND trade_date = :ld
                AND close IS NOT NULL
          )
          AND dm.trade_date >= :cutoff
        ORDER BY dm.symbol_id, dm.trade_date
    """)
    rows = db.execute(
        hist_sql, {"market": market, "ld": trade_date, "cutoff": cutoff_date}
    ).all()
    if not rows:
        return [], trade_date

    df = pd.DataFrame(
        rows,
        columns=["symbol_id", "symbol", "name", "sector",
                 "trade_date", "close", "volume", "pct_change", "rel_volume"],
    )
    df["trade_date"] = pd.to_datetime(df["trade_date"])
    df["close"] = pd.to_numeric(df["close"], errors="coerce")

    items: list[dict] = []
    for _, grp in df.groupby("symbol_id", sort=False):
        try:
            items.append(_compute_symbol(grp))
        except Exception:
            logger.debug("Scanner failed for symbol_id=%s", grp["symbol_id"].iloc[0], exc_info=True)

    if not items:
        return [], trade_date

    # Rank 3M returns as a percentile within the market
    r3m_vals = np.array([i["return_3m"] for i in items if i["return_3m"] is not None], dtype=float)
    if r3m_vals.size:
        r3m_sorted = np.sort(r3m_vals)
        for item in items:
            r = item.get("return_3m")
            item["rs_percentile"] = (
                float(np.searchsorted(r3m_sorted, r) / r3m_sorted.size * 100)
                if r is not None else None
            )
    else:
        for item in items:
            item["rs_percentile"] = None

    # Detect setups (needs rs_percentile, so done after ranking)
    for item in items:
        item["setups"] = _detect_setups(item)
        item.pop("_macd_hist_prev", None)

    return items, trade_date


def _compute_symbol(grp: pd.DataFrame) -> dict:
    grp = grp.sort_values("trade_date")
    closes = grp["close"].dropna()
    n = len(closes)
    latest = grp.iloc[-1]

    close_val = float(latest["close"]) if pd.notna(latest["close"]) else None

    # SMAs
    def _sma(w: int) -> float | None:
        return float(closes.tail(w).mean()) if n >= w else None

    sma_20 = _sma(20)
    sma_50 = _sma(50)
    sma_200 = _sma(200)

    # RSI
    rsi_14 = None
    if n >= 28:
        s = compute_rsi(closes.reset_index(drop=True), 14)
        v = s.iloc[-1]
        rsi_14 = float(v) if pd.notna(v) else None

    # MACD histogram (current and previous bar for crossover detection)
    macd_hist_now = macd_hist_prev = None
    if n >= 40:
        _, _, hist = compute_macd(closes.reset_index(drop=True))
        v_now = hist.iloc[-1]
        v_prev = hist.iloc[-2] if n >= 41 else None
        macd_hist_now = float(v_now) if pd.notna(v_now) else None
        macd_hist_prev = float(v_prev) if v_prev is not None and pd.notna(v_prev) else None

    # 52W metrics from up to 252 bars of history
    tail252 = closes.tail(252)
    week52_high = float(tail252.max())
    week52_low = float(tail252.min())

    dist_52h = float((close_val / week52_high - 1) * 100) if close_val and week52_high else None

    def _ret(lag: int) -> float | None:
        if n <= lag:
            return None
        ref_idx = -(lag + 1)
        s_arr = closes.values
        ref = s_arr[ref_idx]
        last = s_arr[-1]
        if ref == 0 or not np.isfinite(ref) or not np.isfinite(last):
            return None
        return float((last - ref) / ref * 100)

    pct_change = latest["pct_change"]
    rel_volume = latest["rel_volume"]
    volume = latest["volume"]

    return {
        "symbol":   str(latest["symbol"]),
        "name":     latest["name"],
        "sector":   latest["sector"],
        "close":    close_val,
        "pct_change":  float(pct_change) if pct_change is not None and pd.notna(pct_change) else None,
        "volume":   int(volume) if volume is not None and pd.notna(volume) else None,
        "rel_volume": float(rel_volume) if rel_volume is not None and pd.notna(rel_volume) else None,
        "week52_high": week52_high,
        "week52_low":  week52_low,
        "distance_from_52w_high_pct": dist_52h,
        "sma_20":  sma_20,
        "sma_50":  sma_50,
        "sma_200": sma_200,
        "rsi_14":  rsi_14,
        "macd_hist": macd_hist_now,
        "_macd_hist_prev": macd_hist_prev,
        "return_1w": _ret(5),
        "return_1m": _ret(21),
        "return_3m": _ret(63),
    }


def _detect_setups(item: dict) -> list[str]:
    setups: list[str] = []
    close       = item.get("close")
    pct_change  = item.get("pct_change")
    rel_volume  = item.get("rel_volume")
    rsi_14      = item.get("rsi_14")
    sma_50      = item.get("sma_50")
    dist_52h    = item.get("distance_from_52w_high_pct")
    rs_pct      = item.get("rs_percentile")
    macd_now    = item.get("macd_hist")
    macd_prev   = item.get("_macd_hist_prev")
    w52h        = item.get("week52_high")
    w52l        = item.get("week52_low")

    if rel_volume is not None and rel_volume >= 2.5:
        setups.append("volume_surge")

    if close and w52h and w52h > 0 and (close / w52h) >= 0.995:
        setups.append("new_52w_high")

    if close and w52l and w52l > 0 and (close / w52l) <= 1.005:
        setups.append("new_52w_low")

    if (dist_52h is not None and -5 <= dist_52h <= 1
            and pct_change is not None and pct_change > 0
            and rel_volume is not None and rel_volume >= 1.2):
        setups.append("breakout")

    if rs_pct is not None and rs_pct >= 75:
        setups.append("rs_leader")

    if (rsi_14 is not None and sma_50 is not None and close is not None
            and 38 <= rsi_14 <= 52 and close > sma_50):
        setups.append("swing_rsi")

    if macd_now is not None and macd_prev is not None and macd_prev < 0 and macd_now >= 0:
        setups.append("swing_macd")

    return setups
