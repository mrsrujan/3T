"""Smoke test: fetch a real recent trading date and a weekend date."""

import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.india_fetch import NSESession


def main() -> None:
    session = NSESession()

    # Find the most recent trading day by walking back from yesterday.
    d = date.today() - timedelta(days=1)
    df = None
    for _ in range(10):
        df = session.fetch_bhavcopy(d)
        if df is not None:
            break
        d -= timedelta(days=1)

    if df is None:
        print("FAILED: could not find any recent trading day with data")
        sys.exit(1)

    print(f"Trading day {d}: {len(df)} EQ rows")
    print(df.head(5).to_string(index=False))
    assert len(df) > 500, f"expected >500 EQ symbols, got {len(df)}"

    # NSE occasionally runs special sessions on weekends, so a plain Sunday
    # isn't a reliable "no data" case. A date long before NSE's archive
    # coverage begins is a safe way to exercise the 404 -> None path.
    ancient_date = date(1995, 1, 2)
    no_data_df = session.fetch_bhavcopy(ancient_date)
    print(f"Ancient date {ancient_date}: {'None (expected)' if no_data_df is None else 'UNEXPECTED DATA'}")
    assert no_data_df is None, "expected a pre-archive date to return None"

    print("OK")


if __name__ == "__main__":
    main()
