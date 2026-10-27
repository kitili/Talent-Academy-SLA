# An argument moved into harness state vanishes from the card

**Scope:** transferable
**Area:** the agent harness's approval tools (`netsuite_middleware/config_tools.py`) and the approval card
(`DestructiveActionCard.tsx`, `ConfigChangeApprovalReview.tsx`); found 2026-10-08 while taking the review digest out of
the model's hands (organization record-writes plan, task T3).

## The symptom

None shipped, which is the trap. To stop the model retyping an opaque value, `netsuite_config_apply` lost its
`review_digest`, `request_id`, `canvas_id` and `settings` arguments: the preview now stores them in the harness state
key `config_change_preview`, which only the tool writes. But the approval card never read the tool; it read
`interrupt.args`, the arguments of the paused call. With the arguments gone, the card would have had no request id to
fetch, so it could never load the server record, and approval (which now waits for that record) would have been
impossible for every config change.

## Why it is misleading

Every test of the tool passes: it posts the stored digest byte for byte. Every test of the card passes: it is given
`args.request_id` in its fixture. The break is only in the hand-off between them, and nothing exercises that hand-off
except a real interrupt.

A second, quieter form: a new state key that no middleware declares in its `state_schema` is dropped by the graph, so
the tool writes it and the next call reads nothing.

## The check

When a tool argument moves into state, grep everything that reads `interrupt.args` or the tool's arguments (the card,
replayed cards, transcript rendering) and either put the value back from state in the middleware or change the reader.
Declare every new state key in a middleware's `state_schema`, and test that the compiled agent carries it.

## Evidence

Handled in the same change: the approval middleware injects the stored `request_id` and `canvas_id` into the card's
arguments and declares `config_change_preview`; `workers/agent-harness/tests/unit/test_netsuite_config_apply_binding.py`
pins both. Related: `an-opaque-string-the-model-must-retype-is-a-string-it-will-corrupt.md`,
`an-approval-the-model-can-write-is-not-an-approval.md`.
