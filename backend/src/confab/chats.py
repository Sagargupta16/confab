"""The chats API: list, create, read, rename and re-seat, clear, delete and stop.

Every route finds its chat through owned_chat, so no query reaches another user's chat.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta
from typing import Annotated

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import ColumnElement, and_, delete, or_, select, update
from sqlalchemy.orm import Session

from .chat import HUMAN, ROLES
from .db import get_session, utcnow
from .deps import CurrentUser
from .images import store
from .models import Chat, Message
from .modes import MODE_IDS
from .roster import ROSTER

log = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/api/chats")

# A round whose worker has not written its heartbeat for this long is dead: the
# function cap is 300 s, so a live worker always beats well inside it.
STALE = timedelta(seconds=330)
MAX_MESSAGES = 2000
LIST_LIMIT = 200
NEW_TITLE = "New chat"
BUSY = "A round is already running in this chat."
IMPORTED_IMAGE = re.compile(r"/api/images/([0-9a-f]{32}\.png)")

# Statements here name their rows directly; the session never has to match them up.
DIRECT = {"synchronize_session": False}

Db = Annotated[Session, Depends(get_session)]


class SeatSetting(BaseModel):
    model: str = Field(max_length=160)
    role: str | None = Field(default=None, max_length=40)
    brief: str = Field(default="", max_length=200)


class ChatSettings(BaseModel):
    members: list[Annotated[str, Field(max_length=40)]] = Field(max_length=50)
    seats: dict[str, SeatSetting] = Field(default_factory=dict, max_length=50)
    default: str | None = Field(default=None, max_length=40)
    max_hops: int = Field(default=6, ge=0, le=20)
    mode: str | None = Field(default=None, max_length=40)


class ImportImage(BaseModel):
    url: str = Field(max_length=200)
    prompt: str = Field(default="", max_length=4000)


class ImportMessage(BaseModel):
    """A message as the page stored it before the server kept chats."""

    author: str = Field(max_length=40)
    text: str = Field(default="", max_length=200_000)
    askedBy: str | None = None
    model: str | None = None
    role: str | None = None
    usage: dict[str, int] | None = None
    seconds: float | None = None
    stop: str | None = None
    error: str | None = None
    notice: bool = False
    cost: float | None = None
    image: ImportImage | None = None


class NewChat(BaseModel):
    title: str | None = Field(default=None, max_length=120)
    settings: ChatSettings | None = None
    messages: list[ImportMessage] = Field(default_factory=list, max_length=MAX_MESSAGES)


class ChatPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    settings: ChatSettings | None = None


def iso(moment: datetime) -> str:
    """A naive UTC timestamp as ISO 8601 ending in Z."""
    return f"{moment.isoformat(timespec='milliseconds')}Z"


def not_running(now: datetime) -> ColumnElement[bool]:
    """SQL for a chat with no live round: no lock, or a lock whose worker died."""
    return or_(
        Chat.round_id.is_(None),
        Chat.round_beat.is_(None),
        Chat.round_beat < now - STALE,
    )


def is_running(chat: Chat, now: datetime) -> bool:
    return (
        chat.round_id is not None
        and chat.round_beat is not None
        and chat.round_beat >= now - STALE
    )


def owned_chat(session: Session, user_id: int, chat_id: str) -> Chat:
    """The chat with this id if it belongs to this user, else a 404."""
    chat = session.scalars(
        select(Chat).where(Chat.id == chat_id, Chat.user_id == user_id)
    ).first()
    if chat is None:
        raise HTTPException(404, "No such chat.")
    return chat


def api_message(row: Message) -> dict:
    usage = (
        {"in": row.tokens_in or 0, "out": row.tokens_out or 0}
        if row.tokens_in is not None or row.tokens_out is not None
        else None
    )
    image = (
        {"url": store.url(row.image_key), "prompt": row.image_prompt or ""}
        if row.image_key
        else None
    )
    return {
        "id": row.id,
        "seq": row.seq,
        "author": row.author,
        "text": row.text,
        "status": row.status,
        "notice": row.notice,
        "askedBy": row.asked_by,
        "model": row.model,
        "role": row.role,
        "usage": usage,
        "seconds": row.seconds,
        "stop": row.stop_reason,
        "cost": row.cost,
        "error": row.error,
        "image": image,
    }


def chat_summary(chat: Chat, now: datetime) -> dict:
    return {
        "id": chat.id,
        "title": chat.title,
        "mode": chat.mode,
        "running": is_running(chat, now),
        "created_at": iso(chat.created_at),
        "updated_at": iso(chat.updated_at),
    }


def chat_head(chat: Chat, now: datetime) -> dict:
    return {
        **chat_summary(chat, now),
        "settings": {
            "members": chat.members,
            "seats": chat.seats,
            "default": chat.default_handle,
            "max_hops": chat.max_hops,
            "mode": chat.mode,
        },
    }


def messages_of(session: Session, chat: Chat, from_seq: int = 0) -> list[Message]:
    return list(
        session.scalars(
            select(Message)
            .where(Message.chat_id == chat.id, Message.seq >= from_seq)
            .order_by(Message.seq)
        )
    )


def settle_leftovers(session: Session, chat_id: str) -> None:
    """Replies a dead worker left streaming: keep the words as stopped, drop the rest."""
    session.execute(
        delete(Message).where(
            Message.chat_id == chat_id,
            Message.status == "streaming",
            Message.text == "",
        ),
        execution_options=DIRECT,
    )
    session.execute(
        update(Message)
        .where(Message.chat_id == chat_id, Message.status == "streaming")
        .values(status="stopped"),
        execution_options=DIRECT,
    )


def _unknown(line: str, value: object) -> HTTPException:
    """A 422 with a fixed line; the value that failed goes to the API log only."""
    log.info("chat settings refused: %s %r", line, value)
    return HTTPException(422, line)


def _columns(value: ChatSettings) -> dict:
    """ChatSettings as chat columns, or a 422 for anything the roster does not know."""
    members = list(dict.fromkeys(value.members))
    unknown = [handle for handle in members if handle not in ROSTER]
    if unknown:
        raise _unknown("Unknown member.", unknown)
    seats: dict[str, dict] = {}
    for handle, seat in value.seats.items():
        if handle not in ROSTER:
            raise _unknown("Unknown seat.", handle)
        if seat.model not in ROSTER[handle].models:
            raise _unknown("Unknown model.", (handle, seat.model))
        if seat.role is not None and seat.role != "custom" and seat.role not in ROLES:
            raise _unknown("Unknown role.", (handle, seat.role))
        seats[handle] = {"model": seat.model, "role": seat.role, "brief": seat.brief}
    if value.default is not None and value.default not in ROSTER:
        raise _unknown("Unknown member.", value.default)
    if value.mode is not None and value.mode not in MODE_IDS:
        raise _unknown("Unknown mode.", value.mode)
    return {
        "members": members,
        "seats": seats,
        "default_handle": value.default,
        "max_hops": value.max_hops,
        "mode": value.mode,
    }


def _cut(value: str | None, limit: int) -> str | None:
    """An imported text field cut to its column, or None when empty."""
    return value[:limit] if value else None


def _imported(chat_id: str, entries: list[ImportMessage]) -> list[Message]:
    rows: list[Message] = []
    for entry in entries:
        if entry.author != HUMAN and entry.author not in ROSTER:
            continue
        image_key = None
        if entry.image is not None:
            match = IMPORTED_IMAGE.fullmatch(entry.image.url)
            if match is None:
                continue
            image_key = match.group(1)
        usage = entry.usage or {}
        rows.append(
            Message(
                chat_id=chat_id,
                seq=len(rows) + 1,
                author=entry.author,
                text=entry.text,
                status="error" if entry.error else "done",
                notice=entry.notice,
                asked_by=entry.askedBy if entry.askedBy in ROSTER else None,
                model=_cut(entry.model, 160),
                role=_cut(entry.role, 80),
                tokens_in=usage.get("in"),
                tokens_out=usage.get("out"),
                seconds=entry.seconds,
                stop_reason=_cut(entry.stop, 40),
                cost=entry.cost,
                error=_cut(entry.error, 200),
                image_key=image_key,
                image_prompt=entry.image.prompt if entry.image else None,
            )
        )
    return rows


@router.get("")
def list_chats(user: CurrentUser, session: Db) -> dict:
    now = utcnow()
    chats = session.scalars(
        select(Chat)
        .where(Chat.user_id == user.id)
        .order_by(Chat.updated_at.desc())
        .limit(LIST_LIMIT)
    )
    return {"chats": [chat_summary(chat, now) for chat in chats]}


@router.post("", status_code=201)
def create_chat(body: NewChat, user: CurrentUser, session: Db) -> dict:
    if body.settings is not None:
        columns = _columns(body.settings)
    else:
        columns = {
            "members": [handle for handle, seat in ROSTER.items() if seat.joined],
            "seats": {},
            "default_handle": None,
            "max_hops": 6,
            "mode": None,
        }
    now = utcnow()
    title = " ".join((body.title or "").split()) or NEW_TITLE
    chat = Chat(user_id=user.id, title=title, created_at=now, updated_at=now, **columns)
    session.add(chat)
    session.flush()
    rows = _imported(chat.id, body.messages)
    session.add_all(rows)
    session.flush()
    result = {**chat_head(chat, now), "messages": [api_message(row) for row in rows]}
    session.commit()
    return result


@router.get("/{chat_id}")
def get_chat(chat_id: str, user: CurrentUser, session: Db) -> dict:
    chat = owned_chat(session, user.id, chat_id)
    rows = messages_of(session, chat)
    return {**chat_head(chat, utcnow()), "messages": [api_message(row) for row in rows]}


@router.patch("/{chat_id}")
def patch_chat(chat_id: str, body: ChatPatch, user: CurrentUser, session: Db) -> dict:
    chat = owned_chat(session, user.id, chat_id)
    if body.title is not None:
        title = " ".join(body.title.split())
        if not title:
            raise HTTPException(422, "The title is empty.")
        # A rename moves the chat up the list; a settings change does not.
        if title != chat.title:
            chat.title = title
            chat.updated_at = utcnow()
    if body.settings is not None:
        # Reassigned whole, so the JSON columns are always written back.
        for name, value in _columns(body.settings).items():
            setattr(chat, name, value)
    session.flush()
    result = chat_head(chat, utcnow())
    session.commit()
    return result


@router.delete("/{chat_id}", status_code=204)
def delete_chat(chat_id: str, user: CurrentUser, session: Db) -> Response:
    chat = owned_chat(session, user.id, chat_id)
    keys = list(
        session.scalars(
            select(Message.image_key).where(
                Message.chat_id == chat.id, Message.image_key.is_not(None)
            )
        )
    )
    # The not-running test sits in the DELETE itself, so a round claimed in between wins.
    deleted = session.execute(
        delete(Chat)
        .where(Chat.id == chat.id, Chat.user_id == user.id, not_running(utcnow()))
        .returning(Chat.id),
        execution_options=DIRECT,
    ).first()
    if deleted is None:
        session.rollback()
        raise HTTPException(409, "Stop the round first.")
    # An imported chat names its pictures by key, so another chat may share a file;
    # keep any picture a message anywhere still points at. The cascade has run by now.
    shared = (
        set(
            session.scalars(
                select(Message.image_key).where(Message.image_key.in_(keys))
            )
        )
        if keys
        else set()
    )
    session.commit()
    for key in sorted(set(keys) - shared):
        try:
            store.delete(key)
        except (ClientError, BotoCoreError, OSError) as error:
            log.warning("picture %s of a deleted chat not removed: %s", key, error)
    return Response(status_code=204)


@router.delete("/{chat_id}/messages", status_code=204)
def clear_chat(chat_id: str, user: CurrentUser, session: Db) -> Response:
    chat = owned_chat(session, user.id, chat_id)
    now = utcnow()
    # Taking the row first keeps a round from starting while the messages go.
    taken = session.execute(
        update(Chat)
        .where(Chat.id == chat.id, Chat.user_id == user.id, not_running(now))
        .values(updated_at=now)
        .returning(Chat.id),
        execution_options=DIRECT,
    ).first()
    if taken is None:
        session.rollback()
        raise HTTPException(409, "Stop the round first.")
    session.execute(
        delete(Message).where(Message.chat_id == chat.id), execution_options=DIRECT
    )
    session.commit()
    return Response(status_code=204)


@router.get("/{chat_id}/messages")
def get_messages(
    chat_id: str,
    user: CurrentUser,
    session: Db,
    from_seq: Annotated[int, Query(ge=0)] = 0,
) -> dict:
    chat = owned_chat(session, user.id, chat_id)
    rows = messages_of(session, chat, from_seq)
    return {
        "messages": [api_message(row) for row in rows],
        "running": is_running(chat, utcnow()),
    }


@router.post("/{chat_id}/stop")
def stop_round(chat_id: str, user: CurrentUser, session: Db) -> dict:
    chat = owned_chat(session, user.id, chat_id)
    now = utcnow()
    stopping = session.execute(
        update(Chat)
        .where(
            Chat.id == chat.id,
            Chat.user_id == user.id,
            and_(Chat.round_id.is_not(None), Chat.round_beat >= now - STALE),
        )
        .values(stop_requested=True)
        .returning(Chat.id),
        execution_options=DIRECT,
    ).first()
    session.commit()
    return {"stopping": stopping is not None}
