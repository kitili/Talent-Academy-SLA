# A side model call inside middleware is invisible to a meter that prices saved messages

**Scope:** transferable
**Area:** agent harness billing: `workers/agent-harness/src/middleware/billing_middleware/middleware.py`
(the meter) and `workers/agent-harness/src/middleware/summarization/middleware.py` (the side call).
**Status:** fixed for the summarizer on 2026-10-19 by `meter_side_call` (onboarding-to-extraction
billing plan, task T3).

## The symptom

Every compacted conversation ran a Haiku 4.5 call over up to 400,000 characters of history, and no
`agent-token-usage` event was ever sent for it. This was read from the code; production spend was not
measured. Billing looked complete:

- every saved `AIMessage` was priced;
- the de-duplication ledger (`billed_message_ids`) was clean;
- `test_billing_claim_gate.py` was green.

## Why it was misleading

The meter runs "after every model call", so it reads as if it covered every model call. It does not.
It runs after the agent's model node, and it prices only the last `AIMessage` in
`state["messages"]`. Compaction's call happens inside `wrap_model_call`, inside the same model node,
and its reply is turned into summary text. It is never saved as a message. So the hook fired, saw the
agent's own reply, priced it correctly, and had no way to know a second provider call had happened.
No error, no zero, no warning: the spend simply had no record.

## Why it happens

The meter is keyed on the transcript, not on the provider. Any call a middleware makes for itself
leaves no trace in the transcript:

- a summarizer;
- a classifier or router;
- a guard model;
- a query rewriter.

Here `_generate_summary_sync` / `_async` called `init_chat_model(...).invoke(...)` and kept only
`response.content`, dropping the `usage_metadata` a meter could have priced. The model was cheap and
the call was rare, which is why nobody noticed. It is not small on a long onboarding thread.

## What to do

- For every meter that prices saved messages, list every model call that does not end up as one:
  `grep -rn "init_chat_model\|\.invoke(\|\.ainvoke(" src/` and rule each hit in or out. A tool's own
  `.invoke` (Tavily, for instance) is not a model call, but it may still be a paid API the meter cannot
  see.
- Keep the response, not only its text. Hand it to one shared function that applies the same "who
  pays" rule as the main meter. Here that is `meter_side_call(state, runtime, model_id, response)`,
  which uses `billable_org`, so an unclaimed turn stays free there as well.
- Test the side call through the real wrapper (`wrap_model_call`), with a fake model that reports
  usage. Assert that the charge goes to the verified payer, and that nothing is charged when the call
  fails, when billing is off, or when the turn is unclaimed (`tests/unit/test_summarization_billing.py`).
- Prove the test by removing the meter call: it must fail.
