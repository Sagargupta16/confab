# CLAUDE.md

> This file stacks on top of the workspace root at `C:\Code\GitHub\`:
> - Root [`CLAUDE.md`](../../CLAUDE.md) -- voice, rules, routing map, references, skills, slash commands, conventions.
> - Root [`MEMORY.md`](../../MEMORY.md) -- live facts across repos.
> - Root [`STATUS.md`](../../STATUS.md) -- live PR/CI/security dashboard.
> - [`.claude/resources/`](../../.claude/resources/README.md) -- deep reference for collaboration, workflow, git, OSS, debugging, voice.
>
> Read those first. The guidance below only adds **repo-specific context** -- it does not override anything in the root.

## Project

confab is a group chat in the browser where the other members are Amazon Bedrock models: Sagar mentions one and it answers, and the models can mention and answer each other up to a hop cap. A seat has a model dropdown and, for text seats, a role; a member can also be an image model (`@stability`) that draws from the message that mentions it. Replies show their cost, priced from `prices.json`.

Two shapes of one codebase. Local mode (the `confab` command, no login, his own Bedrock account) is the default. Hosted mode (`CONFAB_ENVIRONMENT=production`) is the same API behind GitHub sign-in limited to an allowlist, so he can use it from his phone as a PWA. Hosted mode is written (0.4.0) but not deployed yet and no workflow has run.

Chats are saved on the server, in either mode. The server runs each round on a worker thread, so a dropped connection loses nothing.

## Stack

- **Language**: Python 3.14 (backend), TypeScript 7 (frontend)
- **Framework**: FastAPI + boto3 (Converse API), React 19 + Vite 8 + Tailwind 4 + motion, vite-plugin-pwa
- **Database**: SQLite locally (`backend/confab.db`, or `.confab/confab.db` in the home folder for the installed tool); Neon Postgres hosted. SQLAlchemy 2 with psycopg 3, Alembic for the schema.
- **Package manager**: uv (backend), pnpm (root and frontend, two separate installs like ledger-sync)
- **Deploy target**: local, plus the hosted shape: page on GitHub Pages, API on Vercel, chats in Neon, pictures in Cloudflare R2 (see Deploy)

## Run

```
pnpm install
pnpm run setup
pnpm run dev
```

`pnpm run dev` starts the API on 8011 and the page on <http://localhost:5183> (Vite proxies `/api`). `pnpm run build` then `pnpm run start` serves the built page from the API on 8011 alone. `pnpm run package` builds the wheel in `backend/dist/`; `uvx --from <wheel> confab` runs it with no checkout.

## Test

```
pnpm run type-check
```

No test suite yet. CI (`.github/workflows/ci.yml`) type-checks and builds the frontend (also as the GitHub Pages bundle), imports the backend app, runs `alembic upgrade head` and `alembic check` on SQLite and on Postgres 18, checks that production settings with no secrets refuse to import, greps for absolute `confab` imports, and checks that the four version places agree (`package.json`, `frontend/package.json`, `backend/pyproject.toml`, `backend/src/confab/__init__.py`).

## Entry points

- `backend/src/confab/main.py` -- FastAPI app: health, roster, the chats and rounds routers, the sign-in routers (hosted only), `/api/images` (disk only) and the built page when `backend/src/confab/static/` exists (Vite's `outDir`, git-ignored, packed into the wheel). Vercel loads it as `src.confab.main:app`.
- `backend/src/confab/cli.py` -- the `confab` command (`[project.scripts]`): uvicorn on `127.0.0.1`, `--port`, `--no-open`.
- `frontend/src/main.tsx` -- mounts `App`.

## Key files

- `backend/src/confab/chat.py` -- the brain: the six role presets, mention parsing, each model's view of the transcript, the round loop and the hop cap.
- `backend/src/confab/models.json` -- the seats: handle, provider, `kind` (`text` or `image`), colour, `joined`, `default` model id and a `models` list. A text model has id, name, `maxTokens` and `temperature`; an image model has id, name and `region`.
- `backend/src/confab/prices.json` -- USD per million tokens (`in`, `out`) or per image (`image`) by model id, plus `checked`, `source` and `currency`. `roster.py` refuses a row for a model that is not in `models.json`.
- `backend/src/confab/roster.py` -- loads both files and works out the cost of a reply.
- `backend/src/confab/bedrock.py` -- the streaming Converse call, the image InvokeModel call and the credential fallback.
- `backend/src/confab/images.py` -- saves pictures under random names: `backend/images/` (git-ignored) from a checkout, `~/.confab/images/` when installed (it tells the two apart by `backend/pyproject.toml`).
- `backend/src/confab/settings.py` -- every environment variable (`CONFAB_` prefix, R2 and Bedrock names as is). `problems()` lists why hosted mode must not start; `_load()` raises, so an incomplete production import fails.
- `backend/src/confab/models.py`, `db.py`, `migrations/` -- the tables (`users`, `chats`, `messages`, `oauth_states`, `refresh_tokens`), the engine and sessions, and the Alembic revisions (`alembic.ini` is in `backend/`). `db.migrate_local()` upgrades the SQLite file at startup; hosted schema changes run only in the migrate workflow.
- `backend/src/confab/chats.py` -- the chats routes. Every one finds its chat through `owned_chat`, so no query reaches another user's chat.
- `backend/src/confab/rounds.py` -- `POST /api/chat`: claims the chat (`round_id`, `round_beat`), saves your message, runs the round on a worker thread that saves each reply as it streams. The response only tails the worker's queue.
- `backend/src/confab/modes.py` -- the four room presets, checked against the roster at import.
- `backend/src/confab/levels.py` -- the three cost levels (cheap, medium, intense): one model id per seat for each, worked out from `prices.json` at import. Cheap is the seat's lowest-priced model, intense its default, medium the priced model nearest the geometric mean of the two. Nothing is stored for a level.
- `backend/src/confab/deps.py` -- `CurrentUser`: the local user in local mode, a verified allowlisted user hosted. The branch is fixed at import.
- `backend/src/confab/auth.py`, `oauth.py`, `github.py`, `tokens.py` -- sign-in, one-use refresh tokens, the GitHub calls and the JWTs.
- `frontend/src/cost.ts` -- adds up cost per model and formats money; `components/CostTable.tsx` and `components/Sidebar.tsx` are the Cost tab.
- `frontend/src/App.tsx` -- chat state, the round, catch-up polling, the layout.
- `frontend/src/auth.ts`, `AuthGate.tsx`, `client.ts`, `api.ts`, `wire.ts` -- sign-in and tokens, the mode gate, the chats API calls, the roster call and one-time import of an older browser chat, and the JSON shapes.
- `frontend/src/mentions.ts` -- the mention rule; keep it identical to `MENTION` in `chat.py`.
- `frontend/src/index.css` -- the design tokens (the house system) and the shell's classes. The UI rules are in [`.claude/rules/frontend-ui.md`](.claude/rules/frontend-ui.md), which loads for any file under `frontend/src/`.
- `frontend/src/components/ModelMenu.tsx`, `LevelControl.tsx` -- the model picker (a native popover listing model names, no prices) and the Cheap, Medium, Intense control. `App.tsx` derives the active level from the seats' models and applies a level through the settings PATCH.
- `frontend/src/components/Button.tsx`, `ConfirmDialog.tsx`, `CountUp.tsx`, `Panel.tsx` -- the shared shell pieces.

## API routes

- `GET /api/health` -- `{status, version, mode}`; `GET /api/health/db` -- 200 when the database answers, else 503.
- `GET /api/roster` -- `{seats, roles, prices, modes, levels}`.
- `GET /api/chats` -- the user's chats, newest first (up to 200); `POST /api/chats` -- create one, optionally with `settings` and imported `messages`.
- `GET`, `PATCH` (`title`, `settings`) and `DELETE /api/chats/{chat_id}` -- read with messages, rename or re-seat, delete (409 while a round runs).
- `GET /api/chats/{chat_id}/messages?from_seq=` -- messages from a seq plus `running`; `DELETE` on the same path clears the chat (409 while a round runs).
- `POST /api/chats/{chat_id}/stop` -- asks the running round to stop.
- `POST /api/chat` -- body `{chat_id, text, human_name}`. Streams `accepted`, then `start`, `delta` and `end` (text), `image` (picture), `error` or `stopped` per reply, a `notice` at the hop cap or time limit, then `done` with the hops used and any members left unanswered. 409 when a round is already running in that chat.
- Hosted only: `POST /api/auth/oauth/github/authorize`, `POST /api/auth/oauth/github/callback`, `POST /api/auth/refresh`, `GET /api/auth/me`, `POST /api/auth/logout`.
- `/api/images/<name>.png` -- a saved picture, served as static files (disk storage only; with R2 the picture link points at the bucket).

## Auth

Bedrock, both modes: an API key as a bearer token in `AWS_BEARER_TOKEN_BEDROCK`, region `AWS_REGION` (default `us-east-1`); boto3 picks the token up by itself. When the variable is missing or empty, `bedrock.py` reads it from the Windows user environment (the Claude desktop app does not pass it to processes it starts), and otherwise removes it so the normal AWS credential chain answers. Same fallback as `community/bedrock-multi-model-mcp`.

**Local mode** (`CONFAB_ENVIRONMENT` unset or `local`):

- No login. `deps.py` returns one local user (`github_id` NULL, login `local`).
- Loopback only: the `confab` command binds `127.0.0.1`, and `_LoopbackOnly` in `main.py` answers 403 to any client that is not the machine itself. The sign-in code is never imported.

**Hosted mode** (`CONFAB_ENVIRONMENT=production`):

1. The page makes a PKCE verifier and posts its S256 challenge to `/api/auth/oauth/github/authorize`; the API returns a signed, one-use `state` (10 minutes) and the GitHub settings.
2. The browser goes to GitHub and returns to `<CONFAB_FRONTEND_URL>/auth/callback/github`.
3. The page posts `{code, state, code_verifier}` to `/api/auth/oauth/github/callback`; the API consumes the state first, then exchanges the code (scope `read:user`) and reads the account.
4. An account id not in `CONFAB_ALLOWED_GITHUB_IDS` gets 403 and no user row. Otherwise the API upserts the user and signs an access token (30 minutes) and a refresh token (7 days, one-use; a replay after 60 s signs the user out everywhere).
5. The page sends the access token as a bearer on every call and refreshes through `/api/auth/refresh`. The allowlist is checked again on every request and every refresh.

Tokens live in the browser's `localStorage` under `confab.auth` (the PKCE attempt under `confab.oauth-attempt`). No cookies. The Bedrock key, the JWT secret and the database URL live only in the host's settings.

## Deploy

Not deployed yet; no workflow has run. Hosts and names:

- API: Vercel project `confab-api` in team `sagargupta16s-projects`, public address <https://confab-api.vercel.app>. The team alias `confab-api-sagargupta16s-projects.vercel.app` sits behind Vercel Authentication, so it is not the address to use. `backend/vercel.json` sets region `iad1` and `maxDuration` 300 for `src/confab/main.py`; the entrypoint is in `backend/pyproject.toml`.
- Page: GitHub Pages at <https://sagargupta.online/confab/> (Vite `base` is `/confab/` when `GITHUB_PAGES=true`).
- Chats: Neon Postgres. Pictures: a public Cloudflare R2 bucket.

Variables (Config = not secret). Runtime ones are set by Sagar in the Vercel project; none is in the repo:

| Name | Kind | Set by |
| --- | --- | --- |
| `CONFAB_ENVIRONMENT` | Config | Vercel project |
| `CONFAB_DATABASE_URL` | Secret | Vercel project (Neon pooler URL); the GitHub secret of the same name (direct Neon host) is for the migrate job |
| `CONFAB_JWT_SECRET_KEY` | Secret | Vercel project |
| `CONFAB_GITHUB_CLIENT_ID` | Config | Vercel project |
| `CONFAB_GITHUB_CLIENT_SECRET` | Secret | Vercel project |
| `CONFAB_ALLOWED_GITHUB_IDS` | Config | Vercel project |
| `CONFAB_FRONTEND_URL` | Config | Vercel project |
| `CONFAB_CORS_ORIGINS` | Config, optional | Vercel project |
| `AWS_BEARER_TOKEN_BEDROCK` | Secret | Vercel project |
| `AWS_REGION` | Config, optional | Vercel project |
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL` | Config | Vercel project |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Secret | Vercel project |
| `VITE_API_BASE_URL` | Config | GitHub repository variable, read by `deploy-frontend.yml` |
| `CONFAB_DEPLOY` | Config | GitHub repository variable, the deploy switch: `migrate` and `deploy-frontend` in `ci.yml` run only when it is `true`. Unset as of 2026-11-19, so a push to `main` runs the three check jobs and skips both. Set it only after the Neon secret, every Vercel secret and the linked Vercel project exist: `gh variable set CONFAB_DEPLOY --repo Sagargupta16/confab --body true` |

