from datetime import date

from sqlalchemy import create_engine, event
from sqlalchemy.dialects.postgresql import insert as _pg_insert
from sqlalchemy.dialects.sqlite import insert as _sqlite_insert
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

_is_sqlite = settings.database_url.startswith("sqlite")

engine = create_engine(
    settings.database_url,
    # check_same_thread is a SQLite-only kwarg; passing it to psycopg errors out.
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    pool_pre_ping=not _is_sqlite,
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record) -> None:
    # Default rollback-journal mode blocks ALL readers while a writer's
    # transaction is open - fatal here since a refresh job's write transaction
    # can run for minutes while the UI polls /api/refresh/status. WAL lets
    # readers proceed concurrently with a writer; busy_timeout retries instead
    # of immediately raising "database is locked" for the remaining edge cases
    # (e.g. two writers). Postgres has MVCC natively and ignores both.
    if engine.dialect.name != "sqlite":
        return
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def dialect_insert():
    """Return the dialect-specific `insert` constructor that supports
    on_conflict_do_update / on_conflict_do_nothing. The API is identical
    across sqlite and postgresql dialects, so call sites can treat them
    interchangeably."""
    return _sqlite_insert if engine.dialect.name == "sqlite" else _pg_insert


def to_date(value) -> date | None:
    """Coerce a raw-SQL date column value to a date.

    Raw text() queries bypass SQLAlchemy's type conversion: SQLite returns
    ISO strings, Postgres returns native date objects. Call sites that read
    date columns through text() should pass results through this helper so
    the same code works against either dialect.
    """
    if value is None:
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(value)
