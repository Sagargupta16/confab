# Changelog

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
