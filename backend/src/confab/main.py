"""HTTP API: the roster, and one streaming endpoint that runs a round of the chat."""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .chat import HUMAN, ROLES, Pick, run, short_label
from .images import IMAGE_DIR
from .roster import PRICES, ROSTER

app = FastAPI(title="confab")


class Message(BaseModel):
    author: str
    text: str = Field(default="", max_length=200_000)
    image_prompt: str | None = Field(default=None, max_length=4000)


class SeatChoice(BaseModel):
    model: str | None = None
    role: str | None = None
    brief: str = Field(default="", max_length=200)


class ChatRequest(BaseModel):
    messages: list[Message] = Field(min_length=1, max_length=2000)
    members: list[str] = Field(min_length=1)
    default: str | None = None
    max_hops: int = Field(default=6, ge=0, le=20)
    human_name: str = Field(default="You", min_length=1, max_length=40)
    seats: dict[str, SeatChoice] = Field(default_factory=dict)


def _resolve(handle: str, choice: SeatChoice | None) -> Pick:
    """The model and role a seat speaks with in this request, or a 422."""
    seat = ROSTER[handle]
    choice = choice or SeatChoice()
    model = seat.models.get(choice.model or seat.default)
    if model is None:
        raise HTTPException(422, f"unknown model for @{handle}")
    if choice.role is None or seat.kind == "image":
        return Pick(model)
    if choice.role == "custom":
        brief = " ".join(choice.brief.split())
        return Pick(model, short_label(brief), brief) if brief else Pick(model)
    role = ROLES.get(choice.role)
    if role is None:
        raise HTTPException(422, f"unknown role for @{handle}")
    return Pick(model, role.label, role.brief)


@app.get("/api/roster")
def roster() -> dict:
    return {
        "seats": [seat.public() for seat in ROSTER.values()],
        "roles": [
            {"id": role.id, "label": role.label, "brief": role.brief}
            for role in ROLES.values()
        ],
        "prices": PRICES,
    }


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

    picks = {
        handle: _resolve(handle, request.seats.get(handle))
        for handle in request.members
    }
    events = run(
        [message.model_dump() for message in request.messages],
        request.members,
        request.default,
        request.max_hops,
        request.human_name,
        picks,
    )
    return StreamingResponse(
        _server_sent(events),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _server_sent(events: Iterator[dict]) -> Iterator[str]:
    for event in events:
        yield f"data: {json.dumps(event)}\n\n"


app.mount("/api/images", StaticFiles(directory=IMAGE_DIR), name="images")

# After `pnpm run build` the API also serves the built page, so one process is enough.
_dist = Path(__file__).resolve().parents[3] / "frontend" / "dist"
if _dist.is_dir():
    app.mount("/", StaticFiles(directory=_dist, html=True), name="page")
