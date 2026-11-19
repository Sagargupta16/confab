"""HS256 access and refresh tokens, and purpose keys for the other HMACs.

Every token carries `tv`, the user's token_version: bumping that column ends every
session of the user at once. Refresh tokens also carry `jti`, "<row id>.<nonce>" of a
one-use refresh_tokens row.
"""

from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

import jwt

from .settings import settings

ACCESS_MINUTES = 30
REFRESH_DAYS = 7
ALGORITHM = "HS256"


@dataclass(frozen=True, slots=True)
class Claims:
    user_id: int
    tv: int
    jti: str | None


def _secret() -> str:
    return settings.jwt_secret_key.get_secret_value()


def _require_secret() -> str:
    secret = _secret()
    if not secret:
        raise RuntimeError("CONFAB_JWT_SECRET_KEY is not set")
    return secret


def sign_pair(user_id: int, token_version: int, refresh_jti: str) -> dict:
    """{"access_token", "refresh_token", "token_type": "bearer"} for one user."""
    secret = _require_secret()
    now = datetime.now(UTC)
    claims = {"sub": str(user_id), "tv": token_version, "iat": now}
    access = jwt.encode(
        {**claims, "type": "access", "exp": now + timedelta(minutes=ACCESS_MINUTES)},
        secret,
        algorithm=ALGORITHM,
    )
    refresh = jwt.encode(
        {
            **claims,
            "type": "refresh",
            "jti": refresh_jti,
            "exp": now + timedelta(days=REFRESH_DAYS),
        },
        secret,
        algorithm=ALGORITHM,
    )
    return {"access_token": access, "refresh_token": refresh, "token_type": "bearer"}


def read_token(token: str, kind: Literal["access", "refresh"]) -> Claims | None:
    """The claims of a valid, unexpired token of this kind, or None."""
    secret = _secret()
    if not secret:
        return None
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=[ALGORITHM],
            options={"require": ["sub", "tv", "type", "iat", "exp"]},
        )
    except jwt.PyJWTError:
        return None
    if payload["type"] != kind:
        return None
    tv = payload["tv"]
    if not isinstance(tv, int) or isinstance(tv, bool):
        return None
    try:
        user_id = int(payload["sub"])
    except (TypeError, ValueError):
        return None
    jti = payload.get("jti")
    if kind == "refresh" and not isinstance(jti, str):
        return None
    return Claims(user_id=user_id, tv=tv, jti=jti if kind == "refresh" else None)


def purpose_key(info: bytes) -> bytes:
    """HMAC-SHA256(secret, info): a separate key per purpose, so a value signed for
    one purpose never verifies as another."""
    return hmac.new(_require_secret().encode(), info, hashlib.sha256).digest()
