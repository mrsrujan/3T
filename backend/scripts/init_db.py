"""Create all tables in the SQLite database (idempotent)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import models  # noqa: F401  (ensures models are registered on Base)
from app.db import Base, engine


def main() -> None:
    Base.metadata.create_all(bind=engine)
    print(f"Tables created: {sorted(Base.metadata.tables.keys())}")


if __name__ == "__main__":
    main()
