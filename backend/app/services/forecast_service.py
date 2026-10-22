"""On-demand forecast inference for a single symbol: loads the active
per-market model (trained by forecast_training_service's weekly job),
computes that symbol's latest feature row via the SAME build_feature_frame
helper training uses (guaranteeing parity), predicts next-day direction, and
derives a separate volatility-based price-range projection.

Caching: NOT live_quote_service's 20s TTL - forecast inputs are derived from
daily_metrics, which physically cannot change until the next session's
close. CACHE_TTL_SECONDS defaults to 30 minutes, matching news_service's own
cache window - the one input (sentiment) that does change within a day.
"""

from __future__ import annotations

import json
import logging
import math
import time

import joblib
import numpy as np
import pandas as pd
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.models import ForecastModel
from app.services.forecast_training_service import FEATURE_COLUMNS, build_feature_frame
from app.services.sentiment_service import get_live_sentiment
from app.services.stock_detail_service import get_symbol_row

logger = logging.getLogger(__name__)

PRICE_RANGE_HORIZONS = (5, 10, 20)
PRICE_RANGE_Z = 1.28  # ~80% interval under a random-walk/lognormal approximation
RECENT_CLOSES_LOOKBACK_DAYS = 60
TOP_K_FACTORS = 5

_forecast_cache: dict[tuple[str, str], tuple[float, dict]] = {}
_model_cache: dict[str, tuple[int, object]] = {}

_FACTOR_LABELS = {
    "rsi_14": lambda v: f"RSI(14) at {v:.0f} — {'overbought' if v >= 70 else 'oversold' if v <= 30 else 'neutral'}",
    "macd_hist": lambda v: f"MACD histogram {'positive' if v > 0 else 'negative'} ({v:.2f})",
    "sma_50_ratio": lambda v: f"Price {'above' if v > 0 else 'below'} 50-day average ({v * 100:+.1f}%)",
    "sma_200_ratio": lambda v: f"Price {'above' if v > 0 else 'below'} 200-day average ({v * 100:+.1f}%)",
    "rel_volume": lambda v: f"Relative volume at {v:.2f}x the 20-day average",
    "bb_pct_b": lambda v: f"Bollinger %B at {v:.2f} — {'near upper band' if v >= 0.8 else 'near lower band' if v <= 0.2 else 'mid-band'}",
    "volatility_20d": lambda v: f"20-day volatility at {v * 100:.1f}% daily",
    "return_20d": lambda v: f"20-day return {v * 100:+.1f}%",
}

_FACTOR_DIRECTION = {
    "rsi_14": lambda v: "bearish" if v >= 70 else "bullish" if v <= 30 else "neutral",
    "macd_hist": lambda v: "bullish" if v > 0 else "bearish",
    "sma_50_ratio": lambda v: "bullish" if v > 0 else "bearish",
    "sma_200_ratio": lambda v: "bullish" if v > 0 else "bearish",
    "rel_volume": lambda v: "neutral",
    "bb_pct_b": lambda v: "bearish" if v >= 0.8 else "bullish" if v <= 0.2 else "neutral",
    "volatility_20d": lambda v: "neutral",
    "return_20d": lambda v: "bullish" if v > 0 else "bearish",
}


def _load_active_model(db: Session, market: str) -> tuple[object, dict] | None:
    row = (
        db.query(ForecastModel)
        .filter(ForecastModel.market == market, ForecastModel.status == "active")
        .order_by(ForecastModel.trained_at.desc())
        .first()
    )
    if row is None:
        return None

    cached = _model_cache.get(market)
    if cached and cached[0] == row.model_id:
        model = cached[1]
    else:
        model = joblib.load(row.model_path)
        _model_cache[market] = (row.model_id, model)

    info = {
        "model_id": row.model_id,
        "trained_at": row.trained_at,
        "training_row_count": row.training_row_count,
        "holdout_accuracy": row.holdout_accuracy,
        "holdout_auc": row.holdout_auc,
        "holdout_baseline_accuracy": row.holdout_baseline_accuracy,
        "feature_list": json.loads(row.feature_list_json) if row.feature_list_json else FEATURE_COLUMNS,
        "feature_importance": json.loads(row.feature_importance_json) if row.feature_importance_json else {},
    }
    return model, info


