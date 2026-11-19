"""Where generated pictures are kept: on disk in local mode (served at /api/images),
in a public Cloudflare R2 bucket when the five R2_* variables are set."""

from __future__ import annotations

import re
import secrets
from functools import cached_property
from pathlib import Path
from typing import Any, Protocol

import boto3

from .settings import DATA_DIR, settings

KEY = re.compile(r"[0-9a-f]{32}\.png")


def _new_key() -> str:
    # 128 random bits: the bucket is public, so the key is what keeps a picture unseen.
    return f"{secrets.token_hex(16)}.png"


class ImageStore(Protocol):
    def save(self, png: bytes) -> str: ...

    def url(self, key: str) -> str: ...

    def delete(self, key: str) -> None: ...


class DiskStore:
    def __init__(self, dir: Path) -> None:
        self.dir = dir
        self.dir.mkdir(parents=True, exist_ok=True)

    def save(self, png: bytes) -> str:
        key = _new_key()
        (self.dir / key).write_bytes(png)
        return key

    def url(self, key: str) -> str:
        return f"/api/images/{key}"

    def delete(self, key: str) -> None:
        # The key comes from the database, but never let it name a path outside dir.
        if KEY.fullmatch(key):
            (self.dir / key).unlink(missing_ok=True)


class R2Store:
    def __init__(
        self,
        account_id: str,
        access_key_id: str,
        secret_access_key: str,
        bucket: str,
        public_base_url: str,
    ) -> None:
        self._account_id = account_id
        self._access_key_id = access_key_id
        self._secret_access_key = secret_access_key
        self._bucket = bucket
        self._public_base_url = public_base_url.rstrip("/")

    @cached_property
    def _s3(self) -> Any:
        # Built on first use, so importing this module never touches the network.
        return boto3.client(
            "s3",
            endpoint_url=f"https://{self._account_id}.r2.cloudflarestorage.com",
            region_name="auto",
            aws_access_key_id=self._access_key_id,
            aws_secret_access_key=self._secret_access_key,
        )

    def save(self, png: bytes) -> str:
        key = _new_key()
        self._s3.put_object(
            Bucket=self._bucket,
            Key=f"images/{key}",
            Body=png,
            ContentType="image/png",
            CacheControl="public, max-age=31536000, immutable",
        )
        return key

    def url(self, key: str) -> str:
        return f"{self._public_base_url}/images/{key}"

    def delete(self, key: str) -> None:
        if KEY.fullmatch(key):
            self._s3.delete_object(Bucket=self._bucket, Key=f"images/{key}")


store: ImageStore
IMAGE_DIR: Path | None
if settings.uses_r2:
    store = R2Store(
        settings.r2_account_id,
        settings.r2_access_key_id,
        settings.r2_secret_access_key.get_secret_value(),
        settings.r2_bucket,
        settings.r2_public_base_url,
    )
    IMAGE_DIR = None
else:
    IMAGE_DIR = DATA_DIR / "images"
    store = DiskStore(IMAGE_DIR)
