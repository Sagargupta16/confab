"""Sessions after sign-in: one-use refresh tokens, who am I, and sign-out.

Every refresh token names a refresh_tokens row ("<row id>.<nonce>") that one atomic
UPDATE marks used. Presenting it again within REUSE_GRACE_SECONDS is two tabs or a
retry and gets its own pair; later means it was copied, and every session of the user
ends.
"""

from __future__ import annotations

import hmac
import logging
import secrets
from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from .db import get_session, utcnow
from .deps import CurrentUser
from .models import RefreshToken, User
from .settings import settings
from .tokens import REFRESH_DAYS, read_token, sign_pair

log = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/api/auth", tags=["auth"])

REUSE_GRACE_SECONDS = 60
PRIVATE = "This confab is private to its owner."
REPLAYED = "This session was used elsewhere and has been signed out. Sign in again."


class RefreshBody(BaseModel):
    refresh_token: str = Field(min_length=1, max_length=4096)


def _sign_in_again() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Sign in again.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def allowed(user: User) -> bool:
    return user.github_id is not None and user.github_id in settings.allowed_github_ids


def issue_tokens(session: Session, user: User) -> dict:
    """Record a one-use refresh row, commit, and sign a pair naming it."""
    now = utcnow()
    # Rows outlive their tokens by a day, then go; this keeps them bounded per user.
    session.execute(
        delete(RefreshToken).where(
            RefreshToken.user_id == user.id,
            RefreshToken.created_at < now - timedelta(days=REFRESH_DAYS + 1),
        )
    )
    nonce = secrets.token_urlsafe(24)
    row = RefreshToken(user_id=user.id, nonce=nonce, created_at=now)
    session.add(row)
    session.flush()
    user_id, token_version, jti = user.id, user.token_version, f"{row.id}.{nonce}"
    session.commit()
    return sign_pair(user_id, token_version, jti)


def _consume(session: Session, user_id: int, jti: str) -> None:
    """Mark the refresh row used; tolerate a quick second use, revoke a late one."""
    record_id, _, nonce = jti.partition(".")
    if not (record_id.isascii() and record_id.isdigit() and nonce):
        raise _sign_in_again()
    row_id = int(record_id)
    stored = session.scalar(
        select(RefreshToken.nonce).where(
            RefreshToken.id == row_id, RefreshToken.user_id == user_id
        )
    )
    if stored is None or not hmac.compare_digest(stored.encode(), nonce.encode()):
        raise _sign_in_again()

    now = utcnow()
    match = (
        RefreshToken.id == row_id,
        RefreshToken.user_id == user_id,
        RefreshToken.nonce == nonce,
    )
    consumed = session.execute(
        update(RefreshToken)
        .where(*match, RefreshToken.consumed_at.is_(None))
        .values(consumed_at=now)
        .returning(RefreshToken.id)
    ).scalar_one_or_none()
    if consumed is not None:
        return
    earlier = session.scalar(select(RefreshToken.consumed_at).where(*match))
    if earlier is None:  # the row went between the two reads
        raise _sign_in_again()
    if now - earlier <= timedelta(seconds=REUSE_GRACE_SECONDS):
        return

    session.execute(
        update(User)
        .where(User.id == user_id)
        .values(token_version=User.token_version + 1)
    )
    session.commit()
    log.warning(
        "Refresh token replayed; signed out every session of user_id=%s", user_id
    )
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=REPLAYED,
        headers={"WWW-Authenticate": "Bearer"},
    )


@router.post("/refresh")
def refresh(
    body: RefreshBody, session: Annotated[Session, Depends(get_session)]
) -> dict:
    claims = read_token(body.refresh_token, "refresh")
    if claims is None or claims.jti is None:
        raise _sign_in_again()
    user = session.get(User, claims.user_id)
    if user is None or user.token_version != claims.tv:
        raise _sign_in_again()
    # The allowlist may have changed since sign-in.
    if not allowed(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=PRIVATE)
    _consume(session, user.id, claims.jti)
    return issue_tokens(session, user)


@router.get("/me")
def me(user: CurrentUser) -> dict:
    return {
        "id": user.id,
        "github_id": user.github_id,
        "login": user.login,
        "name": user.name,
    }


@router.post("/logout")
def logout(
    user: CurrentUser, session: Annotated[Session, Depends(get_session)]
) -> dict:
    # A new token_version ends the access token in hand and every refresh token.
    session.execute(
        update(User)
        .where(User.id == user.id)
        .values(token_version=User.token_version + 1)
    )
    session.commit()
    log.info("Signed out user_id=%s", user.id)
    return {"message": "Signed out"}
