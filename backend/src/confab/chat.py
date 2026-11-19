"""Who speaks next, and what each model sees of the shared transcript."""

from __future__ import annotations

import re
import time
from collections.abc import Iterator

from botocore.exceptions import BotoCoreError, ClientError

from .bedrock import stream_reply
from .roster import ROSTER, Member

HUMAN = "you"
MENTION = re.compile(r"(?<![\w@.])@([a-z][a-z0-9-]*)", re.IGNORECASE)


def mentioned(text: str, members: list[str]) -> list[str]:
    """Handles of the members named in text, in order, each once. @all names everyone."""
    found: list[str] = []
    for match in MENTION.finditer(text):
        handle = match.group(1).lower()
        targets = members if handle == "all" else [handle]
        for target in targets:
            if target in members and target not in found:
                found.append(target)
    return found


def system_prompt(member: Member, members: list[str], human_name: str) -> str:
    others = ", ".join(
        f"@{handle} ({ROSTER[handle].name})"
        for handle in members
        if handle != member.handle
    )
    return (
        f"You are {member.name}, made by {member.provider}. Your handle in this chat is "
        f"@{member.handle}. You are one participant in a group chat with {human_name} (the "
        f"human) and these other AI models: {others or 'none yet'}.\n"
        "Messages from everyone else reach you prefixed with the speaker's name in square "
        "brackets. Reply only as yourself: never write lines for another participant, and do "
        "not start your reply with your own name or a bracket prefix.\n"
        "Write like a chat message: short and direct unless depth is asked for. Disagree when "
        "you disagree; do not just echo the others.\n"
        "To pull another model in, mention it with @handle. Only do that when you actually "
        "want its reply, because every mention makes that model answer."
    )


def view_for(member: Member, transcript: list[dict], human_name: str) -> list[dict]:
    """The transcript as Converse messages from one model's seat.

    Its own messages are assistant turns; everything else becomes user text with a
    [Speaker] prefix. Neighbouring messages from other speakers share one user turn,
    because Converse wants the roles to alternate.
    """
    messages: list[dict] = []
    for entry in transcript:
        text = entry["text"].strip()
        if not text:
            continue
        if entry["author"] == member.handle:
            role, body = "assistant", text
        else:
            speaker = (
                human_name if entry["author"] == HUMAN else ROSTER[entry["author"]].name
            )
            role, body = "user", f"[{speaker}]: {text}"
        if messages and messages[-1]["role"] == role:
            messages[-1]["content"][0]["text"] += f"\n\n{body}"
        else:
            messages.append({"role": role, "content": [{"text": body}]})
    if messages and messages[0]["role"] == "assistant":
        messages.insert(0, {"role": "user", "content": [{"text": "(chat start)"}]})
    return messages


def run(
    transcript: list[dict],
    members: list[str],
    default: str | None,
    max_hops: int,
    human_name: str,
) -> Iterator[dict]:
    """Answer the newest human message, then follow the models' own mentions.

    Yields events for the browser: start, delta, end or error per reply, then done.
    A hop is a reply one model triggered by mentioning another; max_hops caps them.
    """
    transcript = list(transcript)
    queue = [(handle, None) for handle in mentioned(transcript[-1]["text"], members)]
    if not queue and members:
        queue = [(default if default in members else members[0], None)]

    hops = 0
    while queue:
        handle, asked_by = queue.pop(0)
        if asked_by is not None:
            if hops >= max_hops:
                queue.insert(0, (handle, asked_by))
                break
            hops += 1
        member = ROSTER[handle]
        yield {"type": "start", "handle": handle, "askedBy": asked_by}
        started = time.monotonic()
        text = ""
        try:
            for piece in stream_reply(
                member,
                system_prompt(member, members, human_name),
                view_for(member, transcript, human_name),
            ):
                if "delta" in piece:
                    text += piece["delta"]
                    yield {"type": "delta", "handle": handle, "text": piece["delta"]}
                else:
                    yield {
                        "type": "end",
                        "handle": handle,
                        "usage": piece["usage"],
                        "stop": piece["stop"],
                        "seconds": round(time.monotonic() - started, 1),
                    }
        except (ClientError, BotoCoreError) as error:
            yield {"type": "error", "handle": handle, "message": _reason(error)}
            continue
        if not text.strip():
            continue
        transcript.append({"author": handle, "text": text})
        waiting = {target for target, _ in queue}
        for target in mentioned(text, members):
            if target != handle and target not in waiting:
                queue.append((target, handle))

    yield {"type": "done", "hops": hops, "capped": [handle for handle, _ in queue]}


def _reason(error: ClientError | BotoCoreError) -> str:
    if isinstance(error, ClientError):
        detail = error.response.get("Error", {})
        return f"{detail.get('Code', 'Error')}: {detail.get('Message', str(error))}"
    return f"{type(error).__name__}: {error}"
