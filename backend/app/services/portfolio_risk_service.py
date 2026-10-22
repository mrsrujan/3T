"""Portfolio risk analytics: beta, volatility, Sharpe, sector concentration."""
from __future__ import annotations

import logging
import math
from datetime import date, timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

RISK_FREE_RATE_US = 0.05   # 5% annualised
RISK_FREE_RATE_IN = 0.07   # 7% annualised
TRADING_DAYS = 252


def get_portfolio_risk(db: Session) -> dict:
    """Compute portfolio-level risk metrics from open holdings + daily_metrics."""
    today = date.today().isoformat()
    lookback = (date.today() - timedelta(days=365)).isoformat()

    # ── Open holdings ────────────────────────────────────────────────────────
    holdings = db.execute(
        text(
            """
            SELECT h.quantity, h.buy_price, s.symbol, s.market, s.sector,
                   COALESCE(dm.close, h.buy_price) AS cur_price
            FROM holdings h
            JOIN symbols s ON s.symbol_id = h.symbol_id
            LEFT JOIN daily_metrics dm
                ON dm.symbol_id = s.symbol_id
                AND dm.trade_date = (
                    SELECT MAX(trade_date) FROM daily_metrics WHERE symbol_id = s.symbol_id
                )
            WHERE h.is_closed = 0
            """
        )
    ).all()

    if not holdings:
        return _empty_risk()

    total_value = sum(r.quantity * r.cur_price for r in holdings)
    if total_value <= 0:
        return _empty_risk()

    # ── Sector concentration ──────────────────────────────────────────────────
    sector_values: dict[str, float] = {}
    for r in holdings:
        label = r.sector or "Unknown"
        sector_values[label] = sector_values.get(label, 0) + r.quantity * r.cur_price

    sector_weights = [
        {"sector": k, "value": round(v, 2), "weight_pct": round(v / total_value * 100, 1)}
        for k, v in sorted(sector_values.items(), key=lambda x: -x[1])
    ]

    # ── Per-symbol daily returns from daily_metrics ───────────────────────────
    symbol_list = list({r.symbol for r in holdings})
    rows = db.execute(
        text(
            """
            SELECT s.symbol, dm.trade_date, dm.pct_change
            FROM daily_metrics dm
            JOIN symbols s ON s.symbol_id = dm.symbol_id
            WHERE s.symbol IN :syms
              AND dm.trade_date >= :lookback
              AND dm.pct_change IS NOT NULL
            ORDER BY dm.trade_date
            """
        ).bindparams(
            **{"syms": symbol_list}  # SQLAlchemy expanding bind handled separately
        ),
    ).all()
    # Use raw SQL with expanding bind
    from sqlalchemy import bindparam
    rows = db.execute(
        text(
            "SELECT s.symbol, dm.trade_date, dm.pct_change "
            "FROM daily_metrics dm "
            "JOIN symbols s ON s.symbol_id = dm.symbol_id "
            "WHERE s.symbol IN :syms AND dm.trade_date >= :lookback AND dm.pct_change IS NOT NULL "
            "ORDER BY dm.trade_date"
        ).bindparams(bindparam("syms", expanding=True)),
        {"syms": symbol_list, "lookback": lookback},
    ).all()

    # Build {symbol: [(date, pct_change), ...]}
    sym_returns: dict[str, list[float]] = {s: [] for s in symbol_list}
    all_dates: set[str] = set()
    for r in rows:
        sym_returns[r.symbol].append((r.trade_date, r.pct_change / 100))
        all_dates.add(r.trade_date)

    # ── Portfolio daily returns (value-weighted) ───────────────────────────────
    # Build {date: weighted_return}
    sym_weight: dict[str, float] = {}
    for r in holdings:
        sym_weight[r.symbol] = sym_weight.get(r.symbol, 0) + r.quantity * r.cur_price / total_value

    daily_returns_list: list[float] = []
    if all_dates:
        date_ret: dict[str, float] = {}
        for sym, ret_list in sym_returns.items():
            w = sym_weight.get(sym, 0)
            for dt, ret in ret_list:
                date_ret[dt] = date_ret.get(dt, 0) + w * ret

        daily_returns_list = [v for _, v in sorted(date_ret.items())]

    # ── Annualised return + volatility ─────────────────────────────────────────
    if len(daily_returns_list) >= 20:
        mean_daily = sum(daily_returns_list) / len(daily_returns_list)
        variance = sum((r - mean_daily) ** 2 for r in daily_returns_list) / (len(daily_returns_list) - 1)
        daily_vol = math.sqrt(variance)
        ann_vol = daily_vol * math.sqrt(TRADING_DAYS)
        ann_return = mean_daily * TRADING_DAYS

        # Sharpe (assume majority is US market — use US rf rate; could mix)
        rf = RISK_FREE_RATE_US
        sharpe = (ann_return - rf) / ann_vol if ann_vol > 0 else None
    else:
        ann_vol = None
        ann_return = None
        sharpe = None

    # ── Beta vs each market's index ────────────────────────────────────────────
    # We use portfolio returns vs market average returns as a proxy for beta
    # (true beta requires index daily returns which we don't store for ^GSPC/^NSEI)
    # Instead compute weighted average of each symbol's correlation with the
    # market cohort (all stocks in same market same dates).
    portfolio_beta = _compute_portfolio_beta(db, holdings, sym_weight, sym_returns, lookback)

    return {
        "total_value": round(total_value, 2),
        "position_count": len(holdings),
        "sector_weights": sector_weights,
        "annualised_volatility_pct": round(ann_vol * 100, 1) if ann_vol is not None else None,
        "annualised_return_pct": round(ann_return * 100, 1) if ann_return is not None else None,
        "sharpe_ratio": round(sharpe, 2) if sharpe is not None else None,
        "portfolio_beta": round(portfolio_beta, 2) if portfolio_beta is not None else None,
        "data_days": len(daily_returns_list),
    }


