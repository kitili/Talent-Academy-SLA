# Run context is trace metadata

**Scope:** transferable

**Symptom.** The user's Supabase auth cookie, and the signed billing claim, were
in LangSmith. Both `sb-<ref>-auth-token.0` and `.1` sat in `extra.metadata` of
**143 of 143** production root runs and every child run under them, and in 235
of 257 staging roots. These are the 14 days LangSmith retained on 2026-09-30.
Anyone with read access to the LangSmith workspace could replay a user's session
(access token and refresh token) until it expired.

**Why it was misleading.** The app already guarded credentials:

- `stripRuntimeAuthFields` (`src/agent-client/client/useSplotchAgent.ts`)
  removes `cookie`, `accessToken` and `billingClaim` from the `runtimeContext`
  state mirror before it is checkpointed.
- The comment says the credentials "still travel on `context`, which is per-run
  and not persisted".

Both statements are true. But "not persisted" was read as "not recorded". Run
`context` is not persisted in the checkpoint, and yet it is recorded, through
three hops:

1. `langgraph_api` copies `context` into `configurable`
   (`langgraph_api/models/run.py`: `configurable = context.copy()`).
2. LangChain turns every plain `configurable` key into run metadata.
3. The LangSmith client uploads that metadata on the root run **and every child
   run**. That means every LLM call and every tool call, not just the root.

The state inputs looked clean, so a review of the root's inputs found nothing.
The leak was one tab over, in Metadata.

**The check.** Query a recent trace and list its metadata **keys**; never print
the values:

```
POST /api/v1/runs/query  {session:[<project id>], is_root:true, limit:5, select:["extra"]}
→ look for cookie / billingClaim / accessToken / *token / *secret in extra.metadata
```

`scripts/langsmith/` (see `docs/splotch-agent/operations.md` → "Credentials and
LangSmith traces") runs this assertion.

**Rule.** Anything you put on run `context` is published to the tracing backend,
on every run in the tree. Either keep credentials off `context`, or scrub them
at the tracing boundary.

**Status (2026-09-30): designed out at the tracing boundary.**

- `workers/agent-harness/src/config/trace_redaction.py` makes every
  `langsmith.Client` scrub inputs, outputs and metadata before upload. It covers:
  - the global cached client that LangChain's tracer uses;
  - any client built later, including `langgraph_api`'s own.
- Keys whose names look like credentials (`*token`, `*secret`, `*claim`,
  `cookie`, `authorization`, `*apikey`) are replaced.
- So are values shaped like a Supabase auth cookie or a bearer header, whatever
  key holds them.
- The harness still receives and uses the credentials at run time.
- `tests/unit/test_trace_redaction.py` runs a real LangGraph graph through
  `LangChainTracer` into a local HTTP sink and asserts that no fake credential
  reaches the uploaded bytes.
- A negative control, the same run without the install, reproduced the leak.

The traces recorded before the fix were left to expire (retention is 14 days)
rather than deleted, and no sign-out was forced (user decision, 2026-09-30).
