"""The one place that talks to GitHub: the sign-in code exchange and the account it
belongs to. Nothing here logs a code, a verifier or a token."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from functools import cache
from typing import Any

import httpx
from fastapi import HTTPException, status

from .settings import settings

log = logging.getLogger("uvicorn.error")

AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
TOKEN_URL = "https://github.com/login/oauth/access_token"
USER_URL = "https://api.github.com/user"
# The allowlist keys on the immutable numeric id, so no email scope.
SCOPE = "read:user"

UNAVAILABLE = "GitHub sign-in is unavailable. Try again in a moment."
REFUSED = "GitHub refused this sign-in. Start again."

# GitHub's OAuth error codes are short snake_case words; anything else is not logged.
_ERROR_CODE = re.compile(r"[a-z_]{1,40}")


@dataclass(frozen=True, slots=True)
class GitHubUser:
    id: int
    login: str
    name: str | None


def valid_id(value: Any) -> bool:
    """A GitHub account id: a positive int. JSON true is an int to Python, so not here."""
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def _unavailable() -> HTTPException:
    return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=UNAVAILABLE)


def _refused() -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=REFUSED)


class GitHub:
    def __init__(self) -> None:
        self._http = httpx.Client(timeout=10)

    def _send(self, method: str, url: str, step: str, **kwargs: Any) -> dict[str, Any]:
        """One call: down or 5xx is a 502, any other non-200 a 400, a body that is not a
        JSON object a 502. Only the step and the status are logged."""
        try:
            response = self._http.request(method, url, **kwargs)
        except httpx.HTTPError as error:
            log.warning("GitHub %s failed: %s", step, type(error).__name__)
            raise _unavailable() from None
        if response.status_code >= 500:
            log.warning("GitHub %s failed: status=%s", step, response.status_code)
            raise _unavailable()
        if response.status_code != 200:
            log.warning("GitHub %s refused: status=%s", step, response.status_code)
            raise _refused()
        try:
            body = response.json()
        except ValueError:
            body = None
        if not isinstance(body, dict):
            log.warning("GitHub %s answered with an unexpected body", step)
            raise _unavailable()
        return body

    def exchange(self, code: str, verifier: str, redirect_uri: str) -> str:
        """The GitHub access token for an authorization code."""
        body = self._send(
            "POST",
            TOKEN_URL,
            "code exchange",
            data={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret.get_secret_value(),
                "code": code,
                "redirect_uri": redirect_uri,
                "code_verifier": verifier,
            },
            headers={"Accept": "application/json"},
        )
        token = body.get("access_token")
        if not isinstance(token, str) or not token:
            # A bad code or verifier comes back as 200 with an "error" field.
            error = body.get("error")
            code_name = (
                error
                if isinstance(error, str) and _ERROR_CODE.fullmatch(error)
                else "unknown"
            )
            log.warning("GitHub code exchange refused: error=%s", code_name)
            raise _refused()
        return token

    def user(self, access_token: str) -> GitHubUser:
        """The account the token belongs to. Long logins and names are cut to the columns."""
        body = self._send(
            "GET",
            USER_URL,
            "user lookup",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github+json",
            },
        )
        account_id = body.get("id")
        login = body.get("login")
        name = body.get("name")
        if not valid_id(account_id) or not isinstance(login, str) or not login:
            log.warning("GitHub user lookup returned no usable identity")
            raise _refused()
        return GitHubUser(
            id=account_id,
            login=login[:100],
            name=name[:255] if isinstance(name, str) and name else None,
        )


@cache
def get_github() -> GitHub:
    """The shared client, made on first use. Checks override this dependency."""
    return GitHub()
