"""initial: users, chats, messages, oauth_states, refresh_tokens

Revision ID: 0001
Revises:
Create Date: 2026-11-19
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JSONType = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("github_id", sa.BigInteger(), nullable=True),
        sa.Column("login", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column(
            "token_version", sa.Integer(), server_default=sa.text("0"), nullable=False
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("github_id", name="uq_users_github_id"),
    )
    op.create_table(
        "chats",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column(
            "title", sa.String(length=120), server_default="New chat", nullable=False
        ),
        sa.Column("mode", sa.String(length=40), nullable=True),
        sa.Column("members", JSONType, nullable=False),
        sa.Column("seats", JSONType, nullable=False),
        sa.Column("default_handle", sa.String(length=40), nullable=True),
        sa.Column(
            "max_hops", sa.Integer(), server_default=sa.text("6"), nullable=False
        ),
        sa.Column("round_id", sa.String(length=32), nullable=True),
        sa.Column("round_beat", sa.DateTime(), nullable=True),
        sa.Column(
            "stop_requested", sa.Boolean(), server_default=sa.false(), nullable=False
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_chats_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_chats"),
    )
    op.create_index("ix_chats_user_updated", "chats", ["user_id", "updated_at"])
    op.create_table(
        "messages",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("chat_id", sa.String(length=32), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("author", sa.String(length=40), nullable=False),
        sa.Column("text", sa.Text(), server_default="", nullable=False),
        sa.Column("status", sa.String(length=12), nullable=False),
        sa.Column("notice", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("asked_by", sa.String(length=40), nullable=True),
        sa.Column("model", sa.String(length=160), nullable=True),
        sa.Column("role", sa.String(length=80), nullable=True),
        sa.Column("tokens_in", sa.Integer(), nullable=True),
        sa.Column("tokens_out", sa.Integer(), nullable=True),
        sa.Column("seconds", sa.Float(), nullable=True),
        sa.Column("stop_reason", sa.String(length=40), nullable=True),
        sa.Column("cost", sa.Float(), nullable=True),
        sa.Column("error", sa.String(length=200), nullable=True),
        sa.Column("image_key", sa.String(length=64), nullable=True),
        sa.Column("image_prompt", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["chat_id"],
            ["chats.id"],
            name="fk_messages_chat_id_chats",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_messages"),
        sa.UniqueConstraint("chat_id", "seq", name="uq_messages_chat_seq"),
    )
    op.create_table(
        "oauth_states",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("nonce", sa.String(length=64), nullable=False),
        sa.Column("client", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("consumed_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_oauth_states"),
    )
    op.create_index("ix_oauth_states_created", "oauth_states", ["created_at"])
    op.create_index(
        "ix_oauth_states_client_created", "oauth_states", ["client", "created_at"]
    )
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("nonce", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("consumed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_refresh_tokens_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_refresh_tokens"),
    )
    op.create_index(
        "ix_refresh_tokens_user_created", "refresh_tokens", ["user_id", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_refresh_tokens_user_created", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
    op.drop_index("ix_oauth_states_client_created", table_name="oauth_states")
    op.drop_index("ix_oauth_states_created", table_name="oauth_states")
    op.drop_table("oauth_states")
    op.drop_table("messages")
    op.drop_index("ix_chats_user_updated", table_name="chats")
    op.drop_table("chats")
    op.drop_table("users")
