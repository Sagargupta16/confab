"""The models that can sit in the chat, loaded from models.json."""

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Member:
    handle: str
    name: str
    provider: str
    model_id: str
    max_tokens: int
    # Reasoning models (Claude 5, GPT-6, Grok, Kimi) reject the temperature field.
    temperature: bool
    color: str
    joined: bool

    def public(self) -> dict:
        return {
            "handle": self.handle,
            "name": self.name,
            "provider": self.provider,
            "color": self.color,
            "joined": self.joined,
        }


def _load() -> dict[str, Member]:
    rows = json.loads(
        (Path(__file__).parent / "models.json").read_text(encoding="utf-8")
    )
    members = [
        Member(
            handle=row["handle"],
            name=row["name"],
            provider=row["provider"],
            model_id=row["modelId"],
            max_tokens=row["maxTokens"],
            temperature=row["temperature"],
            color=row["color"],
            joined=row["joined"],
        )
        for row in rows
    ]
    return {member.handle: member for member in members}


ROSTER: dict[str, Member] = _load()
