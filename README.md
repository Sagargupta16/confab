# confab

A group chat in your browser where the other members are Amazon Bedrock models.
Mention one and it answers. Mention several, or `@all`, and each answers in turn.
When a model mentions another model, that one answers too, so they can question
and correct each other while you watch.

It runs on your own machine against your own Bedrock account. There is no
hosted version and no account to create.

## What it does

- **One shared transcript.** You and every model see the same conversation.
- **Mention routing.** `@claude` calls one model, `@claude @gpt` calls both,
  `@all` calls everyone who is in the chat. A message with no mention goes to
  the member you starred.
- **Models pull each other in.** A reply that contains `@handle` makes that
  model answer next. The hop cap (default 6) limits how many of those replies
  can follow one message of yours, so two models cannot loop forever.
- **Per-reply numbers.** Input tokens, output tokens, seconds and the cost in
  dollars under every reply, and a running token total and cost per model in the
  member list.
- **A Cost tab.** The sidebar has a Members tab and a Cost tab. Cost lists each
  model used in this chat with its replies, tokens and dollars, and pins the
  running total under the list.
- **Members you choose.** Switch any seat in or out of the chat. A model that
  fails (throttled, no access) shows its error in place and the round goes on.
- **A model per seat.** Each seat has a model dropdown with every model it offers,
  each shown with its price. Pick Claude Opus 5.5 instead of Fable 5.2, or GPT-OSS
  20B instead of GPT-6.2 Astra, without leaving the chat.
- **A role per member.** A role dropdown on each text seat sets how that model
  behaves in the room: Critic, Builder, Fact-checker, Devil's advocate,
  Simplifier or Moderator, or `Custom...` with a sentence of your own (up to 200
  characters). The other members see the role next to the name.
- **An image member.** `@stability` draws a picture from the message that
  mentions it. The picture appears in the chat with its prompt, and a click opens
  it full size.

## Members

There are 12 seats, 35 models. Each seat is a handle in the chat and offers the
models below; the first one is what the seat starts with. The list lives in
[`backend/src/confab/models.json`](backend/src/confab/models.json).

| Handle | Provider | Models |
| --- | --- | --- |
| `@claude` | Anthropic | Claude Fable 5.2, Claude Opus 5.5, Claude Sonnet 5.5, Claude Haiku 5.5 |
| `@gpt` | OpenAI | GPT-6.2 Astra, GPT-6.2 Sol, GPT-6.1 Terra, GPT-6 Luna, GPT-OSS 120B, GPT-OSS 20B |
| `@grok` | xAI | Grok 4.7 |
| `@kimi` | Moonshot AI | Kimi K3.1 |
| `@mistral` | Mistral | Mistral Large 3, Devstral 2, Magistral Small 1.2, Pixtral Large, Ministral 3 14B, Ministral 3 8B, Ministral 3 3B |
| `@deepseek` | DeepSeek | DeepSeek V3.2 |
| `@nova` | Amazon | Nova Pro, Nova 2 Lite, Nova Micro |
| `@qwen` | Qwen | Qwen3 Next, Qwen3 Coder Next, Qwen3 VL 235B, Qwen3 32B |
| `@minimax` | MiniMax | MiniMax M2.5 |
| `@nemotron` | NVIDIA | Nemotron 3 Super, Nemotron 3 Nano |
| `@glm` | Z.AI | GLM 5.3, GLM 4.7 Flash |
| `@stability` | Stability AI | Stable Image Ultra, Stable Diffusion 3.5 Large, Stable Image Core (images) |

Kimi and GLM start switched off: their default models (Kimi K3.1 and GLM 5.3)
were throttled on every call on the account this was built on, on 2026-11-19.
Switch them on in the member list if your quota allows it. Only current models
are listed; superseded and end-of-life ones were left out.

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

That writes `backend/dist/confab-0.3.0-py3-none-any.whl`, which holds the API and
the built page. Anyone with [uv](https://docs.astral.sh/uv/) can then run it from
that file, with no clone and no Node:

```
uvx --from confab-0.3.0-py3-none-any.whl confab
```

It starts on <http://127.0.0.1:8011>, opens the browser and reads the same
credentials from the environment as above. `--port` picks another port and
`--no-open` leaves the browser alone. Run this way there is no checkout to keep
pictures in, so they go to `.confab/images/` in your home folder.

No release is published yet, so the wheel has to come from a build. Do not run
`uvx confab` or `pip install confab`: that name on PyPI is a different project.

## How a round works

1. Your message is added to the transcript.
2. The models you mentioned are queued, in the order you named them.
3. Each queued model gets the transcript from its own seat: its earlier messages
   as its own turns, and everyone else's as text prefixed with the speaker's
   name. The system prompt tells it who it is, who else is in the chat and, if
   you gave it one, its role.
4. Its reply streams into the page. Any `@handle` in the reply queues that model.
5. An image member does not get the transcript. The text of the message that
   mentioned it, minus the mentions, is the prompt; the picture is saved and
   shown in the chat. Other models see it as a note that a picture was posted
   from that prompt. If you name a text model and the image member in one
   message ("`@nova` write a prompt and give it to `@stability`") and the reply
   names the image member too, the reply is the prompt, not your message.
6. The round ends when the queue is empty or the hop cap is reached.

## Things to know

- **It costs money.** Every reply resends the whole transcript to that model, and
  `@all` calls every member. Long chats with the largest models add up. Clear the
  chat, lower the hop cap, or switch members out to keep it small.
- **Prices are a snapshot.** They come from the AWS price list (us-east-1,
  on-demand), read on the date in
  [`prices.json`](backend/src/confab/prices.json) and shown under the Cost tab.
  They do not update themselves. The long-prompt price tier that Haiku 5.5 and
  the GPT-6 models have is not applied, so a very long chat on those reads
  slightly low. A model with no price row, such as Kimi K3.1 and GLM 5.3, shows
  tokens only, never a guessed figure.
- **Pictures stay on disk.** Generated images are saved under `backend/images/`
  (git-ignored), or under `.confab/images/` in your home folder when confab runs
  as the installed tool. Clearing the chat does not delete them; the chat then shows
  "Image no longer on disk" only if you remove a file yourself.
- **`@all` skips image members.** It calls every text member in the chat; mention
  `@stability` by name to draw.
- **Images use another region.** The image models answer in `us-west-2`, while
  text models use `AWS_REGION` (default `us-east-1`). The same credentials are
  used for both.
- **Local only.** The API has no login and binds to `127.0.0.1`. Do not expose it
  to a network: anyone who can reach it can spend on your Bedrock account.
- **The chat lives in your browser.** The transcript is kept in `localStorage`;
  the server stores nothing.

## Layout

```
backend/src/confab/
  models.json   the seats and the models each offers
  prices.json   USD prices per model and the date they were read
  roster.py     loads both, and works out the cost of a reply
  bedrock.py    streaming Converse call, image call and credentials
  chat.py       roles, mention parsing, each model's view, the round loop
  images.py     where pictures are saved
  main.py       FastAPI: GET /api/roster, POST /api/chat (server-sent events),
                /api/images/<name>.png, and the built page
  cli.py        the confab command
  static/       the built page (git-ignored, written by pnpm run build)
frontend/src/
  App.tsx       state, the round, layout
  cost.ts       adds up cost per model and formats money
  components/   Roster (member list with model and role pickers), Sidebar (the
                Members and Cost tabs), CostTable, ImageReply, MessageList,
                Message, Composer
```

## License

[MIT](LICENSE)
