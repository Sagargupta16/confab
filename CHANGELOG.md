# Changelog

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
