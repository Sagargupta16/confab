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
- **Per-reply numbers.** Input tokens, output tokens and seconds under every
  reply, and a running token total per model in the member list.
- **Members you choose.** Switch any model in or out of the chat. A model that
  fails (throttled, no access) shows its error in place and the round goes on.

## Members

Ten models ship in [`backend/src/confab/models.json`](backend/src/confab/models.json),
the top one from each provider that answers the Bedrock Converse API:

| Handle | Model | Provider |
| --- | --- | --- |
| `@claude` | Claude Fable 5.2 | Anthropic |
| `@gpt` | GPT-6 Astra | OpenAI |
| `@grok` | Grok 4.7 | xAI |
| `@kimi` | Kimi K3 | Moonshot AI |
| `@mistral` | Mistral Large 3 | Mistral |
| `@deepseek` | DeepSeek V3.2 | DeepSeek |
| `@nova` | Nova Pro | Amazon |
| `@qwen` | Qwen3 Next | Qwen |
| `@minimax` | MiniMax M2.5 | MiniMax |
| `@nemotron` | Nemotron 3 Super | NVIDIA |

Kimi K3 starts switched off: it was throttled on every call on the account this
was built on. Switch it on in the member list if your quota allows it.

To add or swap a model, edit that file: a handle, a display name, the Bedrock
model id, an output cap, whether the model accepts `temperature`, and a colour.

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
- `AWS_REGION`: defaults to `us-east-1`.

For one process and one port, build the page and let the API serve it:

```
pnpm run build
pnpm run start
```

Then open <http://localhost:8011>.

## How a round works

1. Your message is added to the transcript.
2. The models you mentioned are queued, in the order you named them.
3. Each queued model gets the transcript from its own seat: its earlier messages
   as its own turns, and everyone else's as text prefixed with the speaker's
   name. The system prompt tells it who it is and who else is in the chat.
4. Its reply streams into the page. Any `@handle` in the reply queues that model.
5. The round ends when the queue is empty or the hop cap is reached.

## Things to know

- **It costs money.** Every reply resends the whole transcript to that model, and
  `@all` calls every member. Long chats with the largest models add up. Clear the
  chat, lower the hop cap, or switch members out to keep it small.
- **Local only.** The API has no login and binds to `127.0.0.1`. Do not expose it
  to a network: anyone who can reach it can spend on your Bedrock account.
- **The chat lives in your browser.** The transcript is kept in `localStorage`;
  the server stores nothing.

## Layout

```
backend/src/confab/
  models.json   the members
  roster.py     loads them
  bedrock.py    streaming Converse call and credentials
  chat.py       mention parsing, each model's view, the round loop
  main.py       FastAPI: GET /api/roster, POST /api/chat (server-sent events)
frontend/src/
  App.tsx       state, the round, layout
  components/   member list, message list, message, composer
```

## License

[MIT](LICENSE)
