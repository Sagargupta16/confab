"""HTTP API: health, the roster, the chats and their rounds, and the built page.

Local mode answers this machine only and has no sign-in; hosted mode adds CORS and the
GitHub sign-in routes. The branch is fixed at import from validated settings.
"""

from __future__ import annotations

import logging
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from starlette.types import ASGIApp, Receive, Scope, Send

from . import __version__, chats, rounds
from .chat import ROLES
from .db import SessionLocal, migrate_local
from .deps import CurrentUser
from .images import IMAGE_DIR
from .levels import LEVELS
from .modes import MODES
from .roster import PRICES, ROSTER
from .settings import settings

log = logging.getLogger("uvicorn.error")

_LOOPBACK = {"127.0.0.1", "::1", "localhost", "::ffff:127.0.0.1"}
_LOCAL_NAMES = {"localhost", "127.0.0.1"}
_ONLY_HERE = "This confab answers only the machine it runs on."
_OTHER_SITE = "This confab does not take requests from other sites."


def _host_name(host: str) -> str:
    """A Host header without its port, lower case."""
    host = host.strip().lower()
    return host if host.startswith("[") else host.rsplit(":", 1)[0]


class _LoopbackOnly:
    """Local mode has no sign-in, so only this machine may talk to it.

    The client address alone is not enough: a page whose name was re-pointed at
    127.0.0.1 (DNS rebinding) reaches the API from the owner's own browser. So the Host
    must be a local name too, and a write must not come from another site's page.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            refusal = self._refusal(scope)
            if refusal is not None:
                response = JSONResponse({"detail": refusal}, status_code=403)
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)

    @staticmethod
    def _refusal(scope: Scope) -> str | None:
        headers = {
            name.decode("latin-1"): value.decode("latin-1")
            for name, value in scope.get("headers", [])
        }
        if _host_name(headers.get("host", "")) not in _LOCAL_NAMES:
            return _ONLY_HERE
        client = scope.get("client")
        if not client or client[0] not in _LOOPBACK:
            return _ONLY_HERE
        origin = headers.get("origin")
        if scope.get("method") != "GET" and origin is not None:
            if (urlsplit(origin).hostname or "") not in _LOCAL_NAMES:
                return _OTHER_SITE
        return None


app = FastAPI(title="confab", version=__version__)

if settings.is_local:
    migrate_local()
    rounds.reset_local_rounds()
    app.add_middleware(_LoopbackOnly)
else:
    # Imported here only: local mode never loads the sign-in code.
    from .auth import router as auth_router
    from .oauth import router as oauth_router

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.include_router(auth_router)
    app.include_router(oauth_router)


@app.exception_handler(RequestValidationError)
async def _invalid(request: Request, error: RequestValidationError) -> JSONResponse:
    # FastAPI's own answer echoes the input, which can be a sign-in code or a whole chat.
    fields = [
        ".".join(str(part) for part in detail.get("loc", ()))
        for detail in error.errors()
    ]
    log.info("invalid request to %s: %s", request.url.path, ", ".join(fields))
    return JSONResponse({"detail": "The request is not valid."}, status_code=422)


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "healthy",
        "version": __version__,
        "mode": "local" if settings.is_local else "hosted",
    }


@app.get("/api/health/db", response_model=None)
def health_db() -> dict | JSONResponse:
    try:
        with SessionLocal() as session:
            session.execute(text("SELECT 1"))
    except SQLAlchemyError as error:
        log.warning("database check failed: %s", error)
        return JSONResponse(
            {"status": "error", "database": "unavailable"}, status_code=503
        )
    return {"status": "ok", "database": "connected"}


@app.get("/api/roster")
def roster(_user: CurrentUser) -> dict:
    return {
        "seats": [seat.public() for seat in ROSTER.values()],
        "roles": [
            {"id": role.id, "label": role.label, "brief": role.brief}
            for role in ROLES.values()
        ],
        "prices": PRICES,
        "modes": MODES,
        "levels": LEVELS,
    }


app.include_router(chats.router)
app.include_router(rounds.router)

if IMAGE_DIR is not None:
    app.mount("/api/images", StaticFiles(directory=IMAGE_DIR), name="images")

# After `pnpm run build` the built page sits beside this file (and inside the wheel),
# so the API serves it too and one process is enough.
_page = Path(__file__).parent / "static"
if _page.is_dir():
    app.mount("/", StaticFiles(directory=_page, html=True), name="page")
