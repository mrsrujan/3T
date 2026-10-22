"""CLI: python scripts/run_backfill.py [--days N]"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionLocal
from app.services.backfill import backfill_market


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=None)
    args = parser.parse_args()

    db = SessionLocal()
    try:
        print("Backfilling IN...")
        summary = backfill_market(db, "IN", calendar_days=args.days)
        print(f"  {summary}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