def get_symbol_features(
    db: Session, market: str, symbol_id: int, feature_list: list[str]
) -> pd.Series | None:
    """Latest feature row for one symbol, computed via the same
    build_feature_frame training uses - guarantees training/inference
    column parity. None = no price history for this symbol at all."""
    df = build_feature_frame(db, market, symbol_ids=[symbol_id])
    if df.empty:
        return None
    return df.sort_values("trade_date").iloc[-1]


def _recent_closes(db: Session, symbol_id: int, days: int = RECENT_CLOSES_LOOKBACK_DAYS) -> pd.Series:
    rows = db.execute(
        text(
            "SELECT trade_date, close FROM daily_metrics "
            "WHERE symbol_id = :symbol_id AND close IS NOT NULL "
            "ORDER BY trade_date DESC LIMIT :days"
        ),
        {"symbol_id": symbol_id, "days": days},
    ).all()
    rows = list(reversed(rows))
    return pd.Series([r.close for r in rows], index=[r.trade_date for r in rows], dtype=float)


def compute_price_range_band(
    closes: pd.Series, horizons: tuple[int, ...] = PRICE_RANGE_HORIZONS
) -> list[dict]:
    """A separate statistical projection, NOT the model's output - the
    classifier predicts direction only. Zero drift is assumed (band width
    comes from realized volatility alone, not recent trend), so this never
    overclaims trend-following predictive power the model isn't providing.
    ~80% interval under a random-walk/lognormal approximation - a labeled
    simplification, not a guarantee."""
    if len(closes) < 2:
        return []

    current_price = float(closes.iloc[-1])
    log_returns = np.log(closes / closes.shift(1)).dropna()
    if log_returns.empty:
        return []

    daily_vol = float(log_returns.tail(20).std())
    if math.isnan(daily_vol):
        daily_vol = float(log_returns.std())
    if math.isnan(daily_vol) or daily_vol == 0:
        return [
            {"horizon_days": h, "low": current_price, "mid": current_price, "high": current_price}
            for h in horizons
        ]

    band = []
    for h in horizons:
        spread = PRICE_RANGE_Z * daily_vol * math.sqrt(h)
        band.append(
            {
                "horizon_days": h,
                "low": round(current_price * math.exp(-spread), 2),
                "mid": current_price,
                "high": round(current_price * math.exp(spread), 2),
            }
        )
    return band


def bucket_direction(prob_up: float) -> tuple[str, float]:
    """Dead zone around 0.50 (not a bare >0.5/<0.5 split) so a near-coin-flip
    51% isn't labeled "bullish" - matches the reality that markets sit near
    50-55% baseline directional accuracy."""
    if prob_up >= 0.55:
        direction = "bullish"
    elif prob_up <= 0.45:
        direction = "bearish"
    else:
        direction = "neutral"
    confidence_pct = max(prob_up, 1 - prob_up) * 100
    return direction, confidence_pct


