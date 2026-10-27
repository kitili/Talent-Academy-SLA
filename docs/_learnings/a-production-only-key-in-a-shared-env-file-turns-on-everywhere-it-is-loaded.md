# A production-only key in a shared env file turns on everywhere it is loaded

**Scope:** transferable
**Area:** feature switches that are "on when the key is set"; here `TYPESAFE_API_KEY` in
`workers/agent-harness/.env`, which the eval runner also loads. Found 2026-10-19.
**Status:** designed out on 2026-10-19 by `evals/conftest.py` and `evals/settings.py`.

## The symptom

Model routing is meant to run only on the production harness: it is on when `TYPESAFE_API_KEY` is set.
To try it locally, the key went into the harness's `.env`. The eval suite reads the same `.env`
(`load_dotenv(..., override=False)` in `evals/conftest.py`), so every eval run would have routed heavy
cases to Opus 5.5. That breaks the rule that evals run on Kimi K3 only, and it multiplies their cost
about tenfold. Nothing would have errored.

## Why it was misleading

"Set the key only in production" sounds like an environment boundary, but the `.env` file is shared
by every process started from that folder: `langgraph dev`, the eval runner and ad-hoc scripts. A key
added for a local trial is a key for all of them.

## What to do

- When a key doubles as an on-switch, every runner that must stay off forces it off before loading the
  shared file. Set it to an empty value: `load_dotenv(override=False)` keeps an existing empty value.
- Add the key to the runner's start-up guard (`environment_problems`), so a run with it set refuses to
  start.
- Grep for every `load_dotenv` of the file you are adding the key to.
