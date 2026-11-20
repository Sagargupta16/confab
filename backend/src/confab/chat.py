"""Who speaks next, and what each model sees of the shared transcript."""

from __future__ import annotations

import logging
import re
import time
from collections.abc import Callable, Iterator
from dataclasses import dataclass

from botocore.exceptions import BotoCoreError, ClientError

from .bedrock import ImageError, generate_image, stream_reply
from .images import store
from .roster import ROSTER, Model, cost

log = logging.getLogger("uvicorn.error")

HUMAN = "you"
MENTION = re.compile(r"(?<![\w@.])@([a-z][a-z0-9-]*)", re.IGNORECASE)
IMAGE_PROMPT_CAP = 4000
# A chat's max_hops with no cap: the round ends when a reply mentions nobody, or on Stop.
NO_HOP_LIMIT = -1


@dataclass(frozen=True)
class Role:
    id: str
    label: str
    brief: str


ROLES: dict[str, Role] = {
    role.id: role
    for role in (
        Role(
            "critic",
            "Critic",
            "Find the weakest point in what was just said and say it plainly; concede only "
            "when convinced.",
        ),
        Role(
            "builder",
            "Builder",
            "Turn the talk into something concrete such as code, a plan or numbered steps.",
        ),
        Role(
            "fact-checker",
            "Fact-checker",
            "Check claims made here; say which are wrong or unverified and why; say when "
            "unsure.",
        ),
        Role(
            "devils-advocate",
            "Devil's advocate",
            "Argue the strongest case for the side nobody has taken.",
        ),
        Role(
            "simplifier", "Simplifier", "Give the shortest version that is still right."
        ),
        Role(
            "moderator",
            "Moderator",
            "Sum up where the room agrees and disagrees, and pull in, with @handle, the "
            "member best placed to settle it.",
        ),
    )
}


@dataclass(frozen=True)
class Pick:
    """One seat as chosen for this request: its model and, maybe, a role."""

    model: Model
    role: str | None = None  # label shown on the page
    brief: str | None = None  # text the model is told


def short_label(brief: str, limit: int = 40) -> str:
    """A custom brief cut to limit characters at a word, as roleLabel in App.tsx cuts it."""
    if len(brief) <= limit:
        return brief
    cut = brief.rfind(" ", 0, limit + 1)
    return f"{brief[: cut if cut > 0 else limit]}..."


def _name(handle: str, picks: dict[str, Pick]) -> str:
    """Display name of the model a handle speaks as; absent seats use their default."""
    if handle in picks:
        return picks[handle].model.name
    seat = ROSTER[handle]
    return seat.models[seat.default].name


def mentioned(text: str, members: list[str], everyone: list[str]) -> list[str]:
    """Handles of the members named in text, in order, each once. @all names everyone."""
    found: list[str] = []
    for match in MENTION.finditer(text):
        handle = match.group(1).lower()
        targets = everyone if handle == "all" else [handle]
        for target in targets:
            if target in members and target not in found:
                found.append(target)
    return found


