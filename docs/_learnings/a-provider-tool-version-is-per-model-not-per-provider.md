# A provider tool's version is per model, not per provider

**Scope:** transferable
**Where:** `workers/agent-harness/src/middleware/computer_use_middleware/config.py`
(`COMPUTER_TOOL_TYPE`, `COMPUTER_USE_VARIANTS`), 2026-09-29.

## What happened

The harness bound Anthropic's computer tool as one constant,
`COMPUTER_TOOL_TYPE = "computer_20251124"`, for every model mapped `"native"`.
That covered every Claude model, because the variant map only asked "is this
Anthropic?". Claude Opus 5.5 was registered in the harness, priced, and made the
production model on 2026-09-23. Every browser run on it then failed its first
model call:

```text
'claude-opus-5-5' does not support tool types: computer_20251124.
Did you mean one of ... computer_toolset_20260801 ...?
```

On the Claude API, Claude 5.5 accepts only `computer_toolset_20260801`. Opus 4.8,
Opus 5 and the 4.x models accept the old tool. Nothing in the registration
checklist asked which tool version the new model takes, and the wiring contract
checked only that a variant *existed*.

The fix was not a one-line version bump. The toolset is a different wire
protocol:

- the model calls 17 members by name instead of one `computer` tool with an
  `action`;
- every member call and every result answering one must carry
  `toolset_name: "computer"`;
- the model batches actions and expects them run in order.

LangChain (1.4.3, and `master` on the same day) drops `toolset_name` when it
replays history. So even a correct binding would have failed on the *second*
model call of every run: the first call succeeds, the thread looks healthy, and
the replay 400s.

## Why it is a trap

- Provider-built tools look like a property of the provider. They are versioned
  per model, and a new model can drop the old version entirely, not just add a
  new one.
- Registration checks prove presence, not compatibility. "Opus 5.5 has a
  computer-use variant" was true and green. The variant just named a tool the
  model refuses.
- The failure only shows up in a path the smoke test may not take: a run that
  never opens the browser never binds the tool.
- The replay half hides behind a successful first turn, and behind a library
  that serializes messages for you: the tag is present on the parsed response
  and gone from the next request.

## How to avoid it

- When a new model is registered, check each provider-built tool you bind
  against that model's accepted versions, not just the provider's docs for the
  tool. Operations lists this in the model checklist.
- The client contract now fails if a Claude 5.5+ production or preview model maps
  to any variant but `"toolset"`. The harness test pins the same rule for every
  entry in the map.
- For a wire field the client library does not model, test the **replayed**
  request, not the first one. `test_unpatched_langchain_drops_the_tag` records
  the library gap, so the shim (`toolset_wire.py`) can be deleted when it closes.
- Probe the live API before designing around an assumption. Six probes on
  2026-09-29 settled which history the API accepts. Mid-thread model switches
  turned out to need no translation in either direction, which removed a whole
  phase of the plan.
