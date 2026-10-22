"""Technical indicators computed on the fly from close/volume history - RSI,
MACD, Bollinger Bands, moving averages, and trailing volatility/returns.

Unlike computation.py (which persists a few ranking metrics into
daily_metrics at ingest time), nothing here is stored: both the forecast
training dataset builder and the on-demand inference path recompute these
from a pulled slice of daily_metrics, via the same add_technical_indicators
entrypoint, so training and inference can never drift out of sync.

Computing RSI/SMA/MACD "as of day X" from day X's own close is not lookahead
- a trader at day X's close already knows it. The only leakage risk is the
training label (next-day direction), handled separately by
forecast_training_service's chronological split.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

SMA_WINDOWS = (20, 50, 200)
RSI_WINDOW = 14
MACD_FAST, MACD_SLOW, MACD_SIGNAL = 12, 26, 9
BOLLINGER_WINDOW = 20
BOLLINGER_NUM_STD = 2.0
VOLATILITY_WINDOW = 20
RETURN_WINDOWS = (5, 10, 20)


def compute_rsi(close: pd.Series, window: int = RSI_WINDOW) -> pd.Series:
    """Wilder's smoothed RSI. NaN until `window` prior deltas are available.
    Flat runs (no gains or losses) read as neutral (50), not undefined."""
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / window, min_periods=window, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / window, min_periods=window, adjust=False).mean()

    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    rsi = rsi.mask((avg_gain == 0) & (avg_loss == 0), 50.0)
    rsi = rsi.mask((avg_loss == 0) & (avg_gain != 0), 100.0)
    return rsi


def compute_macd(
    close: pd.Series,
    fast: int = MACD_FAST,
    slow: int = MACD_SLOW,
    signal: int = MACD_SIGNAL,
) -> tuple[pd.Series, pd.Series, pd.Series]:
    """Returns (macd_line, signal_line, histogram)."""
    ema_fast = close.ewm(span=fast, adjust=False).mean()
    ema_slow = close.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    macd_signal = macd_line.ewm(span=signal, adjust=False).mean()
    macd_hist = macd_line - macd_signal
    return macd_line, macd_signal, macd_hist


def compute_bollinger(
    close: pd.Series, window: int = BOLLINGER_WINDOW, num_std: float = BOLLINGER_NUM_STD
) -> tuple[pd.Series, pd.Series, pd.Series]:
    """Returns (mid, upper, lower)."""
    mid = close.rolling(window=window, min_periods=window).mean()
    std = close.rolling(window=window, min_periods=window).std()
    upper = mid + num_std * std
    lower = mid - num_std * std
    return mid, upper, lower


def _add_indicators_for_symbol(group: pd.DataFrame) -> pd.DataFrame:
    group = group.copy()
    close = group["close"]

    for window in SMA_WINDOWS:
        group[f"sma_{window}"] = close.rolling(window=window, min_periods=window).mean()
    group["ema_12"] = close.ewm(span=MACD_FAST, adjust=False).mean()
    group["ema_26"] = close.ewm(span=MACD_SLOW, adjust=False).mean()

    group["rsi_14"] = compute_rsi(close)

    macd_line, macd_signal, macd_hist = compute_macd(close)
    group["macd_line"] = macd_line
    group["macd_signal"] = macd_signal
    group["macd_hist"] = macd_hist

    bb_mid, bb_upper, bb_lower = compute_bollinger(close)
    band_width = bb_upper - bb_lower
    group["bb_pct_b"] = ((close - bb_lower) / band_width).replace([np.inf, -np.inf], np.nan)
    group["bb_bandwidth"] = (band_width / bb_mid).replace([np.inf, -np.inf], np.nan)

    daily_return = close.pct_change()
    group["volatility_20d"] = daily_return.rolling(
        window=VOLATILITY_WINDOW, min_periods=VOLATILITY_WINDOW
    ).std()
    for window in RETURN_WINDOWS:
        group[f"return_{window}d"] = close.pct_change(window)

    return group


def add_technical_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Input: a DataFrame with at least [symbol, trade_date, close] columns
    (any row order - sorted internally). Adds, per symbol via a trailing-only
    rolling/EWM window (no future data used):
      sma_20, sma_50, sma_200, ema_12, ema_26,
      rsi_14, macd_line, macd_signal, macd_hist,
      bb_pct_b, bb_bandwidth,
      volatility_20d, return_5d, return_10d, return_20d
    NaN wherever the lookback window isn't yet satisfied - callers rely on
    HistGradientBoostingClassifier's native NaN handling rather than
    dropna/impute.
    """
    if df.empty:
        return df

    out = df.sort_values(["symbol", "trade_date"]).reset_index(drop=True)
    out = out.groupby("symbol", group_keys=False).apply(_add_indicators_for_symbol)
    return out.reset_index(drop=True)
