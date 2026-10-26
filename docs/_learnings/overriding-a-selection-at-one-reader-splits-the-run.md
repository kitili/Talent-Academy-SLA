# Overriding a selection at one reader splits the run

**Scope:** transferable
**Area:** any value that selects behaviour and is read in several places; here the agent harness's run
model (`runtime.context.model`). Found 2026-10-19 while adding Jev model routing.
**Status:** designed out on 2026-10-19 by `run_model_id` and a source-scan test.

## The symptom

No error. The first design for model routing swapped the model inside `DynamicModelMiddleware`'s
`wrap_model_call`, which looks like the place that picks the model. Under it, the run would have:

- called Kimi K3;
- billed Opus 5.5's rate;
- sized summarization for Opus's 1M window, though Kimi's is 256K;
- bound Opus's browser toolset to a model that needs the generic tool;
- logged Opus on its errors.

## Why it was misleading

The middleware's name and docstring said it chooses the model, and the model call did change. Every
other consumer kept reading the original field, and none of them fails loudly on a mismatch. Billing
prices whatever id it is given, and summarization just compacts late.

## Why it happens

Eight places read the run's model from the context:
- the model swap
- billing (`billing_middleware/middleware.py`)
- browser-tool binding (2 sites)
- summarization (6 call sites)
- error logging
- two tools

A second trap sits under the first: storing the override back on the context object fails too.
LangGraph does not re-run `before_agent` when a run resumes after an interrupt, and the client
re-sends its original context, so the override would vanish after every approval card.

## What to do

- Before overriding a selector, grep every reader of it (`getattr(context, "model"` and
  `context.model`), not just the obvious consumer.
- Put the override where it survives the run's lifecycle (checkpointed state, here `routed_model`).
- Route every reader through one accessor (`run_model_id(state, context)`).
- Add a test that scans the source for direct reads, so a new reader cannot bypass the accessor
  (`test_no_reader_reads_the_callers_model_directly`).
