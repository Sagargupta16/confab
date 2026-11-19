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

Local-only tool, run against his own Bedrock account. No hosted deploy.

## Stack

- **Language**: Python 3.14 (backend), TypeScript 7 (frontend)
- **Framework**: FastAPI + boto3 (Converse API), React 19 + Vite 8 + Tailwind 4 + motion
- **Database**: none. The transcript lives in the browser's `localStorage`; the server is stateless.
- **Package manager**: uv (backend), pnpm (root and frontend, two separate installs like ledger-sync)
- **Deploy target**: local-only

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

No test suite yet. CI (`.github/workflows/ci.yml`) type-checks and builds the frontend and imports the backend app.

## Entry points

- `backend/src/confab/main.py` -- FastAPI app: `GET /api/roster`, `POST /api/chat` (server-sent events), and the built page when `backend/src/confab/static/` exists (Vite's `outDir`, git-ignored, packed into the wheel).
- `backend/src/confab/cli.py` -- the `confab` command (`[project.scripts]`): uvicorn on `127.0.0.1`, `--port`, `--no-open`.
- `frontend/src/main.tsx` -- mounts `App`.

## Key files

- `backend/src/confab/chat.py` -- the brain: the six role presets, mention parsing, each model's view of the transcript, the round loop and the hop cap.
- `backend/src/confab/models.json` -- the seats: handle, provider, `kind` (`text` or `image`), colour, `joined`, `default` model id and a `models` list. A text model has id, name, `maxTokens` and `temperature`; an image model has id, name and `region`.
- `backend/src/confab/prices.json` -- USD per million tokens (`in`, `out`) or per image (`image`) by model id, plus `checked`, `source` and `currency`. `roster.py` refuses a row for a model that is not in `models.json`.
- `backend/src/confab/roster.py` -- loads both files and works out the cost of a reply.
- `backend/src/confab/bedrock.py` -- the streaming Converse call, the image InvokeModel call and the credential fallback.
- `backend/src/confab/images.py` -- saves pictures under random names: `backend/images/` (git-ignored) from a checkout, `~/.confab/images/` when installed (it tells the two apart by `backend/pyproject.toml`).
- `frontend/src/cost.ts` -- adds up cost per model and formats money; `components/CostTable.tsx` and `components/Sidebar.tsx` are the Cost tab.
- `frontend/src/App.tsx` -- chat state, the round, stored settings.
- `frontend/src/mentions.ts` -- the mention rule; keep it identical to `MENTION` in `chat.py`.

## API routes

- `GET /api/roster` -- `{seats, roles, prices}`.
- `POST /api/chat` -- body `{messages, members, default, max_hops, human_name, seats}`; `seats` maps a handle to `{model, role, brief}`, and a message may carry `image_prompt` for a picture. Streams `start`, then `delta` and `end` (text), `image` (picture) or `error` per reply, then `done` with the hops used and any members left unanswered at the cap.
- `/api/images/<name>.png` -- a saved picture, served as static files.

## Auth

- Bedrock API key as a bearer token in `AWS_BEARER_TOKEN_BEDROCK`, region `AWS_REGION` (default `us-east-1`); boto3 picks the token up by itself.
- When the variable is missing or empty, `bedrock.py` reads it from the Windows user environment (the Claude desktop app does not pass it to processes it starts), and otherwise removes it so the normal AWS credential chain answers. Same fallback as `community/bedrock-multi-model-mcp`.
- The API itself has no login and binds to `127.0.0.1`. Keep it that way.

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
- GPT-6 Astra was superseded by GPT-6.2 Astra; superseded and legacy models stay out of `models.json`.
- A browser that used 0.1 has a stored `confab.joined` list, so seats added since show switched off until turned on.
- A model mentioned by you and then again by an earlier reply in the same round answers once; `run()` skips a handle that is already waiting. One exception: an image seat that is waiting takes the newest reply that names it as its prompt, so "@nova write a prompt and give it to @stability" draws nova's sentence, not your instruction (found live, 2026-11-19).
- The preview pane cannot load a Vite server started with `--host 127.0.0.1`; leave the flag off.
- There is no `.env.example`: the workspace permission rules deny writing `.env*` files. The variables are documented in the README.

## Repo-specific rules

- Never log or return the bearer token, and never add an endpoint that echoes environment variables.
- Never put exception text in an API response. A failed call maps to a fixed line in `REASONS` (`chat.py`) and the detail goes to the API log; add a line there for a new error code.
- A new model enters `models.json` only after a live call to it has worked. A price enters `prices.json` only from the AWS price list read that day, never from memory; a model without one shows tokens only.
- Every text model call goes through the Converse API on the `us.` profile ids. Never route Claude through Bedrock Mantle.
- Keep motion visible; no `prefers-reduced-motion` handling.
