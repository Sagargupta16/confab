"""A round on the server. POST /api/chat claims the chat, saves the human message and
starts a worker thread that runs the round and saves every reply while it streams. The
response only tails the worker's queue, so a phone that drops the connection loses
nothing: the worker carries on and the page catches up from the database."""

from __future__ import annotations

import json
import logging
import queue
import threading
import time
import uuid
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .chat import HUMAN, ROLES, Pick, run, short_label
from .chats import (
    DIRECT,
    BUSY,
    MAX_MESSAGES,
    NEW_TITLE,
    Db,
    api_message,
    not_running,
    owned_chat,
    settle_leftovers,
)
from .db import SessionLocal, utcnow
from .deps import CurrentUser
from .models import Chat, Message
from .roster import ROSTER
from .settings import settings

log = logging.getLogger("uvicorn.error")
router = APIRouter()

FLUSH_SECONDS = 1.0  # reply text reaches the database at most this often
BEAT_SECONDS = 1.0  # and the heartbeat, which also reads the Stop flag
PING_SECONDS = 15

NOTICES = {
    "hops": "Stopped at the hop cap ({hops}). Not answered: {waiting}. Mention them to "
    "carry on.",
    "time": "Stopped at the time limit. Not answered: {waiting}. Mention them to carry "
    "on.",
}


class RoundRequest(BaseModel):
    chat_id: str = Field(min_length=1, max_length=32)
    text: str = Field(min_length=1, max_length=200_000)
    human_name: str = Field(default="You", min_length=1, max_length=40)


@dataclass(frozen=True)
class Job:
    """Everything the worker needs, as plain values: it never sees the request's ORM."""

    user_id: int
    chat_id: str
    round_id: str
    transcript: list[dict]
    members: list[str]
    default: str | None
    max_hops: int
    human_name: str
    picks: dict[str, Pick]
    deadline: float | None


def resolve(handle: str, setting: Any) -> Pick:
    """The model and role a seat speaks with. Unknown values fall back, never fail."""
    seat = ROSTER[handle]
    setting = setting if isinstance(setting, dict) else {}
    model = seat.models.get(setting.get("model")) or seat.models[seat.default]
    role = setting.get("role")
    if role is None or seat.kind == "image":
        return Pick(model)
    if role == "custom":
        brief = " ".join(str(setting.get("brief") or "").split())
        return Pick(model, short_label(brief), brief) if brief else Pick(model)
    preset = ROLES.get(role)
    return Pick(model, preset.label, preset.brief) if preset else Pick(model)


def transcript_of(session: Session, chat_id: str) -> list[dict]:
    """What the models see, filtered as the page filtered it: no notices, failed or
    unfinished replies; a picture stands in as its prompt."""
    rows = session.scalars(
        select(Message)
        .where(
            Message.chat_id == chat_id,
            Message.notice.is_(False),
            Message.status.in_(("done", "stopped")),
            Message.error.is_(None),
        )
        .order_by(Message.seq)
    )
    transcript: list[dict] = []
    for row in rows:
        if row.author != HUMAN and row.author not in ROSTER:
            continue
        if row.image_key:
            transcript.append(
                {"author": row.author, "text": "", "image_prompt": row.image_prompt}
            )
        elif row.text.strip():
            transcript.append({"author": row.author, "text": row.text})
    return transcript


def next_seq(session: Session, chat_id: str) -> int:
    # Only the holder of the chat's round lock adds messages, and the unique
    # (chat_id, seq) constraint catches anything that slips past it.
    top = session.scalar(
        select(func.coalesce(func.max(Message.seq), 0)).where(
            Message.chat_id == chat_id
        )
    )
    return int(top) + 1