def build_contributing_factors(
    feature_row: pd.Series, feature_importance: dict, sentiment: dict
) -> list[dict]:
    """Top-K globally-important features (from the model's holdout-computed
    permutation importance) whose value for THIS symbol is human-readable,
    tagged source="model". Sentiment is appended as a SEPARATE entry tagged
    source="sentiment" - kept structurally distinct so the UI never implies
    sentiment was learned by the model (it wasn't, in v1)."""
    ranked = sorted(feature_importance.items(), key=lambda kv: kv[1], reverse=True)
    factors: list[dict] = []
    for feature_name, _importance in ranked:
        labeler = _FACTOR_LABELS.get(feature_name)
        if labeler is None:
            continue
        value = feature_row.get(feature_name)
        if value is None or (isinstance(value, float) and math.isnan(value)):
            continue
        factors.append(
            {
                "label": labeler(value),
                "direction": _FACTOR_DIRECTION[feature_name](value),
                "source": "model",
            }
        )
        if len(factors) >= TOP_K_FACTORS:
            break

    if sentiment.get("article_count", 0) > 0:
        score = sentiment["sentiment_score"]
        sentiment_direction = "bullish" if score > 0.15 else "bearish" if score < -0.15 else "neutral"
        factors.append(
            {
                "label": (
                    f"Recent news sentiment: {sentiment_direction} "
                    f"({sentiment['positive_hits']} positive / {sentiment['negative_hits']} negative mentions)"
                ),
                "direction": sentiment_direction,
                "source": "sentiment",
            }
        )

    return factors


def _build_forecast(db: Session, market: str, symbol: str, sym: dict) -> dict:
    loaded = _load_active_model(db, market)
    if loaded is None:
        return {
            "market": market,
            "symbol": symbol,
            "status": "cold_start",
            "message": (
                "No forecast model has been trained for this market yet. "
                "Check back after the next weekly training run."
            ),
        }
    model, model_info = loaded

    feature_row = get_symbol_features(db, market, sym["symbol_id"], model_info["feature_list"])
    if feature_row is None:
        return {
            "market": market,
            "symbol": symbol,
            "status": "insufficient_history",
            "message": "Not enough price history for this symbol yet to compute a forecast.",
        }

    x = feature_row.reindex(model_info["feature_list"]).to_frame().T.astype(float)
    x.columns = model_info["feature_list"]
    prob_up = float(model.predict_proba(x)[:, 1][0])
    direction, confidence_pct = bucket_direction(prob_up)

    closes = _recent_closes(db, sym["symbol_id"])
    price_range = compute_price_range_band(closes)

    sentiment = get_live_sentiment(market, symbol, sym["name"])
    factors = build_contributing_factors(feature_row, model_info["feature_importance"], sentiment)

    return {
        "market": market,
        "symbol": symbol,
        "status": "ok",
        "as_of": feature_row["trade_date"],
        "direction": direction,
        "confidence_pct": confidence_pct,
        "probability_up": prob_up,
        "price_range": price_range,
        "factors": factors,
        "model_info": {
            "market": market,
            "trained_at": model_info["trained_at"],
            "training_row_count": model_info["training_row_count"],
            "holdout_accuracy": model_info["holdout_accuracy"],
            "holdout_auc": model_info["holdout_auc"],
            "holdout_baseline_accuracy": model_info["holdout_baseline_accuracy"],
        },
    }


def get_stock_forecast(db: Session, market: str, symbol: str) -> dict | None:
    """None -> unknown symbol (router raises 404, matching get_stock_detail's
    convention). Otherwise always returns a dict with status in
    {"ok","cold_start","insufficient_history"} - never raises for "no model
    yet"/"not enough symbol history", so those are testable response states,
    not 500s."""
    sym = get_symbol_row(db, market, symbol)
    if sym is None:
        return None

    cache_key = (market, symbol)
    cached = _forecast_cache.get(cache_key)
    if cached and (time.time() - cached[0]) < settings.forecast_cache_ttl_seconds:
        return cached[1]

    result = _build_forecast(db, market, symbol, sym)
    # Only cache "ok" results. Caching a transient cold_start/
    # insufficient_history response for the full TTL would keep serving it
    # long after the condition clears - e.g. a request made while the
    # startup bootstrap training task is still running would otherwise lock
    # in "cold_start" for 30 minutes even after a model becomes active.
    if result["status"] == "ok":
        _forecast_cache[cache_key] = (time.time(), result)
    return result
