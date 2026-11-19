"""Where generated pictures are kept, served at /api/images."""

from __future__ import annotations

import uuid
from pathlib import Path

# From a checkout: backend/images/. Installed as a tool there is no checkout, and the
# package folder belongs to the installer, so pictures go under the home folder.
_backend = Path(__file__).resolve().parents[2]
IMAGE_DIR = (
    _backend / "images"
    if (_backend / "pyproject.toml").is_file()
    else Path.home() / ".confab" / "images"
)
IMAGE_DIR.mkdir(parents=True, exist_ok=True)


def save(png: bytes) -> str:
    """Write the picture under a random name and return the file name."""
    name = f"{uuid.uuid4().hex}.png"
    (IMAGE_DIR / name).write_bytes(png)
    return name
