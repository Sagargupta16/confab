# confab

A group chat in your browser where the other members are Amazon Bedrock models.
Mention one and it answers. Mention several, or `@all`, and each answers in turn.
When a model mentions another model, that one answers too, so they can question
and correct each other while you watch.

It runs on your own machine against your own Bedrock account, with no login and
no account to create. There is also a hosted shape for use from a phone, with
GitHub sign-in limited to its owner; it is described under
[Hosted mode](#hosted-mode) and is not deployed yet.

## What it does

- **One shared transcript.** You and every model see the same conversation.
- **Chats saved on the server.** Every chat is stored in a database, so a reload
  or another device finds it where you left it. The sidebar lists your chats,
  newest first, with New chat, rename and delete. A new chat starts with the room
  you have open.
- **A top bar and a room panel per chat.** The top bar holds the chat's title
  (click to rename), the mode, the member count and the cost. The room panel
  holds the members with their model and role pickers, the hop cap, your name
  and Clear.
- **Four modes.** A mode sets who is in, their roles, who answers when nobody is
  mentioned and the hop cap in one pick: Open room (everyone who joins by
  default, no roles, hop cap 6), Debate (hop cap 8), Build (6) and Fact-check
  (4). Changing a member's role or brief makes the room "Custom". The presets
  live in [`backend/src/confab/modes.py`](backend/src/confab/modes.py).
- **Stop.** Stop ends the round on the server and closes the model call that is
  streaming; the words already received stay in the chat marked as stopped. An
  image call that has started finishes first. A stopped reply shows no cost: the
  model reports its token count only when a reply finishes, and Bedrock still
  bills what was generated.
- **Catch-up.** A round runs on the server, so a dropped connection (a phone
  that locked, a closed tab) does not end it. The page reads what was saved and
  carries on from there.
- **Mention routing.** `@claude` calls one model, `@claude @gpt` calls both,
  `@all` calls everyone who is in the chat. A message with no mention goes to
  the member you starred.
- **Models pull each other in.** A reply that contains `@handle` makes that
  model answer next. The hop cap (default 6) limits how many of those replies
  can follow one message of yours, so two models cannot loop forever.
- **Or no cap.** Set Hops to "No limit" and the models keep answering each other
  until they reach a conclusion: they are told the room has no cap and that a
  reply which mentions nobody ends the discussion. Stop still ends it at once.
  Models that never settle keep going, and keep billing, until you press Stop;
  hosted on Vercel a round also stops starting new replies after 240 seconds.
- **Per-reply numbers.** Input tokens, output tokens, seconds and the cost in
  dollars under every reply, and a running token total and cost per model in the
  member list.
- **A Cost tab.** The sidebar has a Members tab and a Cost tab. Cost lists each
  model used in this chat with its replies, tokens and dollars, and pins the
  running total under the list.
- **Members you choose.** Switch any seat in or out of the chat. A model that
  fails (throttled, no access) shows its error in place and the round goes on.
- **A model per seat.** Each seat has a model menu that lists every model it
  offers by name, with a tick on the one in use. Pick Claude Opus 5.5 instead of
  Fable 5.2, or GPT-OSS 20B instead of GPT-6.2 Astra, without leaving the chat.
  The menu shows no prices; those are in the Cost tab.
- **Cheap, Medium or Intense.** One pick sets every seat's model by cost: Cheap
  is each seat's lowest-priced model, Intense is each seat's default (its top
  model), Medium is the priced model closest to halfway between them. The menu
  tags the model each level uses. Nothing extra is stored: a level is just the
  seat choices it writes, and changing one seat by hand leaves no level selected.
  The picks are worked out from `prices.json` in
  [`backend/src/confab/levels.py`](backend/src/confab/levels.py).
- **A role per member.** A role dropdown on each text seat sets how that model
  behaves in the room: Critic, Builder, Fact-checker, Devil's advocate,
  Simplifier or Moderator, or `Custom...` with a sentence of your own (up to 200
  characters). The other members see the role next to the name.
- **An image member.** `@stability` draws a picture from the message that
  mentions it. The picture appears in the chat with its prompt, and a click opens
  it full size.

## Members

There are 12 seats, 33 models. Each seat is a handle in the chat and offers the
models below; the first one is what the seat starts with. The list lives in
[`backend/src/confab/models.json`](backend/src/confab/models.json).

| Handle | Provider | Models |
| --- | --- | --- |
| `@claude` | Anthropic | Claude Fable 5.2, Claude Opus 5.5, Claude Sonnet 5.5, Claude Haiku 5.5 |
| `@gpt` | OpenAI | GPT-6.2 Astra, GPT-6.2 Sol, GPT-6.1 Terra, GPT-6 Luna, GPT-OSS 120B, GPT-OSS 20B |
| `@grok` | xAI | Grok 4.7 |
| `@kimi` | Moonshot AI | Kimi K3.1 |
| `@mistral` | Mistral | Mistral Large 3, Magistral Small 1.2, Pixtral Large, Ministral 3 14B, Ministral 3 8B, Ministral 3 3B |
| `@deepseek` | DeepSeek | DeepSeek V3.2 |
| `@nova` | Amazon | Nova Pro, Nova 2 Lite, Nova Micro |
| `@qwen` | Qwen | Qwen3 Next, Qwen3 Coder Next, Qwen3 VL 235B, Qwen3 32B |
| `@minimax` | MiniMax | MiniMax M2.5 |
| `@nemotron` | NVIDIA | Nemotron 3 Super, Nemotron 3 Nano |
| `@glm` | Z.AI | GLM 5.3 |
| `@stability` | Stability AI | Stable Image Ultra, Stable Diffusion 3.5 Large, Stable Image Core (images) |

Kimi and GLM start switched off: their default models (Kimi K3.1 and GLM 5.3)
were throttled on every call on the account this was built on, on 2026-11-19.
Switch them on in the member list if your quota allows it. Only current models
are listed; superseded ones and any model AWS marks Legacy or gives an
end-of-life date are left out. The roster was checked against the AWS
[legacy and end-of-life page](https://docs.aws.amazon.com/bedrock/latest/userguide/model-lifecycle-legacy.html)
on 2026-11-20, which removed Devstral 2 and GLM 4.7 Flash (Legacy since
2026-09-30, end of life 2027-03-30).

To add or swap a model, edit that file. A seat has a handle, a provider, a kind
(`text` or `image`), a colour, whether it starts joined, a default model id and a
list of models. A text model has an id, a display name, an output cap and
whether it accepts `temperature`; an image model has an id, a display name and a
region. Add a model only after a live call to it has worked.

## Run it

You need [uv](https://docs.astral.sh/uv/), [pnpm](https://pnpm.io/) and access
to the models in Amazon Bedrock.

```
pnpm install
pnpm run setup
pnpm run dev
```

Then open <http://localhost:5183>.

Chats are saved in a SQLite file, `backend/confab.db` from a checkout (the
database is created and migrated when the API starts). The first time the page
opens, a chat that an older version kept in your browser is copied to the server
once, as a chat called "Earlier chat"; the old browser data is left where it is.

Credentials come from the environment of the process that starts the API:

- `AWS_BEARER_TOKEN_BEDROCK`: a Bedrock API key. On Windows the API also reads
  it from your user-level environment variables.
- Without that variable, your normal AWS credentials are used.
- `AWS_REGION`: defaults to `us-east-1`. Keep it a US region.

The model ids in `models.json` are the US ones, and the image models answer only
in `us-west-2`. Called from `eu-west-1`, a `us.` id and a plain id both came
back as "The provided model identifier is invalid" (probed 2026-11-19), which
the chat shows as "Bedrock rejected the request for this model." From
`us-east-1` and `us-west-2` they answer. If your account works in another part
of the world, swap the ids in `models.json` for the ones your region offers.

Your account also needs access to each model. One it cannot use shows "This
account has no access to the model." in the chat and the round goes on, so you
can switch that member out.

For one process and one port, build the page and let the API serve it:

```
pnpm run build
pnpm run start
```

Then open <http://localhost:8011>.

### As one command, without the repo

confab is also an installable tool. Build the wheel once, from a checkout:

```
pnpm run package
```

That writes `backend/dist/confab-0.4.0-py3-none-any.whl`, which holds the API and
the built page. Anyone with [uv](https://docs.astral.sh/uv/) can then run it from
that file, with no clone and no Node:

```
uvx --from confab-0.4.0-py3-none-any.whl confab
```

It starts on <http://127.0.0.1:8011>, opens the browser and reads the same
credentials from the environment as above. `--port` picks another port and
`--no-open` leaves the browser alone. Run this way there is no checkout to keep
chats and pictures in, so they go to `.confab/confab.db` and `.confab/images/` in
your home folder. The command prints where both are saved when it starts.

No release is published yet, so the wheel has to come from a build. Do not run
`uvx confab` or `pip install confab`: that name on PyPI is a different project.

## How a round works

1. The page sends your message and the chat's id (`POST /api/chat`). The server
   claims the chat for the round and saves your message; a second round on the
   same chat, from another tab or device, is refused until the first ends.
2. The models you mentioned are queued, in the order you named them.
3. Each queued model gets the transcript from its own seat, read from the saved
   messages: its earlier messages as its own turns, and everyone else's as text
   prefixed with the speaker's name. Notices and failed or unfinished replies are
   left out. The system prompt tells it who it is, who else is in the chat and, if
   you gave it one, its role.
4. Its reply streams into the page while a worker on the server saves it about
   once a second. Any `@handle` in the reply queues that model.
5. An image member does not get the transcript. The text of the message that
   mentioned it, minus the mentions, is the prompt; the picture is saved and
   shown in the chat. Other models see it as a note that a picture was posted
   from that prompt. If you name a text model and the image member in one
   message ("`@nova` write a prompt and give it to `@stability`") and the reply
   names the image member too, the reply is the prompt, not your message.
6. The round ends when the queue is empty, the hop cap is reached, you press Stop,
   or (hosted on Vercel only) 240 seconds have passed. At the hop cap or the time
   limit the chat gets a notice naming the members who did not answer. The worker
   keeps going if the connection drops, and the page catches up by reading the
   saved messages.

## Things to know

- **It costs money.** Every reply resends the whole transcript to that model, and
  `@all` calls every member. Long chats with the largest models add up. Clear the
  chat, start a new one, lower the hop cap, or switch members out to keep it
  small. A chat holds at most 2000 messages.
- **Prices are a snapshot.** They come from the AWS price list (us-east-1,
  on-demand), read on the date in
  [`prices.json`](backend/src/confab/prices.json) and shown under the Cost tab.
  They do not update themselves. The long-prompt price tier that Haiku 5.5 and
  the GPT-6 models have is not applied, so a very long chat on those reads
  slightly low. A model with no price row, such as Kimi K3.1 and GLM 5.3, shows
  tokens only, never a guessed figure.
- **Pictures stay on disk locally.** Generated images are saved under
  `backend/images/` (git-ignored), or under `.confab/images/` in your home folder
  when confab runs as the installed tool. Deleting a chat deletes its pictures;
  clearing a chat does not. The chat shows "Image no longer on disk" only if you
  remove a file yourself.
- **`@all` skips image members.** It calls every text member in the chat; mention
  `@stability` by name to draw.
- **Images use another region.** The image models answer in `us-west-2`, while
  text models use `AWS_REGION` (default `us-east-1`). The same credentials are
  used for both.
- **Local mode has no login.** The `confab` command binds to `127.0.0.1`, and the
  API also answers 403 to any request that does not come from the machine itself,
  that is addressed to a name other than `localhost` or `127.0.0.1`, or that
  another site's page tries to send. The second rule stops a web page from
  pointing its own address at your PC to read your chats.
  Do not expose it to a network: anyone who could reach it would spend on your
  Bedrock account.
- **Chats live on the server.** In local mode that is the SQLite file named
  above; hosted, it is Postgres. The browser keeps only small things such as
  which chat was open and, hosted, the sign-in tokens. Deleting a chat, or running Clear, cannot be undone.
- **Hosted pictures are public behind unguessable links.** The R2 bucket serves
  pictures without a login; each link holds 128 random bits, so a picture is
  only as private as its link. Anyone you give the link to can open it.
- **What version 0.4.0 leaves out.** Sharing a chat; anyone but the allowlisted
  accounts, or a user's own Bedrock key; push notifications; offline use (the
  page shell loads, chats and rounds need the network); syncing local chats with
  hosted ones; search, export, and editing or deleting single messages; syncing
  your name across devices; deleting pictures on Clear; private or signed picture
  links; resuming a stream (the page polls instead); per-IP rate limits; a custom
  install prompt; and the long-prompt price tier.

## Hosted mode

The hosted shape lets the owner use confab from a phone. The page is installable
(a PWA) and served from GitHub Pages at <https://sagargupta.online/confab/>. The
API runs on Vercel at <https://confab-api.vercel.app>. Chats are stored in Neon
Postgres and pictures in a Cloudflare R2 bucket. Sign-in is GitHub only, and only
the GitHub account ids in an allowlist get in; anyone else is refused and gets no
account. Every round spends on the owner's Bedrock account, which is why the
allowlist exists.

**Not deployed yet.** The code is written, but no workflow has run and the API and
page are not live. Nothing here has been run against Vercel, Neon or R2 beyond
a probe of the Vercel runtime.

Hosted mode is switched on by `CONFAB_ENVIRONMENT=production`. It refuses to
start, and says which variables are wrong, when a required one is missing or
malformed. Variable names only; a secret goes in the host's settings, never in the
repo.

| Variable | Secret | What it is |
| --- | --- | --- |
| `CONFAB_ENVIRONMENT` | no | `production` for hosted mode; unset or `local` for the local tool. |
| `CONFAB_DATABASE_URL` | yes | The Postgres URL (Neon pooler on Vercel). Unset locally, the SQLite file is used. |
| `CONFAB_JWT_SECRET_KEY` | yes | Signs the sign-in tokens; 32 or more characters. |
| `CONFAB_GITHUB_CLIENT_ID` | no | Client id of the GitHub OAuth app. |
| `CONFAB_GITHUB_CLIENT_SECRET` | yes | Client secret of the same app. |
| `CONFAB_ALLOWED_GITHUB_IDS` | no | Numeric GitHub account ids that may sign in, separated by commas or spaces. |
| `CONFAB_FRONTEND_URL` | no | Public address of the page, `https` unless it is localhost. The OAuth callback and the allowed CORS origin come from it. |
| `CONFAB_CORS_ORIGINS` | no | Extra allowed origins, optional. |
| `AWS_BEARER_TOKEN_BEDROCK` | yes | The Bedrock API key; required on Vercel. |
| `AWS_REGION` | no | Region for text models; defaults to `us-east-1`. |
| `R2_ACCOUNT_ID` | no | Cloudflare account id. |
| `R2_ACCESS_KEY_ID` | yes | R2 access key id. |
| `R2_SECRET_ACCESS_KEY` | yes | R2 secret key. |
| `R2_BUCKET` | no | Bucket for pictures. |
| `R2_PUBLIC_BASE_URL` | no | Public `https` address of that bucket. |
| `VITE_API_BASE_URL` | no | A GitHub repository variable, read at page build time: the API address. |
| `CONFAB_DEPLOY` | no | A GitHub repository variable. The migration and Pages jobs run only when it is `true`; leave it unset until everything above exists. |

The five `R2_*` variables are all or nothing, and Vercel requires them because it
has no disk. The migration job also reads `CONFAB_DATABASE_URL` as a GitHub
secret, which should be the direct Neon host. Secrets must never be pasted into
the repo, an issue or a chat; there is no `.env.example` here, and this table is
the list.

Sign-in goes GitHub, then the page, then the API: the page makes a PKCE
challenge, the API signs a one-use state, GitHub returns to
`/auth/callback/github` on the page, and the API exchanges the code, checks the
account id against the allowlist and issues its own tokens (access 30 minutes,
refresh 7 days, each refresh used once). The page keeps them in `localStorage`
under `confab.auth`; there are no cookies.

## Layout

```
backend/src/confab/
  models.json   the seats and the models each offers
  prices.json   USD prices per model and the date they were read
  roster.py     loads both, and works out the cost of a reply
  bedrock.py    streaming Converse call, image call and credentials
  chat.py       roles, mention parsing, each model's view, the round loop
  modes.py      the four room presets
  levels.py     the three cost levels, worked out from the prices
  settings.py   environment settings and the refusal to start when hosted
                settings are incomplete
  db.py         the engine and sessions (SQLite locally, Postgres hosted)
  models.py     the tables: users, chats, messages, oauth_states, refresh_tokens
  migrations/   Alembic revisions (backend/alembic.ini points at them)
  chats.py      the chats routes
  rounds.py     POST /api/chat: claims the chat, runs the round on a worker
  deps.py       who is asking: the local user, or the signed-in allowlisted user
  auth.py       refresh, me and logout
  oauth.py      the GitHub sign-in routes
  github.py     the code exchange and account lookup
  tokens.py     signing and reading the tokens
  images.py     where pictures are saved: disk locally, R2 hosted
  main.py       FastAPI app, health routes, GET /api/roster, the images and the
                built page
  cli.py        the confab command
  static/       the built page (git-ignored, written by pnpm run build)
backend/vercel.json   region and the 300 s function limit for the API
frontend/src/
  App.tsx       state, the round, layout
  AuthGate.tsx  asks the API which mode it is in and shows sign-in when hosted
  auth.ts       sign-in, tokens and the shared refresh
  client.ts     the chats API calls
  api.ts        the roster call and the one-time import of an older chat
  wire.ts       the JSON shapes the API speaks
  cost.ts       adds up cost per model and formats money
  index.css     the design tokens and the shell's classes
  components/   Roster (member list with model and role pickers), ModelMenu (the
                model picker), LevelControl (Cheap, Medium, Intense), Sidebar (the
                Members and Cost tabs), ChatList (the chats sidebar), ChatHeader
                (the top bar), Panel (slide-in drawers), Button, ConfirmDialog,
                CountUp, SignIn, TitleInput, CostTable, ImageReply, MessageList,
                Message, Composer
frontend/public/    the icons of the installed page
.github/workflows/
  ci.yml              checks on every push and pull request; on main it then calls
  migrate.yml         the database migration, then
  deploy-frontend.yml the GitHub Pages deploy
```

## License

[MIT](LICENSE)
