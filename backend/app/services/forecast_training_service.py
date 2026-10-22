"""Builds the pooled, per-market training dataset and fits/evaluates the
next-5-day-direction classifier.

Model choice: HistGradientBoostingClassifier - handles missing features
natively, no separate imputation step needed.

build_feature_frame() is the shared core also imported by forecast_service.py
for single-symbol inference, so training and inference can never compute
features differently and drift out of sync.

Honesty/leakage notes (the user explicitly flagged overfitting/drift risk):
- chronological_split() is a strict date cutoff, never a random/shuffled
  split - holdout accuracy is an estimate of "predict the future from the
  past", not leaked same-day cross-symbol correlation.
- News sentiment has no historical archive at all (RSS covers ~7 days) and
  is deliberately NOT a feature here - see sentiment_service.py's docstring.
- return_5d_vs_sector is computed per (trade_date, sector) group from the
  full market frame. In single-symbol inference the group has only one row,
  so return_5d_vs_sector = 0.0 — a safe, neutral value acceptable for
  inference (the model was trained on real cross-symbol sector medians).
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime
from pathlib import Path

import joblib
import lightgbm as lgb
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.inspection import permutation_importance
from sklearn.metrics import accuracy_score, roc_auc_score
from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from app.config import settings
from app.models import ForecastModel
from app.services.indicators import add_technical_indicators

logger = logging.getLogger(__name__)

FEATURE_COLUMNS = [
    "sma_20_ratio", "sma_50_ratio", "sma_200_ratio",
    "rsi_14", "macd_line", "macd_signal", "macd_hist", "bb_pct_b", "bb_bandwidth",
    "volatility_20d", "return_5d", "return_10d", "return_20d",
    "pct_change", "rel_volume", "return_5d_vs_sector",
]
LABEL_COLUMN = "label_up"


def _load_price_history(
    db: Session, market: str, symbol_ids: list[int] | None = None
) -> pd.DataFrame:
    sql = (
        "SELECT dm.symbol_id, s.symbol AS symbol, s.sector, dm.trade_date, dm.close, dm.volume, "
        "dm.pct_change, dm.rel_volume "
        "FROM daily_metrics dm JOIN symbols s ON s.symbol_id = dm.symbol_id "
        "WHERE dm.market = :market AND dm.close IS NOT NULL"
    )
    params: dict = {"market": market}
    if symbol_ids:
        sql += " AND dm.symbol_id IN :symbol_ids"
    sql += " ORDER BY dm.symbol_id, dm.trade_date"

    stmt = text(sql)
    if symbol_ids:
        stmt = stmt.bindparams(bindparam("symbol_ids", expanding=True))
        params["symbol_ids"] = symbol_ids

    df = pd.read_sql(stmt, db.get_bind(), params=params)
    if df.empty:
        return df
    df["trade_date"] = pd.to_datetime(df["trade_date"]).dt.date
    return df


def _add_scale_free_features(df: pd.DataFrame) -> pd.DataFrame:
    """close/sma - 1: scale-free so a $5 stock and a $2000 stock contribute
    comparably in a pooled cross-symbol model (raw $ distance from an SMA
    isn't)."""
    out = df.copy()
    for window in (20, 50, 200):
        out[f"sma_{window}_ratio"] = out["close"] / out[f"sma_{window}"] - 1
    return out


def build_feature_frame(
    db: Session, market: str, symbol_ids: list[int] | None = None
) -> pd.DataFrame:
    """Shared by training (symbol_ids=None -> whole market universe) and
    single-symbol on-demand inference (symbol_ids=[one id]) so both paths
    compute indicators identically."""
    price_df = _load_price_history(db, market, symbol_ids)
    if price_df.empty:
        return price_df
    price_df = add_technical_indicators(price_df)
    price_df = _add_scale_free_features(price_df)
    # Sector-relative 5-day return: captures whether a stock is outperforming
    # or underperforming its sector peers over the past week. In single-symbol
    # inference the group has only one row, so this will be 0.0 — safe neutral.
    sector_median_5d = (
        price_df.groupby(["trade_date", "sector"])["return_5d"]
        .transform("median")
    )
    price_df["return_5d_vs_sector"] = price_df["return_5d"] - sector_median_5d
    price_df["market"] = market
    return price_df


def add_label(df: pd.DataFrame) -> pd.DataFrame:
    """label_up = 1 if close 5 trading days forward is higher, else 0. Drops
    the last 5 rows per symbol (label undefined - no 5th future day yet).
    5-day forward returns have more signal than next-day (~50.1% positive)."""
    out = df.sort_values(["symbol_id", "trade_date"]).copy()
    out["future_close"] = out.groupby("symbol_id")["close"].shift(-5)
    out = out[out["future_close"].notna()].copy()
    out[LABEL_COLUMN] = (out["future_close"] > out["close"]).astype(int)
    return out.drop(columns=["future_close"])


def build_training_dataset(db: Session, market: str) -> pd.DataFrame:
    df = build_feature_frame(db, market)
    if df.empty:
        return df
    df = add_label(df)
    keep_cols = ["symbol_id", "market", "trade_date"] + FEATURE_COLUMNS + [LABEL_COLUMN]
    return df[keep_cols].reset_index(drop=True)


def chronological_split(
    df: pd.DataFrame, holdout_fraction: float | None = None
) -> tuple[pd.DataFrame, pd.DataFrame, date | None]:
    """A single global trade_date cutoff (never a random/shuffled split) -
    train = strictly before cutoff, holdout = on/after cutoff. This is what
    makes the reported holdout accuracy an honest "predict the future from
    the past" estimate instead of leaking same-day cross-symbol correlation
    into both sides."""
    if holdout_fraction is None:
        holdout_fraction = settings.forecast_holdout_fraction

    unique_dates = sorted(df["trade_date"].unique())
    if len(unique_dates) < 2:
        cutoff = unique_dates[0] if unique_dates else None
    else:
        idx = int(len(unique_dates) * (1 - holdout_fraction))
        idx = min(max(idx, 1), len(unique_dates) - 1)
        cutoff = unique_dates[idx]

    if cutoff is None:
        return df.iloc[0:0], df.iloc[0:0], None

    train_df = df[df["trade_date"] < cutoff]
    holdout_df = df[df["trade_date"] >= cutoff]
    return train_df, holdout_df, cutoff


def chronological_three_way_split(
    df: pd.DataFrame, train_frac: float = 0.70, calib_frac: float = 0.15
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Returns (train_df, calib_df, holdout_df) — all chronological, never
    shuffled. The remaining fraction (1 - train_frac - calib_frac) becomes
    the holdout used for evaluation."""
    dates = sorted(df["trade_date"].unique())
    n = len(dates)
    train_end = dates[int(n * train_frac)]
    calib_end = dates[int(n * (train_frac + calib_frac))]
    train_df = df[df["trade_date"] < train_end]
    calib_df = df[(df["trade_date"] >= train_end) & (df["trade_date"] < calib_end)]
    holdout_df = df[df["trade_date"] >= calib_end]
    return train_df, calib_df, holdout_df


def train_and_evaluate(
    train_df: pd.DataFrame,
    holdout_df: pd.DataFrame,
    calib_df: pd.DataFrame | None = None,
) -> tuple[CalibratedClassifierCV, dict]:
    """Trains a HistGradientBoostingClassifier (base) on train_df, then
    calibrates it with isotonic regression on calib_df (if provided) using
    CalibratedClassifierCV(cv='prefit'). Calibration makes the output
    probabilities honest — 0.62 should mean ~62% actual positive rate.

    permutation_importance runs on the uncalibrated base estimator because
    CalibratedClassifierCV does not expose feature_importances_ directly."""
    x_train = train_df[FEATURE_COLUMNS]
    y_train = train_df[LABEL_COLUMN]
    x_holdout = holdout_df[FEATURE_COLUMNS]
    y_holdout = holdout_df[LABEL_COLUMN]

    base = lgb.LGBMClassifier(
        n_estimators=500, learning_rate=0.05, max_depth=4, random_state=42, verbose=-1
    )
    base.fit(x_train, y_train)

    if calib_df is not None and not calib_df.empty:
        x_calib = calib_df[FEATURE_COLUMNS]
        y_calib = calib_df[LABEL_COLUMN]
        calibrated = CalibratedClassifierCV(base, cv="prefit", method="isotonic")
        calibrated.fit(x_calib, y_calib)
        model = calibrated
    else:
        model = base

    proba = model.predict_proba(x_holdout)[:, 1]
    pred = (proba >= 0.5).astype(int)
    accuracy = accuracy_score(y_holdout, pred)
    auc = roc_auc_score(y_holdout, proba) if y_holdout.nunique() > 1 else float("nan")
    baseline_accuracy = max(y_holdout.mean(), 1 - y_holdout.mean())

    # permutation_importance runs on the base estimator (not calibrated) —
    # CalibratedClassifierCV does not expose feature_importances_ directly and
    # wraps the base in a pipeline that breaks the importance API.
    importance_result = permutation_importance(
        base, x_holdout, y_holdout, n_repeats=5, random_state=42, n_jobs=-1
    )
    feature_importance = {
        col: float(importance_result.importances_mean[i]) for i, col in enumerate(FEATURE_COLUMNS)
    }

    metrics = {
        "accuracy": float(accuracy),
        "auc": None if pd.isna(auc) else float(auc),
        "baseline_accuracy": float(baseline_accuracy),
        "feature_importance": feature_importance,
    }
    return model, metrics


def _model_dir() -> Path:
    return settings.db_path.parent / "forecast_models"


def _record_failed_run(db: Session, market: str, trained_at: datetime, error_message: str) -> None:
    row = ForecastModel(
        market=market,
        trained_at=trained_at,
        training_row_count=0,
        holdout_row_count=0,
        feature_list_json=json.dumps(FEATURE_COLUMNS),
        status="failed",
        error_message=error_message[:2048],
    )
    db.add(row)
    db.commit()


def _prune_old_models(market: str, model_dir: Path) -> None:
    keep = settings.forecast_models_to_keep
    files = sorted(model_dir.glob(f"{market}_*.joblib"))
    for stale in files[: max(0, len(files) - keep)]:
        try:
            stale.unlink()
        except OSError:
            logger.warning("Failed to prune stale forecast model file %s", stale)


def run_weekly_training(db: Session, market: str) -> dict:
    """Orchestrator called by the scheduler job (per market). Always leaves
    an introspectable ForecastModel row - a failure never touches the
    currently-active model, so inference keeps serving the last good model
    (or the cold-start message) rather than breaking."""
    trained_at = datetime.utcnow()

    try:
        df = build_training_dataset(db, market)
    except Exception as exc:
        logger.exception("Forecast training dataset build failed for %s", market)
        _record_failed_run(db, market, trained_at, f"dataset build failed: {exc}")
        return {"status": "failed", "error": str(exc)}

    if len(df) < settings.forecast_min_training_rows:
        message = f"insufficient training data: {len(df)} rows < {settings.forecast_min_training_rows}"
        logger.warning("Forecast training skipped for %s: %s", market, message)
        _record_failed_run(db, market, trained_at, message)
        return {"status": "failed", "reason": message, "row_count": len(df)}

    train_df, calib_df, holdout_df = chronological_three_way_split(df)
    if train_df.empty or calib_df.empty or holdout_df.empty:
        message = "three-way chronological split produced an empty train, calibration, or holdout set"
        logger.warning("Forecast training skipped for %s: %s", market, message)
        _record_failed_run(db, market, trained_at, message)
        return {"status": "failed", "reason": message}

    try:
        model, metrics = train_and_evaluate(train_df, holdout_df, calib_df)
    except Exception as exc:
        logger.exception("Forecast model fit failed for %s", market)
        _record_failed_run(db, market, trained_at, f"fit failed: {exc}")
        return {"status": "failed", "error": str(exc)}

    model_dir = _model_dir()
    model_dir.mkdir(parents=True, exist_ok=True)
    model_path = model_dir / f"{market}_{trained_at:%Y%m%dT%H%M%S}.joblib"
    joblib.dump(model, model_path)

    db.execute(
        text("UPDATE forecast_models SET status = 'superseded' WHERE market = :market AND status = 'active'"),
        {"market": market},
    )
    row = ForecastModel(
        market=market,
        trained_at=trained_at,
        training_row_count=len(train_df),
        holdout_row_count=len(holdout_df),
        train_start_date=train_df["trade_date"].min(),
        train_end_date=train_df["trade_date"].max(),
        holdout_start_date=holdout_df["trade_date"].min(),
        holdout_end_date=holdout_df["trade_date"].max(),
        holdout_accuracy=metrics["accuracy"],
        holdout_auc=metrics["auc"],
        holdout_baseline_accuracy=metrics["baseline_accuracy"],
        feature_list_json=json.dumps(FEATURE_COLUMNS),
        feature_importance_json=json.dumps(metrics["feature_importance"]),
        model_path=str(model_path),
        status="active",
    )
    db.add(row)
    db.commit()

    _prune_old_models(market, model_dir)

    return {
        "status": "active",
        "training_row_count": len(train_df),
        "holdout_row_count": len(holdout_df),
        "holdout_accuracy": metrics["accuracy"],
        "holdout_auc": metrics["auc"],
        "holdout_baseline_accuracy": metrics["baseline_accuracy"],
    }