def _compute_portfolio_beta(db, holdings, sym_weight, sym_returns, lookback) -> float | None:
    """Estimate portfolio beta by regressing portfolio daily returns against
    the equal-weighted market return of all stocks in the dominant market."""
    # Determine dominant market
    market_values: dict[str, float] = {}
    for r in holdings:
        market_values[r.market] = market_values.get(r.market, 0) + r.quantity * r.cur_price
    if not market_values:
        return None
    dominant_market = max(market_values, key=lambda k: market_values[k])

    # Fetch market-level average daily returns for the dominant market
    rows = db.execute(
        text(
            "SELECT dm.trade_date, AVG(dm.pct_change / 100.0) AS avg_ret "
            "FROM daily_metrics dm "
            "WHERE dm.market = :market AND dm.trade_date >= :lookback AND dm.pct_change IS NOT NULL "
            "GROUP BY dm.trade_date ORDER BY dm.trade_date"
        ),
        {"market": dominant_market, "lookback": lookback},
    ).all()

    market_ret: dict[str, float] = {r.trade_date: r.avg_ret for r in rows}

    # Build aligned portfolio vs market daily return pairs
    # Portfolio daily returns from sym_weight + sym_returns
    date_port_ret: dict[str, float] = {}
    for sym, ret_list in sym_returns.items():
        w = sym_weight.get(sym, 0)
        for dt, ret in ret_list:
            date_port_ret[dt] = date_port_ret.get(dt, 0) + w * ret

    common_dates = sorted(set(date_port_ret) & set(market_ret))
    if len(common_dates) < 30:
        return None

    port_vals = [date_port_ret[d] for d in common_dates]
    mkt_vals = [market_ret[d] for d in common_dates]

    cov = _cov(port_vals, mkt_vals)
    var_mkt = _var(mkt_vals)
    if var_mkt == 0:
        return None
    return cov / var_mkt


def _cov(xs: list[float], ys: list[float]) -> float:
    n = len(xs)
    if n < 2:
        return 0
    mx = sum(xs) / n
    my = sum(ys) / n
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (n - 1)


def _var(xs: list[float]) -> float:
    n = len(xs)
    if n < 2:
        return 0
    m = sum(xs) / n
    return sum((x - m) ** 2 for x in xs) / (n - 1)


def _empty_risk() -> dict:
    return {
        "total_value": 0,
        "position_count": 0,
        "sector_weights": [],
        "annualised_volatility_pct": None,
        "annualised_return_pct": None,
        "sharpe_ratio": None,
        "portfolio_beta": None,
        "data_days": 0,
    }
