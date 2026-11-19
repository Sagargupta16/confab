"""The tables. Timestamps are naive UTC; JSON columns are always reassigned whole."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
    Text,
    UniqueConstraint,
    false,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from .db import utcnow

JSONType = JSON().with_variant(JSONB(), "postgresql")


def _new_id() -> str:
    return uuid.uuid4().hex


class Base(DeclarativeBase):
    metadata = MetaData(
        naming_convention={
            "ix": "ix_%(table_name)s_%(column_0_N_name)s",
            "uq": "uq_%(table_name)s_%(column_0_N_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s",
        }
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # NULL only for the local-mode user.
    github_id: Mapped[int | None] = mapped_column(BigInteger, unique=True)
    login: Mapped[str] = mapped_column(String(100))
    name: Mapped[str | None] = mapped_column(String(255))
    token_version: Mapped[int] = mapped_column(
        Integer, default=0, server_default=text("0")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)


class Chat(Base):
    __tablename__ = "chats"
    __table_args__ = (Index("ix_chats_user_updated", "user_id", "updated_at"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE")
    )
    title: Mapped[str] = mapped_column(
        String(120), default="New chat", server_default="New chat"
    )
    mode: Mapped[str | None] = mapped_column(String(40))
    members: Mapped[list[str]] = mapped_column(JSONType)
    seats: Mapped[dict[str, Any]] = mapped_column(JSONType)
    default_handle: Mapped[str | None] = mapped_column(String(40))
    max_hops: Mapped[int] = mapped_column(Integer, default=6, server_default=text("6"))
    round_id: Mapped[str | None] = mapped_column(String(32))
    round_beat: Mapped[datetime | None] = mapped_column(DateTime)
    stop_requested: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false()
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (UniqueConstraint("chat_id", "seq", name="uq_messages_chat_seq"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    chat_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("chats.id", ondelete="CASCADE")
    )
    seq: Mapped[int] = mapped_column(Integer)
    author: Mapped[str] = mapped_column(String(40))
    text: Mapped[str] = mapped_column(Text, default="", server_default="")
    status: Mapped[str] = mapped_column(String(12))
    notice: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    asked_by: Mapped[str | None] = mapped_column(String(40))
    model: Mapped[str | None] = mapped_column(String(160))
    role: Mapped[str | None] = mapped_column(String(80))
    tokens_in: Mapped[int | None] = mapped_column(Integer)
    tokens_out: Mapped[int | None] = mapped_column(Integer)
    seconds: Mapped[float | None] = mapped_column(Float)
    stop_reason: Mapped[str | None] = mapped_column(String(40))
    cost: Mapped[float | None] = mapped_column(Float)
    error: Mapped[str | None] = mapped_column(String(200))
    image_key: Mapped[str | None] = mapped_column(String(64))
    image_prompt: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class OAuthState(Base):
    __tablename__ = "oauth_states"
    __table_args__ = (
        Index("ix_oauth_states_created", "created_at"),
        Index("ix_oauth_states_client_created", "client", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nonce: Mapped[str] = mapped_column(String(64))
    # A rate-limit key (the caller's address), never an identity.
    client: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    __table_args__ = (Index("ix_refresh_tokens_user_created", "user_id", "created_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE")
    )
    nonce: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime)
