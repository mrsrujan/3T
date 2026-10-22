"""Alembic environment. Reads STOCKS_DATABASE_URL via app.config and binds
target_metadata to the app's SQLAlchemy models so `autogenerate` detects
schema drift automatically."""
import os
import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config, pool

from alembic import context

# Make `app` importable from this file (alembic/ is a sibling of app/).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402
from app.db import Base  # noqa: E402
# Import models for side-effect: registers all tables on Base.metadata.
from app import models  # noqa: E402, F401

config = context.config

# Prefer the app's resolved database_url (which honours STOCKS_DATABASE_URL)
# over whatever sqlalchemy.url is baked into alembic.ini. This keeps alembic
# and the running app in lock-step without duplicating config.
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        # Required for autogenerate to pick up column-type / default changes
        # on SQLite batch migrations when running offline against SQLite.
        render_as_batch=url.startswith("sqlite"),
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        is_sqlite = connection.dialect.name == "sqlite"
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=is_sqlite,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
