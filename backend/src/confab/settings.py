"""Settings from the environment. Local mode needs none; hosted mode refuses to start
without every secret it depends on, because these stand between the internet and the
Bedrock bill."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Annotated, Any, Literal
from urllib.parse import urlparse

from pydantic import Field, SecretStr, ValidationError, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# From a checkout: backend/. Installed as a tool there is no checkout, and the package
# folder belongs to the installer, so data goes under the home folder. Never created here.
_backend = Path(__file__).resolve().parents[2]
DATA_DIR = (
    _backend if (_backend / "pyproject.toml").is_file() else Path.home() / ".confab"
)

_R2 = {
    "r2_account_id": "R2_ACCOUNT_ID",
    "r2_access_key_id": "R2_ACCESS_KEY_ID",
    "r2_secret_access_key": "R2_SECRET_ACCESS_KEY",
    "r2_bucket": "R2_BUCKET",
    "r2_public_base_url": "R2_PUBLIC_BASE_URL",
}
_LOOPBACK = {"localhost", "127.0.0.1"}


def _split(value: Any) -> Any:
    """ "1", "1, 2", "1 2" or a JSON list, as a list."""
    if not isinstance(value, str):
        return value
    text = value.strip()
    if text.startswith("["):
        return json.loads(text)
    return [part for part in re.split(r"[\s,]+", text) if part]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="CONFAB_", extra="ignore", hide_input_in_errors=True
    )

    environment: Literal["local", "production"] = "local"
    database_url: str = ""
    jwt_secret_key: SecretStr = SecretStr("")
    github_client_id: str = ""
    github_client_secret: SecretStr = SecretStr("")
    allowed_github_ids: Annotated[list[int], NoDecode] = []
    frontend_url: str = ""
    cors_origins: Annotated[list[str], NoDecode] = []

    r2_account_id: str = Field(default="", validation_alias="R2_ACCOUNT_ID")
    r2_access_key_id: str = Field(default="", validation_alias="R2_ACCESS_KEY_ID")
    r2_secret_access_key: SecretStr = Field(
        default=SecretStr(""), validation_alias="R2_SECRET_ACCESS_KEY"
    )
    r2_bucket: str = Field(default="", validation_alias="R2_BUCKET")
    r2_public_base_url: str = Field(default="", validation_alias="R2_PUBLIC_BASE_URL")

    @field_validator("allowed_github_ids", "cors_origins", mode="before")
    @classmethod
    def _parse_list(cls, value: Any) -> Any:
        return _split(value)

    @field_validator("database_url")
    @classmethod
    def _psycopg(cls, value: str) -> str:
        value = value.strip()
        for prefix in ("postgresql+psycopg2://", "postgresql://", "postgres://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value.removeprefix(prefix)
        return value

    @field_validator("frontend_url", "r2_public_base_url")
    @classmethod
    def _no_trailing_slash(cls, value: str) -> str:
        return value.strip().rstrip("/")

    @model_validator(mode="after")
    def _derive(self) -> Settings:
        if not self.database_url and self.environment == "local":
            self.database_url = f"sqlite:///{(DATA_DIR / 'confab.db').as_posix()}"
        origins = [origin.rstrip("/") for origin in self.cors_origins]
        if self.frontend_url:
            parsed = urlparse(self.frontend_url)
            origin = f"{parsed.scheme}://{parsed.netloc}"
            if origin not in origins:
                origins.append(origin)
        self.cors_origins = origins
        return self

    @property
    def is_local(self) -> bool:
        return self.environment == "local"

    @property
    def on_vercel(self) -> bool:
        return bool(os.environ.get("VERCEL"))

    @property
    def uses_r2(self) -> bool:
        return all(self._r2_values().values())

    @property
    def round_budget_seconds(self) -> int | None:
        return 240 if self.on_vercel else None

    def _r2_values(self) -> dict[str, str]:
        values: dict[str, str] = {}
        for name, variable in _R2.items():
            value = getattr(self, name)
            values[variable] = (
                value.get_secret_value() if isinstance(value, SecretStr) else value
            ).strip()
        return values

    def problems(self) -> list[str]:
        """Why this configuration must not start. Names variables, never values."""
        issues: list[str] = []
        r2 = self._r2_values()
        r2_missing = [variable for variable, value in r2.items() if not value]
        if r2_missing and len(r2_missing) < len(r2):
            issues.append(
                f"only some R2 variables are set; missing {', '.join(r2_missing)}"
            )

        if self.on_vercel and self.environment != "production":
            issues.append("VERCEL is set, so CONFAB_ENVIRONMENT must be production")

        if self.environment == "production":
            missing: list[str] = []
            if not self.database_url:
                missing.append("CONFAB_DATABASE_URL")
            if not self.github_client_id:
                missing.append("CONFAB_GITHUB_CLIENT_ID")
            if not self.github_client_secret.get_secret_value():
                missing.append("CONFAB_GITHUB_CLIENT_SECRET")
            if not self.allowed_github_ids:
                missing.append("CONFAB_ALLOWED_GITHUB_IDS")
            if not self.frontend_url:
                missing.append("CONFAB_FRONTEND_URL")
            if missing:
                issues.append(f"missing {', '.join(missing)}")
            if len(self.jwt_secret_key.get_secret_value()) < 32:
                issues.append(
                    "CONFAB_JWT_SECRET_KEY must be set to 32 or more characters"
                )
            if self.frontend_url:
                parsed = urlparse(self.frontend_url)
                if parsed.scheme != "https" and not (
                    parsed.scheme == "http" and parsed.hostname in _LOOPBACK
                ):
                    issues.append(
                        "CONFAB_FRONTEND_URL must be https unless it is localhost"
                    )

        if self.on_vercel:
            if not self.database_url.startswith("postgresql+psycopg://"):
                issues.append("CONFAB_DATABASE_URL must be a Postgres URL on Vercel")
            if len(r2_missing) == len(r2):  # a partial set is reported above
                issues.append(
                    f"Vercel needs R2 for pictures; set {', '.join(_R2.values())}"
                )
            if self.r2_public_base_url and not self.r2_public_base_url.startswith(
                "https://"
            ):
                issues.append("R2_PUBLIC_BASE_URL must be https")
            if not os.environ.get("AWS_BEARER_TOKEN_BEDROCK", "").strip():
                issues.append("missing AWS_BEARER_TOKEN_BEDROCK")
        return issues


def _load() -> Settings:
    try:
        loaded = Settings()
    except ValidationError as error:
        # from None below keeps pydantic's report (and any input) out of the traceback.
        fields = {
            str(detail["loc"][0]).upper() for detail in error.errors() if detail["loc"]
        }
        names = sorted(
            field if field.startswith("R2_") else f"CONFAB_{field}" for field in fields
        )
        raise RuntimeError(
            f"confab settings are invalid: check {', '.join(names)}"
        ) from None
    issues = loaded.problems()
    if issues:
        raise RuntimeError("confab refuses to start: " + "; ".join(issues))
    return loaded


settings = _load()
