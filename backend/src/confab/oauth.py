"""GitHub sign-in without cookies: the page holds a PKCE verifier, the server signs a
one-use state bound to its challenge and the redirect, and only allowlisted GitHub ids
get a user row and tokens.

State is "{row id}.{nonce}.github.{challenge}.{expiry}.{sig}". The row makes it one-use
across serverless instances; it is consumed and committed before GitHub is called, so a
failed exchange can never bring it back.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import secrets
import time
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .auth import PRIVATE, issue_tokens
from .db import get_session, utcnow
from .github import AUTHORIZE_URL, REFUSED, SCOPE, GitHub, get_github, valid_id
from .models import OAuthState, User
from .settings import settings
from .tokens import purpose_key

log = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/api/auth/oauth", tags=["auth"])

PROVIDER = "github"
STATE_TTL = 600
PENDING_CAP = 20  # per client, so one caller cannot lock the owner out
PENDING_CEILING = 500  # everyone together; bounds the table
_STATE_KEY_INFO = b"confab/oauth-state/v1"

MALFORMED = "This sign-in attempt is not valid. Start sign-in again."
MISMATCH = "This sign-in does not match this browser. Start sign-in again."
EXPIRED = "This sign-in attempt has expired. Start sign-in again."
USED = "This sign-in attempt was already used. Start sign-in again."
TOO_MANY = "Too many sign-in attempts. Wait a few minutes."


class AuthorizeBody(BaseModel):
    code_challenge: str = Field(pattern=r"^[A-Za-z0-9_-]{43}$")


class CallbackBody(BaseModel):
    code: str = Field(min_length=1, max_length=2048)
    state: str = Field(max_length=512, pattern=r"^[A-Za-z0-9_.-]+$")
    code_verifier: str = Field(pattern=r"^[A-Za-z0-9._~-]{43,128}$")


def _bad(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def _redirect_uri() -> str:
    # From settings only, never from the request.
    return f"{settings.frontend_url}/auth/callback/{PROVIDER}"


def _b64(digest: bytes) -> str:
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


def _sign(payload: str) -> str:
    key = purpose_key(_STATE_KEY_INFO)
    return _b64(
        hmac.new(key, f"{payload}.{_redirect_uri()}".encode(), hashlib.sha256).digest()
    )


def _number(text: str) -> int | None:
    # int() also takes "+1", " 1" and "1_0"; only plain digits are a number here.
    return int(text) if text.isascii() and text.isdigit() else None


def _client_key(request: Request) -> str:
    """Who to count an attempt against. A rate-limit key only, never an identity."""
    # Vercel sets x-real-ip and overwrites x-forwarded-for; anywhere else a caller
    # could write them, so they are read only there.
    if settings.on_vercel:
        real_ip = request.headers.get("x-real-ip", "").strip()
        forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        if real_ip or forwarded:
            return (real_ip or forwarded)[:64]
    host = request.client.host if request.client else ""
    return (host or "unknown")[:64]


@router.post("/github/authorize")
def authorize(
    body: AuthorizeBody,
    request: Request,
    session: Annotated[Session, Depends(get_session)],
) -> dict:
    now = utcnow()
    cutoff = now - timedelta(seconds=STATE_TTL)
    client = _client_key(request)
    session.execute(delete(OAuthState).where(OAuthState.created_at <= cutoff))
    pending = (
        select(func.count())
        .select_from(OAuthState)
        .where(OAuthState.consumed_at.is_(None), OAuthState.created_at > cutoff)
    )
    mine = session.scalar(pending.where(OAuthState.client == client)) or 0
    everyone = session.scalar(pending) or 0
    if mine >= PENDING_CAP or everyone >= PENDING_CEILING:
        session.commit()  # keep the clean-up; the raise below would roll it back
        log.warning(
            "Sign-in attempt refused: %s pending for %s, %s in all",
            mine,
            client,
            everyone,
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=TOO_MANY
        )

    nonce = secrets.token_urlsafe(24)
    row = OAuthState(nonce=nonce, client=client, created_at=now)
    session.add(row)
    session.flush()
    expiry = int(time.time()) + STATE_TTL
    payload = f"{row.id}.{nonce}.{PROVIDER}.{body.code_challenge}.{expiry}"
    state = f"{payload}.{_sign(payload)}"
    session.commit()
    return {
        "provider": PROVIDER,
        "client_id": settings.github_client_id,
        "authorize_url": AUTHORIZE_URL,
        "scope": SCOPE,
        "redirect_uri": _redirect_uri(),
        "flow_version": 2,
        "state": state,
        "code_challenge": body.code_challenge,
        "code_challenge_method": "S256",
        "expires_in": STATE_TTL,
    }


def _check_state(body: CallbackBody) -> tuple[int, str]:
    """The row id and nonce of a well-formed, signed, matching, unexpired state."""
    parts = body.state.split(".")
    if len(parts) != 6:
        raise _bad(MALFORMED)
    record, nonce, provider, challenge, expiry, signature = parts
    record_id, expires_at = _number(record), _number(expiry)
    if record_id is None or expires_at is None or not nonce:
        raise _bad(MALFORMED)

    payload = body.state.rsplit(".", 1)[0]
    expected = _b64(hashlib.sha256(body.code_verifier.encode("ascii")).digest())
    # Both strings are ASCII by the body patterns, as compare_digest needs.
    if (
        not hmac.compare_digest(signature, _sign(payload))
        or provider != PROVIDER
        or not hmac.compare_digest(challenge, expected)
    ):
        raise _bad(MISMATCH)
    if int(time.time()) >= expires_at:
        raise _bad(EXPIRED)
    return record_id, nonce


def _consume_state(session: Session, record_id: int, nonce: str) -> None:
    consumed = session.execute(
        update(OAuthState)
        .where(
            OAuthState.id == record_id,
            OAuthState.nonce == nonce,
            OAuthState.consumed_at.is_(None),
        )
        .values(consumed_at=utcnow())
        .returning(OAuthState.id)
    ).scalar_one_or_none()
    if consumed is None:
        raise _bad(USED)
    session.commit()


def _upsert_user(
    session: Session, github_id: int, login: str, name: str | None
) -> User:
    now = utcnow()
    query = select(User).where(User.github_id == github_id)
    user = session.scalars(query).first()
    if user is None:
        session.add(
            User(github_id=github_id, login=login, name=name, last_login_at=now)
        )
        try:
            session.commit()
        except IntegrityError:
            # A second callback for the same new account won the insert.
            session.rollback()
        user = session.scalars(query).one()
    user.login, user.name, user.last_login_at = login, name, now
    session.flush()
    return user


@router.post("/github/callback")
def callback(
    body: CallbackBody,
    session: Annotated[Session, Depends(get_session)],
    github: Annotated[GitHub, Depends(get_github)],
) -> dict:
    record_id, nonce = _check_state(body)
    _consume_state(session, record_id, nonce)

    access_token = github.exchange(body.code, body.code_verifier, _redirect_uri())
    account = github.user(access_token)
    if not valid_id(account.id):
        raise _bad(REFUSED)
    if account.id not in settings.allowed_github_ids:
        log.warning(
            "Sign-in refused for GitHub id %s: not on the allowlist", account.id
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=PRIVATE)

    # Cut to the columns again: a GitHub stand-in may skip github.py's parsing.
    name = account.name[:255] if account.name else None
    user = _upsert_user(session, account.id, account.login[:100], name)
    log.info("Signed in user_id=%s", user.id)
    return issue_tokens(session, user)
