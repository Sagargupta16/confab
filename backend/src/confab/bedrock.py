"""Streaming calls to the Bedrock Converse API, one request shape for every model."""

import base64
import json
import logging
import os
import sys
from collections.abc import Iterator
from functools import cache

import boto3
from botocore.config import Config

from .roster import Model

log = logging.getLogger("uvicorn.error")

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


class ImageError(Exception):
    """The image call went through but gave no picture."""


class ImageRefused(ImageError):
    pass


class ImageMissing(ImageError):
    pass


@cache
def _client(region: str):
    _ensure_token()
    return boto3.client(
        "bedrock-runtime",
        region_name=region,
        config=Config(
            read_timeout=300, retries={"max_attempts": 2, "mode": "standard"}
        ),
    )


def stream_reply(model: Model, system: str, messages: list[dict]) -> Iterator[dict]:
    """Yield {"delta": text} and {"tick": True} pieces, then one {"usage", "stop"}.

    A tick stands for a delta with no text (a reasoning model thinking), so the caller
    can check for Stop while nothing is shown. Closing this generator closes the stream.
    """
    inference: dict = {"maxTokens": model.max_tokens}
    if model.temperature:
        inference["temperature"] = 0.7
    response = _client(model.region or REGION).converse_stream(
        modelId=model.id,
        system=[{"text": system}],
        messages=messages,
        inferenceConfig=inference,
    )
    usage: dict = {}
    stop = ""
    stream = response["stream"]
    try:
        for event in stream:
            if "contentBlockDelta" in event:
                # Reasoning models also send reasoningContent deltas; only text is shown.
                text = event["contentBlockDelta"]["delta"].get("text")
                yield {"delta": text} if text else {"tick": True}
            elif "messageStop" in event:
                stop = event["messageStop"].get("stopReason", "")
            elif "metadata" in event:
                usage = event["metadata"].get("usage", {})
    finally:
        stream.close()
    yield {
        "usage": {
            "in": usage.get("inputTokens", 0),
            "out": usage.get("outputTokens", 0),
        },
        "stop": stop,
    }


def generate_image(model: Model, prompt: str) -> bytes:
    """One PNG from a Stability model through InvokeModel, in the model's own region."""
    body: dict = {"prompt": prompt, "aspect_ratio": "1:1", "output_format": "png"}
    # SD 3.5 needs the mode field; Ultra and Core reject it.
    if model.id.startswith("stability.sd3"):
        body["mode"] = "text-to-image"
    response = _client(model.region or REGION).invoke_model(
        modelId=model.id,
        body=json.dumps(body),
        contentType="application/json",
        accept="application/json",
    )
    result = json.loads(response["body"].read())
    reasons = [reason for reason in result.get("finish_reasons") or [] if reason]
    if reasons:
        log.warning("image model %s finished with %s", model.id, reasons)
        raise ImageRefused
    images = result.get("images") or []
    if not images:
        raise ImageMissing
    return base64.b64decode(images[0])
