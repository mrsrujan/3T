"""One-shot cleanup: delete all US-market rows from the DB.

Idempotent — safe to run multiple times. Does not touch IN rows.

Usage:
    python scripts/cleanup_us_data.py              # dry-run (shows counts, no deletes)
    python scripts/cleanup_us_data.py --execute    # actually delete
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text

from app.db import SessionLocal


# Order matters: delete child rows before parent symbols (FK references).
TABLES_WITH_MARKET = [
    ("alert_triggers", "market = 'US'"),
    ("alert_rules",    "market = 'US'"),
    ("holdings",       "market = 'US'"),
    ("watchlist",      "symbol_id IN (SELECT symbol_id FROM symbols WHERE market = 'US')"),
    ("daily_metrics",  "market = 'US'"),
    ("forecast_models","market = 'US'"),
    ("refresh_log",    "market = 'US'"),
    ("trading_calendar","market = 'US'"),
    ("symbols",        "market = 'US'"),
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true", help="Actually delete (otherwise dry-run)")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        total = 0
        for table, where in TABLES_WITH_MARKET:
            count = db.execute(text(f"SELECT COUNT(*) FROM {table} WHERE {where}")).scalar() or 0
            total += count
            print(f"  {table}: {count} rows")

        if total == 0:
            print("\nNo US rows found; database is already clean.")
            return

        if not args.execute:
            print(f"\nDry-run: {total} rows would be deleted. Re-run with --execute to apply.")
            return

        for table, where in TABLES_WITH_MARKET:
            result = db.execute(text(f"DELETE FROM {table} WHERE {where}"))
            print(f"  deleted {result.rowcount} from {table}")
        db.commit()
        print(f"\nDone. Deleted {total} rows total.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
