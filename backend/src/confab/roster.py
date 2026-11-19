"""The seats that can sit in the chat, loaded from models.json, and their prices."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

HANDLE = re.compile(r"[a-z][a-z0-9-]*")
RESERVED = {"all", "you"}
KINDS = {"text", "image"}


@dataclass(frozen=True)
class Model:
    id: str
    name: str
    max_tokens: int | None
    # Reasoning models (Claude 5, GPT-6, Grok, Kimi) reject the temperature field.
    temperature: bool
    region: str | None
    price: dict | None


@dataclass(frozen=True)
class Seat:
    handle: str
    provider: str
    kind: str
    color: str
    joined: bool
    default: str
    models: dict[str, Model]

    def public(self) -> dict:
        return {
            "handle": self.handle,
            "provider": self.provider,
            "kind": self.kind,
            "color": self.color,
            "joined": self.joined,
            "default": self.default,
            "models": [
                {"id": model.id, "name": model.name, "price": model.price}
                for model in self.models.values()
            ],
        }


def _load() -> tuple[dict[str, Seat], dict]:
    here = Path(__file__).parent
    rows = json.loads((here / "models.json").read_text(encoding="utf-8"))
    prices = json.loads((here / "prices.json").read_text(encoding="utf-8"))
    table: dict[str, dict] = prices["models"]

    seats: dict[str, Seat] = {}
    for row in rows:
        handle = row["handle"]
        if not HANDLE.fullmatch(handle) or handle in RESERVED or handle in seats:
            raise ValueError(f"bad or duplicate handle: {handle}")
        if row["kind"] not in KINDS:
            raise ValueError(f"@{handle}: bad kind {row['kind']}")
        models: dict[str, Model] = {}
        for entry in row["models"]:
            if row["kind"] == "text" and not (
                isinstance(entry.get("maxTokens"), int)
                and isinstance(entry.get("temperature"), bool)
            ):
                raise ValueError(
                    f"{entry['id']}: text model needs maxTokens and temperature"
                )
            models[entry["id"]] = Model(
                id=entry["id"],
                name=entry["name"],
                max_tokens=entry.get("maxTokens"),
                temperature=entry.get("temperature", False),
                region=entry.get("region"),
                price=table.get(entry["id"]),
            )
        if row["default"] not in models:
            raise ValueError(
                f"@{handle}: default {row['default']} is not in its models"
            )
        seats[handle] = Seat(
            handle=handle,
            provider=row["provider"],
            kind=row["kind"],
            color=row["color"],
            joined=row["joined"],
            default=row["default"],
            models=models,
        )

    known = {model_id for seat in seats.values() for model_id in seat.models}
    stale = [key for key in table if key not in known]
    if stale:
        raise ValueError(f"prices.json has rows for no model: {', '.join(stale)}")
    meta = {key: prices[key] for key in ("checked", "source", "currency")}
    return seats, meta


ROSTER, PRICES = _load()


def cost(model: Model, usage: dict | None = None) -> float | None:
    """USD for one reply, rounded to 6 decimals, or None without a full price row.

    Text models pass the usage ({"in", "out"} tokens); image models pass nothing.
    """
    price = model.price
    if not price:
        return None
    if usage is None:
        if "image" not in price:
            return None
        return round(price["image"], 6)
    if "in" not in price or "out" not in price:
        return None
    return round(
        (usage["in"] * price["in"] + usage["out"] * price["out"]) / 1_000_000, 6
    )