@router.post("/api/chat")
def start_round(
    body: RoundRequest, user: CurrentUser, session: Db
) -> StreamingResponse:
    user_id = user.id
    chat = owned_chat(session, user_id, body.chat_id)
    count = session.scalar(
        select(func.count()).select_from(Message).where(Message.chat_id == chat.id)
    )
    if count >= MAX_MESSAGES:
        raise HTTPException(422, "This chat is full. Start a new chat.")
    members = [handle for handle in dict.fromkeys(chat.members) if handle in ROSTER]
    if not members:
        raise HTTPException(422, "Add a member to this chat first.")
    chat_id, title, seats = chat.id, chat.title, dict(chat.seats or {})
    default, max_hops = chat.default_handle, chat.max_hops

    round_id = uuid.uuid4().hex
    now = utcnow()
    claimed = session.execute(
        update(Chat)
        .where(Chat.id == chat_id, Chat.user_id == user_id, not_running(now))
        .values(round_id=round_id, round_beat=now, stop_requested=False)
        .returning(Chat.id),
        execution_options=DIRECT,
    ).first()
    if claimed is None:
        session.rollback()
        raise HTTPException(409, BUSY)

    settle_leftovers(session, chat_id)
    human = Message(
        chat_id=chat_id,
        seq=next_seq(session, chat_id),
        author=HUMAN,
        text=body.text,
        status="done",
    )
    session.add(human)
    session.flush()
    if title == NEW_TITLE:
        title = short_label(" ".join(body.text.split()), 60) or NEW_TITLE
    session.execute(
        update(Chat)
        .where(Chat.id == chat_id, Chat.user_id == user_id)
        .values(title=title, updated_at=now),
        execution_options=DIRECT,
    )
    accepted = {
        "type": "accepted",
        "round_id": round_id,
        "title": title,
        "message": api_message(human),
    }
    budget = settings.round_budget_seconds
    job = Job(
        user_id=user_id,
        chat_id=chat_id,
        round_id=round_id,
        transcript=transcript_of(session, chat_id),
        members=members,
        default=default,
        max_hops=max_hops,
        human_name=body.human_name,
        picks={handle: resolve(handle, seats.get(handle)) for handle in members},
        deadline=time.monotonic() + budget if budget else None,
    )
    session.commit()

    events: queue.Queue[dict] = queue.Queue()
    threading.Thread(
        target=_work, args=(job, events), name=f"round-{round_id[:8]}", daemon=True
    ).start()
    return StreamingResponse(
        _tail(accepted, events),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _frame(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


def _tail(first: dict, events: queue.Queue[dict]) -> Iterator[str]:
    """The worker's events as server-sent frames, with a ping when it goes quiet."""
    yield _frame(first)
    while True:
        try:
            event = events.get(timeout=PING_SECONDS)
        except queue.Empty:
            yield ": ping\n\n"
            continue
        yield _frame(event)
        if event["type"] == "done":
            return


def _stop_check(job: Job) -> Callable[[], bool]:
    """should_stop for run(): at most once a second, write the heartbeat and read Stop.

    A lost lock (the chat was deleted, or the round was taken as dead) also stops.
    """
    last = float("-inf")
    stopping = False

    def should_stop() -> bool:
        nonlocal last, stopping
        if stopping:
            return True
        moment = time.monotonic()
        if moment - last < BEAT_SECONDS:
            return False
        last = moment
        with SessionLocal.begin() as session:
            row = session.execute(
                update(Chat)
                .where(
                    Chat.id == job.chat_id,
                    Chat.user_id == job.user_id,
                    Chat.round_id == job.round_id,
                )
                .values(round_beat=utcnow())
                .returning(Chat.stop_requested),
                execution_options=DIRECT,
            ).first()
        stopping = row is None or bool(row[0])
        return stopping

    return should_stop


@dataclass
class _Reply:
    id: str
    handle: str
    text: str = ""
    flushed: float = 0.0


def _set(message_id: str, **values: Any) -> None:
    with SessionLocal.begin() as session:
        session.execute(
            update(Message).where(Message.id == message_id).values(**values),
            execution_options=DIRECT,
        )


def _insert(chat_id: str, **values: Any) -> dict:
    """Add a message at the next seq and return it as the page sees it."""
    with SessionLocal.begin() as session:
        row = Message(chat_id=chat_id, seq=next_seq(session, chat_id), **values)
        session.add(row)
        session.flush()
        return api_message(row)


def _work(job: Job, events: queue.Queue[dict]) -> None:
    hops, capped, reason = 0, [], "failed"
    reply: _Reply | None = None
    steps = run(
        job.transcript,
        job.members,
        job.default,
        job.max_hops,
        job.human_name,
        job.picks,
        should_stop=_stop_check(job),
        deadline=job.deadline,
    )
    try:
        for event in steps:
            kind = event["type"]
            if kind == "done":
                hops, capped, reason = event["hops"], event["capped"], event["reason"]
                break
            if kind == "start":
                saved = _insert(
                    job.chat_id,
                    author=event["handle"],
                    text="",
                    status="streaming",
                    asked_by=event["askedBy"],
                    model=event["model"],
                    role=event["role"],
                )
                reply = _Reply(saved["id"], event["handle"], flushed=time.monotonic())
                events.put(
                    {"type": "start", "id": saved["id"], "seq": saved["seq"], **event}
                )
                continue
            if reply is None:
                continue
            out = {**event, "id": reply.id}
            if kind == "delta":
                reply.text += event["text"]
                if time.monotonic() - reply.flushed >= FLUSH_SECONDS:
                    _set(reply.id, text=reply.text)
                    reply.flushed = time.monotonic()
            elif kind == "end":
                _set(
                    reply.id,
                    text=reply.text,
                    status="done",
                    tokens_in=event["usage"].get("in"),
                    tokens_out=event["usage"].get("out"),
                    stop_reason=event["stop"][:40] or None,
                    seconds=event["seconds"],
                    cost=event["cost"],
                )
                reply = None
            elif kind == "image":
                _set(
                    reply.id,
                    status="done",
                    image_key=event["key"],
                    image_prompt=event["prompt"],
                    seconds=event["seconds"],
                    cost=event["cost"],
                )
                del out["key"]
                reply = None
            elif kind == "error":
                _set(reply.id, text=reply.text, status="error", error=event["message"])
                reply = None
            elif kind == "stopped":
                kept = bool(reply.text.strip())
                if kept:
                    _set(reply.id, text=reply.text, status="stopped")
                else:
                    with SessionLocal.begin() as session:
                        session.execute(
                            delete(Message).where(Message.id == reply.id),
                            execution_options=DIRECT,
                        )
                out["kept"] = kept
                reply = None
            events.put(out)

        if reason in NOTICES and capped:
            waiting = ", ".join(f"@{handle}" for handle in capped)
            notice = _insert(
                job.chat_id,
                author=HUMAN,
                text=NOTICES[reason].format(hops=hops, waiting=waiting),
                status="done",
                notice=True,
            )
            events.put({"type": "notice", "message": notice})
    except Exception:
        # Whatever broke, the lock must go and the page must hear that the round ended.
        log.exception("round %s in chat %s failed", job.round_id, job.chat_id)
        reason = "failed"
    finally:
        # Closing the round closes a Bedrock stream it may still hold open.
        steps.close()
        _release(job, reply)
        events.put({"type": "done", "hops": hops, "capped": capped, "reason": reason})


def _release(job: Job, reply: _Reply | None) -> None:
    """Give the chat back. Only while the lock is still ours: a round that was taken
    as dead may already belong to a new worker."""
    try:
        with SessionLocal.begin() as session:
            released = session.execute(
                update(Chat)
                .where(
                    Chat.id == job.chat_id,
                    Chat.user_id == job.user_id,
                    Chat.round_id == job.round_id,
                )
                .values(
                    round_id=None,
                    round_beat=None,
                    stop_requested=False,
                    updated_at=utcnow(),
                )
                .returning(Chat.id),
                execution_options=DIRECT,
            ).first()
            if released is None:
                return
            if reply is not None and reply.text:
                session.execute(
                    update(Message)
                    .where(Message.id == reply.id, Message.status == "streaming")
                    .values(text=reply.text),
                    execution_options=DIRECT,
                )
            settle_leftovers(session, job.chat_id)
    except SQLAlchemyError:
        log.exception("round %s in chat %s kept its lock", job.round_id, job.chat_id)


def reset_local_rounds() -> None:
    """Local mode is one process, so at startup no round of an earlier run is alive."""
    with SessionLocal.begin() as session:
        chat_ids = list(
            session.scalars(select(Chat.id).where(Chat.round_id.is_not(None)))
        )
        for chat_id in chat_ids:
            settle_leftovers(session, chat_id)
        if chat_ids:
            session.execute(
                update(Chat)
                .where(Chat.id.in_(chat_ids))
                .values(round_id=None, round_beat=None, stop_requested=False),
                execution_options=DIRECT,
            )
