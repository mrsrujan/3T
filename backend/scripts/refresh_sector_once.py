"""CLI: python scripts/refresh_sector_once.py - backfill sector/industry data immediately."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionLocal
from app.services.sector_service import refresh_sector_data


def main() -> None:
    db = SessionLocal()
    try:
        summary = refresh_sector_data(db)
        print(f"Sector refresh: {summary}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