OAuth apps (GitHub): "confab (prod)", callback <https://sagargupta.online/confab/auth/callback/github>; "confab (dev)", callback <http://localhost:5183/auth/callback/github>. The callback is `CONFAB_FRONTEND_URL` plus `/auth/callback/github`, so each environment's `CONFAB_FRONTEND_URL` must match its app.

Workflow chain, on a push to `main` with `CONFAB_DEPLOY` set to `true`: `ci.yml` (frontend, backend, postgres-migrations) -> `migrate.yml` (`alembic upgrade head` against the GitHub secret, in the `production` environment) -> `deploy-frontend.yml` (builds the page, then waits up to 10 minutes for `/api/health` to report the frontend's version, mode `hosted`, and `/api/health/db` to say connected, before publishing Pages).

Sagar's steps, not the repo's: create the Neon database, the R2 bucket and the two OAuth apps; set every variable above and the GitHub secret and repository variable; allow Pages for the repo; merge; and watch the first live run.

## Gotchas

- The PyPI name `confab` belongs to another project (version 1.4 on 2026-11-19). Never write `uvx confab` or `pip install confab` in docs; nothing is published yet, and the name to publish under is Sagar's call.
- The backend is a real package since 0.3.0 (`uv_build`, `[project.scripts]`). The wheel picks up `static/` only if `pnpm run build` ran first, so build wheels with `pnpm run package`, never `uv build` alone.
- Model ids and the `temperature` flag come from `community/bedrock-multi-model-mcp/src/data/text-models.json`, where each id was probed live. Reasoning models (Claude 5, GPT-6, Grok, Kimi) reject `temperature`; a wrong flag fails the call.
- Reasoning models spend output tokens on thinking, so a small `maxTokens` gives an empty reply that looks like a failure. Keep their cap at 16384.
- Models do not know who they are unless told: without the system prompt in `chat.py`, DeepSeek answered as the user and MiniMax as Claude (probe, 2026-11-19).
- Kimi K3.1 and GLM 5.3 returned `ThrottlingException` on every call on 2026-11-19, so those seats ship with `joined: false` and their throttled models have no price row.
- A model whose `temperature` support is unknown is stored as `false`: leaving the field out always works, sending it to a model that rejects it fails the call.
- Image models go through InvokeModel in `us-west-2` (the model's `region`), while text stays on Converse in `AWS_REGION` (default `us-east-1`). SD 3.5 Large needs `"mode": "text-to-image"` in the body; Ultra and Core reject it.
- Prices use the regional `us.` figure, not the cheaper global one. The long-prompt tier of Haiku 5.5 and the GPT-6 models is not applied.
- GPT-6 Astra was superseded by GPT-6.2 Astra; superseded and legacy models stay out of `models.json`. So does any model AWS lists as Legacy or with an end-of-life date (his ask, 2026-11-20): Devstral 2 and GLM 4.7 Flash were removed that day (Legacy 2026-09-30, EOL 2027-03-30). The check is the raw page <https://docs.aws.amazon.com/bedrock/latest/userguide/model-lifecycle-legacy.md> searched for each id without its `us.` prefix; it listed 0 of the remaining 33. Models launched on or after 2026-09-07 carry their dates on their model cards instead, which were not read. Re-run it before adding a model. A saved chat that still names a removed model falls back to the seat's default (`resolve` in `rounds.py`).
- Since 0.4.0 the page reads `confab.messages`, `confab.seats`, `confab.joined`, `confab.default` and `confab.maxHops` only in the one-time import (`api.ts`); the old keys are left in place. Chat settings live in the `chats` row.
- Vercel entrypoint: `[tool.vercel] entrypoint = "src.confab.main:app"` in `backend/pyproject.toml`. `"confab.main:app"` fails the build (`PYTHON_ENTRYPOINT_NOT_FOUND`) because the path resolves from the project root (probed 2026-11-19).
- Inside `backend/src/confab/` use relative imports only. At runtime the module is `src.confab.main`, so `from confab.x` passes locally and breaks on Vercel; `ci.yml` greps for it (`migrations/` is excluded).
- Only `https://confab-api.vercel.app` is public. The team alias is behind Vercel Authentication.
- Server-sent events stream through Vercel unbuffered (probed 2026-11-19), but one 75 s run stalled for about 42 s and then caught up, so the page treats a silent stream as normal, never as an error.
- The worker thread outlives a dropped connection by design. On Vercel the function cap is 300 s, so a round stops starting new replies after 240 s (`round_budget_seconds`), and a round whose heartbeat is older than 330 s counts as dead. Whether Vercel keeps the thread running after the client leaves was not proved when this was written.
- Migrations must be additive (add a column or table, never drop or rename in the same release): Vercel goes live before the migrate job runs, so new code briefly meets the old schema.
- `updated_at` moves on a rename, a new message or the end of a round, not on a settings change. A new chat copies the open chat's room (the page does this, not the API).
- `max_hops` is 0 to 20, or `-1` (`NO_HOP_LIMIT` in `chat.py`, `NO_LIMIT` in `ChatHeader.tsx`) for no cap (his ask, 2026-11-20). With no cap `run()` ends only when a reply mentions nobody, on Stop or at the hosted time budget, so `system_prompt` adds a paragraph telling each model to state the conclusion and mention no one once the group agrees. Proved live that day: a counting game ran 43 replies until Stop, and a three-model debate ended by itself after 7.
- Local round state is reset at startup (`reset_local_rounds`); hosted state is cleaned lazily when the next round claims a chat.
- A model mentioned by you and then again by an earlier reply in the same round answers once; `run()` skips a handle that is already waiting. One exception: an image seat that is waiting takes the newest reply that names it as its prompt, so "@nova write a prompt and give it to @stability" draws nova's sentence, not your instruction (found live, 2026-11-19).
- The preview pane cannot load a Vite server started with `--host 127.0.0.1`; leave the flag off.
- There is no `.env.example`: the workspace permission rules deny writing `.env*` files. The variables are documented in the README.

## Repo-specific rules

- Local mode has no login, so it must stay loopback only: keep `127.0.0.1` in `cli.py` and all three checks of `_LoopbackOnly` in `main.py` (the Host header must be `localhost` or `127.0.0.1`, the client must be loopback, a non-GET request must not carry another site's Origin). The Host check is what stops DNS rebinding (security review, 2026-11-19); a TestClient needs `base_url="http://127.0.0.1:8011"` and `client=("127.0.0.1", 5000)` to pass it.
- The sign-in cap in `oauth.py` is per client (20 pending in 10 minutes) with a ceiling of 500 in all. On Vercel the client key comes from `x-real-ip`; that header's trustworthiness is from Vercel's docs, not probed, so use it for this limit only, never as identity.
- A stopped reply has no `usage` and no `cost`: Converse reports tokens only at the end of a call. Never estimate one.
- Hosted mode must fail closed: a missing or malformed variable stops the start (`settings.problems()`), never a weaker mode. Add a new hosted dependency to `problems()` in the same change.
- Never mint a token or session for a real account, even to test; override the auth dependency (`deps.current_user`, `github.get_github`) in checks, with fake ids.
- Never write a secret value into the repo or a doc: names only. Keep every chat query behind `owned_chat`.
- Never log or return the bearer token, and never add an endpoint that echoes environment variables.
- Never put exception text in an API response. A failed call maps to a fixed line in `REASONS` (`chat.py`) and the detail goes to the API log; add a line there for a new error code.
- A new model enters `models.json` only after a live call to it has worked. A price enters `prices.json` only from the AWS price list read that day, never from memory; a model without one shows tokens only.
- Every text model call goes through the Converse API on the `us.` profile ids. Never route Claude through Bedrock Mantle.
- Keep motion visible; no `prefers-reduced-motion` handling.
- The model picker never shows a price (his ask, 2026-11-20); prices live in the Cost tab. Never call `confirm()` or `alert()`; use `ConfirmDialog`.
- The house look (0.5.0) is on every surface; he approved the roll-out on 2026-11-20 after seeing the shell pilot ("Yes, roll it out"). The eight 0.4 colour tokens are gone, so `bg-panel`, `text-muted` and the like produce no CSS. A new visual style still goes on one surface first.
