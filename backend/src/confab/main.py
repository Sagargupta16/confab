"""HTTP API: the roster, and one streaming endpoint that runs a round of the chat."""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .chat import HUMAN, run
from .roster import ROSTER

app = FastAPI(title="confab")


class Message(BaseModel):
    author: str
    text: str = Field(max_length=200_000)


class ChatRequest(BaseModel):
    messages: list[Message] = Field(min_length=1, max_length=2000)
    members: list[str] = Field(min_length=1)
    default: str | None = None
    max_hops: int = Field(default=6, ge=0, le=20)
    human_name: str = Field(default="You", min_length=1, max_length=40)


@app.get("/api/roster")
def roster() -> list[dict]:
    return [member.public() for member in ROSTER.values()]


@app.post("/api/chat")
def chat(request: ChatRequest) -> StreamingResponse:
    unknown = [handle for handle in request.members if handle not in ROSTER]
    if unknown:
        raise HTTPException(422, f"unknown members: {', '.join(unknown)}")
    for message in request.messages:
        if message.author != HUMAN and message.author not in ROSTER:
            raise HTTPException(422, f"unknown author: {message.author}")
    if request.messages[-1].author != HUMAN:
        raise HTTPException(422, "the newest message must be yours")

    events = run(
        [message.model_dump() for message in request.messages],
        request.members,
        request.default,
        request.max_hops,
        request.human_name,
    )
    return StreamingResponse(
        _server_sent(events),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _server_sent(events: Iterator[dict]) -> Iterator[str]:
    for event in events:
        yield f"data: {json.dumps(event)}\n\n"


# After `pnpm run build` the API also serves the built page, so one process is enough.
_dist = Path(__file__).resolve().parents[3] / "frontend" / "dist"
if _dist.is_dir():
    app.mount("/", StaticFiles(directory=_dist, html=True), name="page")
