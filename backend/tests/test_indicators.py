from datetime import date, timedelta

import pandas as pd
import pytest

from app.services.indicators import add_technical_indicators, compute_bollinger, compute_macd, compute_rsi


def _dates(n: int, start: date = date(2026, 1, 1)) -> list[date]:
    return [start + timedelta(days=i) for i in range(n)]


def test_rsi_all_gains_approaches_100():
    close = pd.Series([float(i) for i in range(1, 21)])  # strictly increasing
    rsi = compute_rsi(close, window=14)
    assert rsi.iloc[-1] == pytest.approx(100.0)


def test_rsi_all_losses_approaches_0():
    close = pd.Series([float(i) for i in range(20, 0, -1)])  # strictly decreasing
    rsi = compute_rsi(close, window=14)
    assert rsi.iloc[-1] == pytest.approx(0.0)


def test_rsi_flat_series_is_neutral_50():
    close = pd.Series([100.0] * 20)
    rsi = compute_rsi(close, window=14)
    assert rsi.iloc[-1] == pytest.approx(50.0)


def test_rsi_nan_before_lookback_window():
    close = pd.Series([float(i) for i in range(1, 11)])  # only 10 points, window=14
    rsi = compute_rsi(close, window=14)
    assert rsi.isna().all()


def test_macd_line_is_difference_of_emas():
    close = pd.Series([float(i) for i in range(1, 61)])
    macd_line, macd_signal, macd_hist = compute_macd(close)
    expected_line = close.ewm(span=12, adjust=False).mean() - close.ewm(span=26, adjust=False).mean()
    pd.testing.assert_series_equal(macd_line, expected_line, check_names=False)
    assert ((macd_hist - (macd_line - macd_signal)).abs() < 1e-9).all()


def test_bollinger_bands_collapse_to_mean_on_zero_variance():
    close = pd.Series([100.0] * 25)
    mid, upper, lower = compute_bollinger(close, window=20, num_std=2.0)
    assert mid.iloc[-1] == pytest.approx(100.0)
    assert upper.iloc[-1] == pytest.approx(100.0)
    assert lower.iloc[-1] == pytest.approx(100.0)


def test_bollinger_nan_before_lookback_window():
    close = pd.Series([100.0] * 10)
    mid, _upper, _lower = compute_bollinger(close, window=20)
    assert mid.isna().all()


def test_add_technical_indicators_does_not_leak_across_symbols():
    dates = _dates(30)
    df = pd.DataFrame(
        {
            "symbol": ["AAA"] * 30 + ["BBB"] * 30,
            "trade_date": dates + dates,
            "close": [float(i) for i in range(1, 31)] + [1000.0] * 30,  # BBB is flat
            "volume": [100] * 60,
        }
    )
    out = add_technical_indicators(df)

    bbb_last_rsi = out[out["symbol"] == "BBB"].iloc[-1]["rsi_14"]
    assert bbb_last_rsi == pytest.approx(50.0)  # BBB unaffected by AAA's uptrend

    aaa_last_sma20 = out[out["symbol"] == "AAA"].iloc[-1]["sma_20"]
    assert aaa_last_sma20 == pytest.approx(sum(range(11, 31)) / 20)


def test_return_windows_are_trailing_pct_change():
    close = [100.0, 102.0, 104.0, 103.0, 108.0, 110.0]
    df = pd.DataFrame(
        {"symbol": ["ZZZ"] * 6, "trade_date": _dates(6), "close": close, "volume": [1] * 6}
    )
    out = add_technical_indicators(df)
    assert out.iloc[5]["return_5d"] == pytest.approx((110.0 - 100.0) / 100.0)
