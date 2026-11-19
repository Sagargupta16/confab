"""Room presets: one click sets who is in, their roles, who answers and the hop cap."""

from __future__ import annotations

from .chat import ROLES
from .roster import ROSTER


def _mode(
    id: str,
    label: str,
    description: str,
    members: list[str],
    roles: dict[str, str],
    default: str | None,
    max_hops: int,
) -> dict:
    for handle in members:
        if handle not in ROSTER or not ROSTER[handle].joined:
            raise ValueError(
                f"mode {id}: @{handle} is not a seat that joins by default"
            )
    for handle, role in roles.items():
        if handle not in members or ROSTER[handle].kind != "text":
            raise ValueError(f"mode {id}: role for @{handle}, who is not a text member")
        if role not in ROLES:
            raise ValueError(f"mode {id}: unknown role {role}")
    if default is not None and default not in members:
        raise ValueError(f"mode {id}: default @{default} is not a member")
    return {
        "id": id,
        "label": label,
        "description": description,
        "members": members,
        "roles": roles,
        "default": default,
        "max_hops": max_hops,
    }


MODES: list[dict] = [
    _mode(
        "open",
        "Open room",
        "Everyone who joins by default, no roles: mention whoever you want.",
        [handle for handle, seat in ROSTER.items() if seat.joined],
        {},
        "claude",
        6,
    ),
    _mode(
        "debate",
        "Debate",
        "A critic and a devil's advocate push back; the moderator sums up.",
        ["claude", "gpt", "grok", "deepseek"],
        {"claude": "moderator", "gpt": "critic", "grok": "devils-advocate"},
        "claude",
        8,
    ),
    _mode(
        "build",
        "Build",
        "A builder drafts, a critic finds the holes, a simplifier trims it down.",
        ["claude", "gpt", "deepseek", "qwen"],
        {"claude": "builder", "gpt": "critic", "deepseek": "simplifier"},
        "claude",
        6,
    ),
    _mode(
        "fact-check",
        "Fact-check",
        "Two fact-checkers test the claims and the moderator says what holds up.",
        ["claude", "gpt", "mistral", "nova"],
        {"claude": "moderator", "gpt": "fact-checker", "mistral": "fact-checker"},
        "claude",
        4,
    ),
]

MODE_IDS = {mode["id"] for mode in MODES}
