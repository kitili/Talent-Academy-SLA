# A model call behind a short client timeout fails, and still finishes

**Scope:** transferable
**Area:** agent harness API tools (`workers/agent-harness/src/middleware/api_middleware/tools/`) calling app routes that make model calls; `DEFAULT_TIMEOUT = 30` in `api_middleware/client/config.py`.
**Status:** fixed for `preview_draft_diagram_edit` on 2026-10-14 (`PREVIEW_TIMEOUT_S = 300`, matched to the edit route's new `maxDuration`). `create_process_splotch` already waited 300 s.

## The symptom

In a workstream the agent created a Draft and then called `preview_draft_diagram_edit`. The call failed with `request failed: timed out` four times in a row. Reads of the same splotch answered in milliseconds, so the agent and the user decided the "edit engine" was down and waited for it to recover. It never did.

## Why it was misleading

- A timeout reads as the server's health, not as the client's patience. The plain reads recovering made the edit route look specifically broken.
- The server did not fail. It ran the edit model call and the sweep (a second model call) to completion, past the client's 30 s, every time.
- Retrying made it worse. A preview returns a signed token that the apply step needs. A timed-out call never delivers its token, so each retry paid for the same model work and threw the result away.

## Why it happens

Every product API tool shares one 30 s default, which suits CRUD verbs. A route that makes a model call can run several times longer. Nothing ties the client's wait to the server's limit, and the edit route stated no `maxDuration` at all.

## What to do

- A harness tool whose route makes a model call passes its own timeout, equal to the route's `maxDuration`, and the route states one. A test pins the two together (`test_preview_waits_as_long_as_the_edit_route_may_run`, `test_waits_as_long_as_the_route_may_run`).
- When an agent reports "timed out", check whether the write landed before retrying. In the same run, `create` and `create_draft` both "timed out" and both had in fact succeeded.
- A local dev server compiles each route on first hit. Right after a restart, even CRUD verbs can outrun 30 s. That is a different cause with the same message.
