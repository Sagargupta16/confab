"""The engine and sessions: a SQLite file in local mode, Neon Postgres when hosted."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import Connection, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from .settings import settings

_url = settings.database_url
_is_sqlite = _url.startswith("sqlite")

_engine_kwargs: dict[str, Any] = {
    # Bound parameters are chat text. Outside local mode keep them out of exception
    # messages and so out of the logs.
    "hide_parameters": not settings.is_local,
}
if _is_sqlite:
    _engine_kwargs["connect_args"] = {"check_same_thread": False, "timeout": 15}
else:
    # Sized for the Neon free tier; Neon idles connections after 5 minutes.
    _engine_kwargs.update(
        pool_size=5,
        max_overflow=3,
        pool_pre_ping=True,
        pool_recycle=300,
        connect_args={"connect_timeout": 10},
    )

engine = create_engine(_url, **_engine_kwargs)

if _is_sqlite:

    @event.listens_for(engine, "do_connect")
    def _make_folder(
        _dialect: Any, _record: Any, _args: Any, _params: dict[str, Any]
    ) -> None:
        # On first use, not at import: the folder may not exist yet, and nothing may
        # write to disk while the module loads.
        database = engine.url.database
        if database and database != ":memory:" and not database.startswith("file:"):
            Path(database).parent.mkdir(parents=True, exist_ok=True)

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_connection: Any, _record: Any) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

else:
    # set_config(..., true) is SET LOCAL, which the Neon pooler allows where startup
    # parameters are rejected; one statement sets both timeouts per transaction.
    _set_timeouts_sql = (
        "SELECT set_config('statement_timeout', '30000', true), "
        "set_config('idle_in_transaction_session_timeout', '60000', true)"
    )

    @event.listens_for(engine, "begin")
    def _pg_timeouts(connection: Connection) -> None:
        connection.exec_driver_sql(_set_timeouts_sql)


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_session() -> Iterator[Session]:
    """A request session: commits only when something changed, rolls back on error."""
    session = SessionLocal()
    try:
        yield session
        if session.new or session.dirty or session.deleted:
            session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def utcnow() -> datetime:
    """Now in naive UTC, the form every timestamp column holds."""
    return datetime.now(UTC).replace(tzinfo=None)


def migrate_local() -> None:
    """Bring the local database to the newest revision. Hosted runs `alembic` in CI."""
    from alembic import command
    from alembic.config import Config

    from .models import Base

    config = Config()
    config.set_main_option(
        "script_location", (Path(__file__).parent / "migrations").as_posix()
    )
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        config.attributes["metadata"] = Base.metadata
        command.upgrade(config, "head")
