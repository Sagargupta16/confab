# Changelog

## 0.3.0 - 2026-11-19

- confab is now an installable tool with a `confab` command. It starts the API on
  `127.0.0.1:8011`, serves the built page from the same port and opens the
  browser. `--port` and `--no-open` are its two options.
- `pnpm run package` builds a wheel (`backend/dist/`) that holds the API and the
  built page, so it runs with `uvx --from <wheel> confab` on a machine with no
  clone and no Node. No release is published yet.
- The built page now goes to `backend/src/confab/static/` (it was
  `frontend/dist/`), and `pnpm run start` runs the `confab` command.
- Run as the installed tool, pictures are saved under `.confab/images/` in the
  home folder. From a checkout they stay in `backend/images/`.

## 0.2.0 - 2026-11-19

- Roles: each text member can take a preset (Critic, Builder, Fact-checker,
  Devil's advocate, Simplifier, Moderator) or a custom sentence. The model is told
  its role and the other members see it next to the name.
- Cost: every reply shows its cost in dollars, the member list shows a cost per
  member, and a new Cost tab lists each model used with a running total. Prices
  are a snapshot of the AWS price list read on 2026-11-19 (`prices.json`); a
  model with no price row shows tokens only.
- Model dropdown: a seat now offers several models, each with its price. 12 seats
  and 35 models, all current; superseded and end-of-life models are out. GPT-6
  Astra is now GPT-6.2 Astra, and Kimi K3 is now Kimi K3.1.
- New seats: `@glm` (GLM 5.3, GLM 4.7 Flash) and `@stability`, an image member
  (Stable Image Ultra, Stable Diffusion 3.5 Large, Stable Image Core). Mention it
  and the picture is drawn from your message, saved under `backend/images/` and
  shown in the chat with a full-size view. `@all` skips image members.
- `GET /api/roster` now returns `{seats, roles, prices}`. `POST /api/chat` takes a
  `seats` map of each member's model and role, and streams an `image` event for
  a picture. Pictures are served at `/api/images/<name>.png`.
- Upgrade note: a browser that used 0.1 has a stored member list, so the new
  image member and the new GLM seat show switched off until you turn them on.

## 0.1.1 - 2026-11-19

- A failed model call now shows a fixed, plain message in the chat (throttled,
  no access, timed out and so on). The exception text, which can name endpoints
  and request ids, goes to the API log only. Fixes CodeQL `py/stack-trace-exposure`.

## 0.1.0 - 2026-11-19

First version.

- Browser group chat with ten Amazon Bedrock models as members.
- Mention routing: `@handle`, several handles, `@all`, and a starred member who
  answers when nobody is mentioned.
- Models can mention each other; a hop cap limits the replies they trigger.
- Streaming replies with input tokens, output tokens and seconds per reply, and
  a token total per model.
- Members can be switched in and out; a model that fails shows its error and
  the round continues.
