"""Where generated pictures are kept: backend/images/, served at /api/images."""

from __future__ import annotations

import uuid
from pathlib import Path

IMAGE_DIR = Path(__file__).resolve().parents[2] / "images"
IMAGE_DIR.mkdir(exist_ok=True)


def save(png: bytes) -> str:
    """Write the picture under a random name and return the file name."""
    name = f"{uuid.uuid4().hex}.png"
    (IMAGE_DIR / name).write_bytes(png)
    return name
