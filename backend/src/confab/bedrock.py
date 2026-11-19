"""Streaming calls to the Bedrock Converse API, one request shape for every model."""

import os
import sys
from collections.abc import Iterator
from functools import cache

import boto3
from botocore.config import Config

from .roster import Member

TOKEN_VARIABLE = "AWS_BEARER_TOKEN_BEDROCK"
REGION = (
    os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-east-1"
)


def _windows_user_variable(name: str) -> str | None:
    """A variable from the Windows user environment, or None. Never logged."""
    if sys.platform != "win32":
        return None
    import winreg

    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
            return winreg.QueryValueEx(key, name)[0] or None
    except OSError:
        return None


def _ensure_token() -> None:
    # boto3 switches to bearer auth whenever the variable exists, even when it is
    # empty. A parent process that does not pass the user's key on (the Claude
    # desktop app, for one) leaves it missing, so read the user environment first
    # and otherwise drop the variable so the normal credential chain can answer.
    if os.environ.get(TOKEN_VARIABLE, "").strip():
        return
    token = _windows_user_variable(TOKEN_VARIABLE)
    if token:
        os.environ[TOKEN_VARIABLE] = token
    else:
        os.environ.pop(TOKEN_VARIABLE, None)


@cache
def _client():
    _ensure_token()
    return boto3.client(
        "bedrock-runtime",
        region_name=REGION,
        config=Config(
            read_timeout=300, retries={"max_attempts": 2, "mode": "standard"}
        ),
    )


def stream_reply(member: Member, system: str, messages: list[dict]) -> Iterator[dict]:
    """Yield {"delta": text} pieces, then one {"usage": ..., "stop": ...}."""
    inference: dict = {"maxTokens": member.max_tokens}
    if member.temperature:
        inference["temperature"] = 0.7
    response = _client().converse_stream(
        modelId=member.model_id,
        system=[{"text": system}],
        messages=messages,
        inferenceConfig=inference,
    )
    usage: dict = {}
    stop = ""
    for event in response["stream"]:
        if "contentBlockDelta" in event:
            # Reasoning models also send reasoningContent deltas; only text is shown.
            text = event["contentBlockDelta"]["delta"].get("text")
            if text:
                yield {"delta": text}
        elif "messageStop" in event:
            stop = event["messageStop"].get("stopReason", "")
        elif "metadata" in event:
            usage = event["metadata"].get("usage", {})
    yield {
        "usage": {
            "in": usage.get("inputTokens", 0),
            "out": usage.get("outputTokens", 0),
        },
        "stop": stop,
    }