def system_prompt(
    handle: str,
    picks: dict[str, Pick],
    members: list[str],
    human_name: str,
    open_ended: bool = False,
) -> str:
    pick = picks[handle]
    others = []
    for other in members:
        if other == handle:
            continue
        name = picks[other].model.name
        if ROSTER[other].kind == "image":
            others.append(
                f"@{other} ({name}, image model: mentioning it turns your whole message "
                "into its prompt, so write only the picture)"
            )
        elif picks[other].role:
            others.append(f"@{other} ({name}, {picks[other].role})")
        else:
            others.append(f"@{other} ({name})")
    prompt = (
        f"You are {pick.model.name}, made by {ROSTER[handle].provider}. Your handle in this "
        f"chat is @{handle}. You are one participant in a group chat with {human_name} (the "
        f"human) and these other AI models: {', '.join(others) or 'none yet'}.\n"
        "Messages from everyone else reach you prefixed with the speaker's name in square "
        "brackets. Reply only as yourself: never write lines for another participant, and do "
        "not start your reply with your own name or a bracket prefix.\n"
        "Write like a chat message: short and direct unless depth is asked for. Disagree when "
        "you disagree; do not just echo the others.\n"
        "To pull another model in, mention it with @handle. Only do that when you actually "
        "want its reply, because every mention makes that model answer."
    )
    if open_ended:
        # No hop cap: the round ends only when a reply mentions nobody, so say so.
        prompt += (
            "\nThis room has no cap on replies: the discussion goes on for as long as "
            "someone is mentioned. Keep it going while there is real disagreement or "
            "work left. Once the group has reached a conclusion, state it plainly and "
            "mention nobody; a reply with no mention ends the discussion. Do not keep "
            "it alive with thanks, summaries of summaries or new mentions."
        )
    if pick.brief:
        # A preset has a name the others see; a custom role's label is its own brief, cut.
        custom = pick.brief.startswith((pick.role or "").removesuffix("..."))
        named = "" if custom else f"{pick.role}. "
        brief = pick.brief if pick.brief[-1] in ".!?" else f"{pick.brief}."
        prompt += f"\nYour role in this room: {named}{brief} Stay in it."
    return prompt


def view_for(
    handle: str, transcript: list[dict], human_name: str, picks: dict[str, Pick]
) -> list[dict]:
    """The transcript as Converse messages from one model's seat.

    Its own messages are assistant turns; everything else becomes user text with a
    [Speaker] prefix. Neighbouring messages from other speakers share one user turn,
    because Converse wants the roles to alternate.
    """
    messages: list[dict] = []
    for entry in transcript:
        text = entry["text"].strip()
        if not text and entry.get("image_prompt"):
            text = (
                f'(posted an image drawn from this prompt: "{entry["image_prompt"]}")'
            )
        if not text:
            continue
        if entry["author"] == handle:
            role, body = "assistant", text
        else:
            speaker = (
                human_name
                if entry["author"] == HUMAN
                else _name(entry["author"], picks)
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
    picks: dict[str, Pick],
    *,
    should_stop: Callable[[], bool],
    deadline: float | None,
) -> Iterator[dict]:
    """Answer the newest human message, then follow the models' own mentions.

    Yields events: start, then delta and end (or image) or error per reply, stopped
    when should_stop cut a reply short, then done with the reason the round ended. A
    hop is a reply one model triggered by mentioning another; max_hops caps them, and
    NO_HOP_LIMIT lifts the cap. No new reply starts once time.monotonic() passes
    deadline.
    """
    transcript = list(transcript)
    everyone = [h for h in members if ROSTER[h].kind == "text"]
    first = transcript[-1]["text"]
    queue: list[tuple[str, str | None, str]] = [
        (handle, None, first) for handle in mentioned(first, members, everyone)
    ]
    if not queue and members:
        queue = [(default if default in members else members[0], None, first)]

    hops = 0
    reason = "complete"
    while queue:
        if should_stop():
            reason = "stopped"
            break
        if deadline is not None and time.monotonic() >= deadline:
            reason = "time"
            break
        handle, asked_by, trigger = queue[0]
        if asked_by is not None:
            if max_hops != NO_HOP_LIMIT and hops >= max_hops:
                reason = "hops"
                break
            hops += 1
        queue.pop(0)
        pick = picks[handle]
        yield {
            "type": "start",
            "handle": handle,
            "askedBy": asked_by,
            "model": pick.model.id,
            "role": pick.role,
        }
        started = time.monotonic()

        if ROSTER[handle].kind == "image":
            prompt = " ".join(MENTION.sub("", trigger).split())[:IMAGE_PROMPT_CAP]
            if not prompt:
                yield {
                    "type": "error",
                    "handle": handle,
                    "message": REASONS["EmptyImagePrompt"],
                }
                continue
            try:
                png = generate_image(pick.model, prompt)
            # ValueError: a reply body that is not JSON or base64.
            except (ClientError, BotoCoreError, ImageError, ValueError) as error:
                yield {
                    "type": "error",
                    "handle": handle,
                    "message": _reason(handle, error),
                }
                continue
            try:
                key = store.save(png)
            # OSError: the file write on disk. The R2 store raises botocore errors.
            except (ClientError, BotoCoreError, OSError) as error:
                log.warning("@%s picture not saved: %s", handle, error)
                yield {
                    "type": "error",
                    "handle": handle,
                    "message": REASONS["ImageStoreFailed"],
                }
                continue
            yield {
                "type": "image",
                "handle": handle,
                "key": key,
                "url": store.url(key),
                "prompt": prompt,
                "seconds": round(time.monotonic() - started, 1),
                "cost": cost(pick.model),
            }
            transcript.append({"author": handle, "text": "", "image_prompt": prompt})
            continue

        text = ""
        stopped = False
        pieces = stream_reply(
            pick.model,
            system_prompt(handle, picks, members, human_name, max_hops == NO_HOP_LIMIT),
            view_for(handle, transcript, human_name, picks),
        )
        try:
            for piece in pieces:
                # The closing usage piece means the call is over, so it is never cut.
                if "usage" not in piece and should_stop():
                    stopped = True
                    break
                if "tick" in piece:
                    continue
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
                        "cost": cost(pick.model, piece["usage"]),
                    }
        except (ClientError, BotoCoreError) as error:
            yield {"type": "error", "handle": handle, "message": _reason(handle, error)}
            continue
        finally:
            # Closing the generator closes the Bedrock stream, which ends the call.
            pieces.close()
        if stopped:
            yield {"type": "stopped", "handle": handle}
            reason = "stopped"
            break
        if not text.strip():
            continue
        transcript.append({"author": handle, "text": text})
        waiting = {target: index for index, (target, _, _) in enumerate(queue)}
        for target in mentioned(text, members, everyone):
            if target == handle:
                continue
            if target not in waiting:
                queue.append((target, handle, text))
            elif ROSTER[target].kind == "image":
                # "@nova write a prompt and give it to @stability": the image seat is
                # already waiting on your message, and the reply that names it is the
                # prompt you meant.
                queue[waiting[target]] = (target, queue[waiting[target]][1], text)

    yield {
        "type": "done",
        "hops": hops,
        "capped": [handle for handle, _, _ in queue],
        "reason": reason,
    }


