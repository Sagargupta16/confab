"""Who is asking: the local user in local mode, a signed-in allowlisted user when hosted."""

from __future__ import annotations

import threading
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_session
from .models import User
from .settings import settings
from .tokens import read_token

bearer = HTTPBearer(auto_error=False)

# Fixed at import from validated settings: no request can switch the branch.
_LOCAL = settings.is_local
_local_lock = threading.Lock()
_local_id: int | None = None


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Sign in again.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _local_user(session: Session) -> User:
    global _local_id
    if _local_id is not None:
        user = session.get(User, _local_id)
        if user is not None:
            return user
    # NULL github_id is not unique, so an insert never fails on a race; local mode is
    # one process, and the lock keeps two first requests from making two users.
    with _local_lock:
        query = select(User).where(User.github_id.is_(None)).order_by(User.id).limit(1)
        user = session.scalars(query).first()
        if user is None:
            session.add(User(github_id=None, login="local"))
            session.commit()
            user = session.scalars(query).one()
        _local_id = user.id
        return user


def current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    session: Annotated[Session, Depends(get_session)],
) -> User:
    if _LOCAL:
        return _local_user(session)
    if credentials is None:
        raise _unauthorized()
    claims = read_token(credentials.credentials, "access")
    if claims is None:
        raise _unauthorized()
    user = session.get(User, claims.user_id)
    if user is None or user.token_version != claims.tv:
        raise _unauthorized()
    if user.github_id is None or user.github_id not in settings.allowed_github_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This confab is private to its owner.",
        )
    return user


CurrentUser = Annotated[User, Depends(current_user)]
