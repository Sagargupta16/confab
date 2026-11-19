# CLAUDE.md

> This file stacks on top of the workspace root at `C:\Code\GitHub\`:
> - Root [`CLAUDE.md`](../../CLAUDE.md) -- voice, rules, routing map, references, skills, slash commands, conventions.
> - Root [`MEMORY.md`](../../MEMORY.md) -- live facts across repos.
> - Root [`STATUS.md`](../../STATUS.md) -- live PR/CI/security dashboard.
> - [`.claude/resources/`](../../.claude/resources/README.md) -- deep reference for collaboration, workflow, git, OSS, debugging, voice.
>
> Read those first. The guidance below only adds **repo-specific context** -- it does not override anything in the root.

## Project

confab is a group chat in the browser where the other members are Amazon Bedrock models: Sagar mentions one and it answers, and the models can mention and answer each other up to a hop cap.

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

`pnpm run dev` starts the API on 8011 and the page on <http://localhost:5183> (Vite proxies `/api`). `pnpm run build` then `pnpm run start` serves the built page from the API on 8011 alone.

## Test

```
pnpm run type-check
```

No test suite yet. CI (`.github/workflows/ci.yml`) type-checks and builds the frontend and imports the backend app.

## Entry points

- `backend/src/confab/main.py` -- FastAPI app: `GET /api/roster`, `POST /api/chat` (server-sent events), and the built page when `frontend/dist` exists.
- `frontend/src/main.tsx` -- mounts `App`.

## Key files

- `backend/src/confab/chat.py` -- the brain: mention parsing, each model's view of the transcript, the round loop and the hop cap.
- `backend/src/confab/models.json` -- the members: handle, name, Bedrock model id, output cap, `temperature` flag, colour, joined by default.
- `backend/src/confab/bedrock.py` -- the streaming Converse call and the credential fallback.
- `frontend/src/App.tsx` -- chat state, the round, stored settings.
- `frontend/src/mentions.ts` -- the mention rule; keep it identical to `MENTION` in `chat.py`.

## API routes

- `GET /api/roster` -- the members.
- `POST /api/chat` -- body `{messages, members, default, max_hops, human_name}`; streams `start`, `delta`, `end` or `error` per reply, then `done` with the hops used and any members left unanswered at the cap.

## Auth

- Bedrock API key as a bearer token in `AWS_BEARER_TOKEN_BEDROCK`, region `AWS_REGION` (default `us-east-1`); boto3 picks the token up by itself.
- When the variable is missing or empty, `bedrock.py` reads it from the Windows user environment (the Claude desktop app does not pass it to processes it starts), and otherwise removes it so the normal AWS credential chain answers. Same fallback as `community/bedrock-multi-model-mcp`.
- The API itself has no login and binds to `127.0.0.1`. Keep it that way.

## Gotchas

- Model ids and the `temperature` flag come from `community/bedrock-multi-model-mcp/src/data/text-models.json`, where each id was probed live. Reasoning models (Claude 5, GPT-6, Grok, Kimi) reject `temperature`; a wrong flag fails the call.
- Reasoning models spend output tokens on thinking, so a small `maxTokens` gives an empty reply that looks like a failure. Keep their cap at 16384.
- Models do not know who they are unless told: without the system prompt in `chat.py`, DeepSeek answered as the user and MiniMax as Claude (probe, 2026-11-19).
- Kimi K3 returned `ThrottlingException: Too many tokens` on every call on 2026-11-19, so it ships with `joined: false`.
- A model mentioned by you and then again by an earlier reply in the same round answers once; `run()` skips a handle that is already waiting.
- The preview pane cannot load a Vite server started with `--host 127.0.0.1`; leave the flag off.
- There is no `.env.example`: the workspace permission rules deny writing `.env*` files. The variables are documented in the README.

## Repo-specific rules

- Never log or return the bearer token, and never add an endpoint that echoes environment variables.
- Every model call goes through the Converse API on the `us.` profile ids. Never route Claude through Bedrock Mantle.
- Keep motion visible; no `prefers-reduced-motion` handling.
