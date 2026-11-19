# Changelog

## 0.4.0 - 2026-11-19

- Chats are saved on the server. Locally that is a SQLite file, `backend/confab.db`
  from a checkout and `.confab/confab.db` in the home folder for the installed
  tool; hosted it is Postgres. Alembic migrations run when the local API starts.
  The first time the page opens, a chat an older version kept in the browser is
  copied across once as "Earlier chat".
- A chats sidebar (new chat, rename, delete), a top bar with the title, mode and
  cost, and a room panel with the members, hop cap and your name. A new chat
  starts with the room you have open. Deleting a chat deletes its pictures.
- Four modes in one pick: Open room, Debate, Build and Fact-check. They set the
  members, their roles, who answers when nobody is mentioned and the hop cap.
- Rounds run on the server. Stop now ends the round and closes the model call; a
  dropped connection no longer loses the reply, because the page catches up from
  the saved messages. One round per chat at a time; a second gets a 409.
- Hosted mode (`CONFAB_ENVIRONMENT=production`): the page on GitHub Pages as an
  installable PWA, the API on Vercel, chats in Neon Postgres, pictures in
  Cloudflare R2, and GitHub sign-in limited to an allowlist of account ids
  (`CONFAB_ALLOWED_GITHUB_IDS`). It refuses to start when a required variable is
  missing. It is not deployed yet and its workflows have not run: the migration
  and Pages jobs stay skipped until the repository variable `CONFAB_DEPLOY` is
  set to `true`.
- Local mode now answers 403 to any request that does not come from the machine
  itself, that is addressed to a name other than `localhost` or `127.0.0.1`
  (which closes DNS rebinding), or that another site's page sends.
- Breaking, API: `POST /api/chat` now takes `{chat_id, text, human_name}`; the
  server holds the transcript, the members and the roles, so the old body
  (`messages`, `members`, `seats`, `default`, `max_hops`) is gone. New routes:
  `GET` and `POST /api/chats`; `GET`, `PATCH` and `DELETE /api/chats/{chat_id}`;
  `GET /api/chats/{chat_id}/messages` (with `from_seq`) and `DELETE` on the same
  path to clear; `POST /api/chats/{chat_id}/stop`. Sign-in routes:
  `POST /api/auth/oauth/github/authorize`, `POST /api/auth/oauth/github/callback`,
  `POST /api/auth/refresh`, `GET /api/auth/me`, `POST /api/auth/logout`. Health:
  `GET /api/health` (status, version, mode) and `GET /api/health/db`.
  `GET /api/roster` also returns `modes`.
- Upgrade note: the page no longer reads its transcript, members or roles from
  `localStorage`; only the one-time import does.

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
