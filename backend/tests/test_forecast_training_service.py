from datetime import date, timedelta

import pandas as pd
import pytest

from app.services.forecast_training_service import (
    add_label,
    chronological_split,
    chronological_three_way_split,
)


def _dates(n: int, start: date = date(2026, 1, 1)) -> list[date]:
    return [start + timedelta(days=i) for i in range(n)]


def test_chronological_split_never_leaks_future_dates_into_train():
    dates = _dates(20)
    df = pd.DataFrame(
        {
            "trade_date": dates * 2,
            "symbol_id": [1] * 20 + [2] * 20,
            "value": range(40),
        }
    )
    train_df, holdout_df, cutoff = chronological_split(df, holdout_fraction=0.2)

    assert not train_df.empty and not holdout_df.empty
    assert train_df["trade_date"].max() < cutoff
    assert holdout_df["trade_date"].min() >= cutoff
    assert set(train_df["trade_date"]).isdisjoint(set(holdout_df["trade_date"]))


def test_add_label_shifts_5d_forward_and_drops_last_5_rows_per_symbol():
    # 8 rows for symbol 1, 7 rows for symbol 2
    # label_up = 1 if close[i+5] > close[i]
    dates8 = _dates(8)
    dates7 = _dates(7)
    closes1 = [10.0, 11.0, 12.0, 11.0, 9.0, 8.0, 13.0, 7.0]
    closes2 = [5.0, 4.0, 6.0, 7.0, 8.0, 3.0, 2.0]
    df = pd.DataFrame(
        {
            "symbol_id": [1] * 8 + [2] * 7,
            "trade_date": dates8 + dates7,
            "close": closes1 + closes2,
        }
    )
    out = add_label(df)

    # symbol 1: rows 0-2 keep labels (rows 3-7 are the last 5, dropped)
    sym1 = out[out["symbol_id"] == 1].sort_values("trade_date")
    # row0 label: close[5]=8 > close[0]=10? -> 0
    # row1 label: close[6]=13 > close[1]=11? -> 1
    # row2 label: close[7]=7 > close[2]=12? -> 0
    assert list(sym1["label_up"]) == [0, 1, 0]

    # symbol 2: only row 0-1 keep labels (rows 2-6 dropped)
    sym2 = out[out["symbol_id"] == 2].sort_values("trade_date")
    # row0 label: close[5]=3 > close[0]=5? -> 0
    # row1 label: close[6]=2 > close[1]=4? -> 0
    assert list(sym2["label_up"]) == [0, 0]

    assert len(out) == 5  # (8-5) + (7-5)


def test_chronological_three_way_split_proportions():
    dates = _dates(100)
    df = pd.DataFrame({"trade_date": dates * 2, "symbol_id": [1] * 100 + [2] * 100})
    train_df, calib_df, holdout_df = chronological_three_way_split(df, train_frac=0.70, calib_frac=0.15)

    assert not train_df.empty
    assert not calib_df.empty
    assert not holdout_df.empty
    # No date overlap
    train_dates = set(train_df["trade_date"])
    calib_dates = set(calib_df["trade_date"])
    holdout_dates = set(holdout_df["trade_date"])
    assert train_dates.isdisjoint(calib_dates)
    assert train_dates.isdisjoint(holdout_dates)
    assert calib_dates.isdisjoint(holdout_dates)
    # Chronological ordering
    assert max(train_dates) < min(calib_dates)
    assert max(calib_dates) < min(holdout_dates)
