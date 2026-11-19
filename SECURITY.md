# Security policy

confab is a local tool: a small API and a browser page that call Amazon Bedrock
with the credentials of whoever runs it. Its realistic risks are a Bedrock key
leaking through logs or a commit, the unauthenticated API being reachable from
somewhere other than the machine it runs on, and text from a model being
rendered in the page in a way that runs code.

## Supported version

Security fixes are applied to the latest commit on `main`.

## Reporting a vulnerability

Do not open a public issue for a vulnerability. Use GitHub's private
vulnerability reporting form:

<https://github.com/Sagargupta16/confab/security/advisories/new>

Include the affected file or route, the steps to reproduce it and the impact.
Do not include real credentials. You should receive a first response within
7 days. Please allow time for a fix before public disclosure.

## Scope

In scope: credential handling, anything that lets a remote page or a model's
reply call the API or read the transcript, script injection through rendered
replies, and vulnerable dependencies. Out of scope: what a model says, and
spend caused by running the tool as intended.
