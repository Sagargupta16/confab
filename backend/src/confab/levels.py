"""Cost levels: one pick that sets every seat's model by price. Nothing is stored; the
page applies a level as ordinary seat model choices."""

from __future__ import annotations

import math

from .roster import ROSTER, Model, Seat


def figure(model: Model) -> float | None:
    """A model's price figure: in + out per million tokens for text, the price of one
    picture for images. None without a price row."""
    price = model.price
    if not price:
        return None
    if "image" in price:
        return price["image"]
    if "in" in price and "out" in price:
        return price["in"] + price["out"]
    return None


def _pick(seat: Seat) -> dict[str, str]:
    """The cheap, medium and intense model ids of one seat."""
    top = seat.models[seat.default]
    priced = [(model, figure(model)) for model in seat.models.values()]
    priced = [(model, value) for model, value in priced if value is not None]
    if not priced:
        return {"cheap": top.id, "medium": top.id, "intense": top.id}
    cheap, low = min(priced, key=lambda pair: pair[1])
    high = figure(top)
    medium = top
    if high is not None and low > 0:
        middle = [(model, value) for model, value in priced if low < value < high]
        if middle:
            # Closest to the geometric mean, so "medium" means a middle step in price,
            # not the average, which the most expensive model would dominate.
            target = math.log(math.sqrt(low * high))
            medium = min(middle, key=lambda pair: abs(math.log(pair[1]) - target))[0]
    return {"cheap": cheap.id, "medium": medium.id, "intense": top.id}


def _levels() -> list[dict]:
    picks = {handle: _pick(seat) for handle, seat in ROSTER.items()}
    levels = [
        {
            "id": level_id,
            "label": label,
            "description": description,
            "models": {handle: chosen[level_id] for handle, chosen in picks.items()},
        }
        for level_id, label, description in (
            ("cheap", "Cheap", "The lowest-priced model of every seat."),
            ("medium", "Medium", "A mid-priced model of every seat."),
            ("intense", "Intense", "Every seat's top model."),
        )
    ]
    for level in levels:
        if set(level["models"]) != set(ROSTER):
            raise ValueError(f"level {level['id']} does not cover every seat")
        for handle, model_id in level["models"].items():
            if model_id not in ROSTER[handle].models:
                raise ValueError(
                    f"level {level['id']}: {model_id} is not a model of @{handle}"
                )
    return levels


LEVELS: list[dict] = _levels()
