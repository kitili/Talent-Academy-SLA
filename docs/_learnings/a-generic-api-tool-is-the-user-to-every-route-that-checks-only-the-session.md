# A generic API tool is the user to every route that checks only the session

**Scope:** transferable
**Area:** an agent with a generic HTTP tool that sends the user's own credential, and any feature whose rule is "a
person approves each step" (here: Inky's `create`/`read`/`update`/`delete` in `workers/agent-harness`, and the
repository restore routes).
**Status:** designed out for repository restore and version delete on 2026-10-17 (harness
`api_middleware/app_only_routes.py`; app `restoreBrowserOnlyRefusal` in `src/app/api/repo-restore/runs/respond.ts`).
Open for the next feature that relies on "only the panel calls this route".

## The symptom

Nothing failed. The restore design said agents never restore and every NetSuite step is approved by a person in the
Restore panel, and the docs said "Agents and MCP have no restore tool". Yet the model could call
`create(endpoint="/api/repo-restore/runs/<id>/steps/1/approve", payload={"digest": …})` and the route would answer 202
as the user: no card, no panel.

## Why it was misleading

"No restore tool" reads as "the agent cannot restore". It only means no tool *names* restore. A generic tool takes any
path the model writes, and the approval-card middleware gated only `DELETE` and a few `PATCH`/`PUT` shapes, so a `POST`
passed through untouched. The server checks (a plan digest, the live version id, the step digest) looked like a
second line, but they bind a request to what was *shown*, and the model can read the run (`GET`) to learn exactly
those values.

## Why it happens

- The harness forwards the browser's own auth cookies (`useAgentRuntimeContext.ts:147`) and sends them, or a
  build-session bearer, on every call (`client/http.py:40-52`). To a route that calls `supabase.auth.getUser()` from the
  cookie, the agent *is* the user.
- The app's routes are written for the panel, so "the panel is the only caller" was an assumption nobody enforced.
- The approval middleware (`destructive_action_middleware/rules.py`) decides by tool and method, not by what the route
  does, so a `POST` that approves a NetSuite write was "not destructive".

## What to do

- When a feature's rule is "a person does this", close it on **both** sides, and say which file holds each:
  - **Agent side:** refuse the paths before any request, whatever the method, with a message that sends the user to
    the screen that does it. Match on the normalized path (decode, collapse `..` and `//`, lowercase), never a raw
    prefix.
  - **Server side:** accept only the person's own browser. A session cookie cannot prove that when an agent replays
    it; the `Sec-Fetch-Site: same-origin` header can (page script cannot set it and a server-side client does not send
    it), plus refuse any `Authorization` header or agent marker header outright.
- Do not card such a call instead of refusing it: a card makes the agent a second driver of a flow the design gives
  to the panel.
- Grep for every route a new "human-only" feature adds and check what a cookie-only caller gets; a test should drive
  the real handler with the harness's own headers and expect 403.

## Evidence

- `workers/agent-harness/tests/unit/test_app_only_routes.py`: each restore route, by each tool, is refused before any
  HTTP call; six respellings are refused; Version history reads still go through.
- `tests/unit/repo-restore/restoreBrowserOnly.test.ts`: the start, approve, resume, finish and run routes answer 403 to
  the chat agent's headers, the Build pane's, a bearer or agent header beside a browser's, and a cross-site post; the
  panel's same-origin fetch passes. Each check, removed, fails its tests (5, 5, 10 and 25 failures).
- Not reproduced at runtime: the exposure was read from the code paths above, not exercised against a deployment.
