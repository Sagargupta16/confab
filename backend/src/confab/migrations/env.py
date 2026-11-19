"""Alembic environment, for the `alembic` command and for migrate_local().

Alembic loads this as a file, not as part of the package, so it is the one place that
imports `confab` absolutely (alembic.ini puts src/ on sys.path).
"""

from __future__ import annotations

import importlib
from logging.config import fileConfig

from alembic import context
from sqlalchemy import Connection, MetaData, create_engine, pool

config = context.config

# migrate_local() builds its Config in code, with no ini and so no logging setup.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def _metadata() -> MetaData:
    metadata = config.attributes.get("metadata")
    if metadata is None:
        metadata = importlib.import_module("confab.models").Base.metadata
    return metadata


def _database_url() -> str:
    return importlib.import_module("confab.settings").settings.database_url


def _run(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=_metadata(),
        compare_type=True,
        render_as_batch=connection.dialect.name == "sqlite",
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_offline() -> None:
    url = _database_url()
    context.configure(
        url=url,
        target_metadata=_metadata(),
        compare_type=True,
        render_as_batch=url.startswith("sqlite"),
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connection = config.attributes.get("connection")
    if connection is not None:
        _run(connection)
        return
    # Its own engine, without the app's per-transaction timeouts, so a long migration
    # is not cut off at 30 s.
    engine = create_engine(_database_url(), poolclass=pool.NullPool)
    try:
        with engine.connect() as connection:
            _run(connection)
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
