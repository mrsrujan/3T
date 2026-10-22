from datetime import date, timedelta

import pandas as pd
import pytest

from app.services.computation import compute_derived_metrics


def _dates(n: int, start: date = date(2026, 1, 1)) -> list[date]:
    return [start + timedelta(days=i) for i in range(n)]


def test_pct_change_computed_via_shift_when_prev_close_missing():
    df = pd.DataFrame(
        {
            "symbol": ["AAA"] * 3,
            "trade_date": _dates(3),
            "open": [10, 11, 12],
            "high": [10, 11, 12],
            "low": [10, 11, 12],
            "close": [10.0, 11.0, 9.9],
            "volume": [100, 200, 300],
        }
    )
    out = compute_derived_metrics(df)

    assert pd.isna(out.loc[0, "prev_close"])  # no prior row to shift from
    assert out.loc[1, "prev_close"] == 10.0
    assert out.loc[1, "pct_change"] == pytest.approx(10.0)
    assert out.loc[2, "prev_close"] == 11.0
    assert out.loc[2, "pct_change"] == pytest.approx((9.9 - 11.0) / 11.0 * 100)


def test_given_prev_close_is_preserved_not_overwritten():
    df = pd.DataFrame(
        {
            "symbol": ["BBB"] * 2,
            "trade_date": _dates(2),
            "open": [10, 11],
            "high": [10, 11],
            "low": [10, 11],
            "close": [10.0, 11.0],
            "volume": [100, 200],
            "prev_close": [9.5, 10.0],  # e.g. NSE-provided authoritative prev close
        }
    )
    out = compute_derived_metrics(df)

    # Day 0's given prev_close (9.5) must be kept even though shift(1) would be NaN.
    assert out.loc[0, "prev_close"] == 9.5
    assert out.loc[0, "pct_change"] == pytest.approx((10.0 - 9.5) / 9.5 * 100)


def test_avg_volume_20d_excludes_current_day():
    volumes = [100] * 5
    df = pd.DataFrame(
        {
            "symbol": ["CCC"] * 5,
            "trade_date": _dates(5),
            "open": [1] * 5,
            "high": [1] * 5,
            "low": [1] * 5,
            "close": [1.0] * 5,
            "volume": volumes,
        }
    )
    out = compute_derived_metrics(df)

    assert pd.isna(out.loc[0, "avg_volume_20d"])  # nothing to average on day 0
    assert out.loc[1, "avg_volume_20d"] == pytest.approx(100.0)
    assert out.loc[4, "avg_volume_20d"] == pytest.approx(100.0)


def test_rel_volume_is_spike_ratio():
    df = pd.DataFrame(
        {
            "symbol": ["DDD"] * 4,
            "trade_date": _dates(4),
            "open": [1] * 4,
            "high": [1] * 4,
            "low": [1] * 4,
            "close": [1.0] * 4,
            "volume": [100, 100, 100, 500],  # spike on the last day
        }
    )
    out = compute_derived_metrics(df)

    assert out.loc[3, "avg_volume_20d"] == pytest.approx(100.0)
    assert out.loc[3, "rel_volume"] == pytest.approx(5.0)


def test_rel_volume_is_null_when_baseline_is_zero_or_missing():
    df = pd.DataFrame(
        {
            "symbol": ["EEE"] * 2,
            "trade_date": _dates(2),
            "open": [1, 1],
            "high": [1, 1],
            "low": [1, 1],
            "close": [1.0, 1.0],
            "volume": [0, 50],
        }
    )
    out = compute_derived_metrics(df)

    assert pd.isna(out.loc[0, "rel_volume"])  # no baseline at all on day 0
    assert out.loc[1, "avg_volume_20d"] == pytest.approx(0.0)
    assert pd.isna(out.loc[1, "rel_volume"])  # baseline is zero -> undefined ratio


def test_symbols_are_computed_independently():
    df = pd.DataFrame(
        {
            "symbol": ["AAA", "AAA", "BBB", "BBB"],
            "trade_date": _dates(2) + _dates(2),
            "open": [1, 1, 1, 1],
            "high": [1, 1, 1, 1],
            "low": [1, 1, 1, 1],
            "close": [10.0, 12.0, 20.0, 19.0],
            "volume": [100, 150, 200, 250],
        }
    )
    out = compute_derived_metrics(df)
    day2 = _dates(2)[1]

    aaa_day2 = out[(out["symbol"] == "AAA") & (out["trade_date"] == day2)].iloc[0]
    bbb_day2 = out[(out["symbol"] == "BBB") & (out["trade_date"] == day2)].iloc[0]
    assert aaa_day2["prev_close"] == 10.0
    assert bbb_day2["prev_close"] == 20.0


def test_empty_input_returns_empty_output():
    df = pd.DataFrame(columns=["symbol", "trade_date", "open", "high", "low", "close", "volume"])
    out = compute_derived_metrics(df)
    assert out.empty