# What the page shows for a failed call. The exception text itself stays in the API
# log: it can name endpoints, account details and request ids.
REASONS = {
    "ThrottlingException": "Throttled by Bedrock. Wait a little, then mention it again.",
    "ServiceQuotaExceededException": "Over this account's quota for the model.",
    "AccessDeniedException": "This account has no access to the model.",
    "ValidationException": "Bedrock rejected the request for this model.",
    "ResourceNotFoundException": "Bedrock does not know this model id.",
    "ModelTimeoutException": "The model took too long to answer.",
    "ModelNotReadyException": "The model is not ready yet. Try again shortly.",
    "ModelStreamErrorException": "The reply broke off mid-stream.",
    "ModelErrorException": "The model failed while answering.",
    "ServiceUnavailableException": "Bedrock is unavailable right now.",
    "InternalServerException": "Bedrock had an internal error.",
    "ExpiredTokenException": "The Bedrock credentials have expired.",
    "UnrecognizedClientException": "The Bedrock credentials were rejected.",
    "NoCredentialsError": "No Bedrock credentials were found.",
    "EndpointConnectionError": "Could not reach Bedrock. Check the network and region.",
    "ReadTimeoutError": "Bedrock did not answer in time.",
    "ImageRefused": "The image model refused this prompt.",
    "ImageMissing": "The image model sent back no image.",
    "EmptyImagePrompt": "Say what to draw in the message that mentions the image model.",
    "ImageStoreFailed": "The picture was made but could not be saved.",
}


def _reason(handle: str, error: Exception) -> str:
    if isinstance(error, ClientError):
        code = error.response.get("Error", {}).get("Code", "")
    else:
        code = type(error).__name__
    log.warning("@%s failed: %s", handle, error)
    return REASONS.get(code, "The call to Bedrock failed. The API log has the details.")
