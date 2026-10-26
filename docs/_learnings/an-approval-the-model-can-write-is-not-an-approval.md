# An approval the model can write is not an approval

**Scope:** transferable
**Area:** agent-harness tools that carry consent or route a production action across several
calls: `netsuite_deploy`'s combined build, `start_build`, and anything like them.
**Status:** designed out for the combined build on 2026-09-28
(`workers/agent-harness/src/middleware/netsuite_middleware/deploy_batch.py`). The trap is open for
the next tool that keeps state between calls.

## The trap

A combined build deploys one job per target under one approval card, so something has to remember
between calls that the card was approved, for which files, to which account. The first version
kept that in the workspace: the routing came from `/build_with_splotch/context/manifest.json`, and
the card read the account from the manifest's `deploy_target`. It looked safe, because the server
wrote the manifest, `save_to` and `delete_file` refuse that path, and the deploy route re-checks
authority.

But the VFS is the model's scratchpad. `write_file` and `edit_file` may rewrite the manifest on
purpose, since Mode B authors it (`filesystem_middleware/config.py`, `PROTECTED_PATHS`). So a
model, or content it was steered by, could put one account on the card while the server deployed
to another, or re-route a later continuation that no longer shows a card.

Two neighbouring traps have the same shape:

- **Two calls in one model step see the same state.** LangChain's agent sends each tool call of one
  `AIMessage` to the tool node as its own `Send`, in the same superstep, and every one reads the
  same state. Two `netsuite_deploy` calls read the same approval record and would queue the same
  target twice. Both then write `deploy_batch`, a key without a reducer, and LangGraph raises
  `InvalidUpdateError`, but only after both jobs were queued.
- **A tool re-runs from the top when its interrupt resumes.** Nothing computed before
  `interrupt()` survives into the resumed run. `start_build` previews again on resume, and the
  approval only counts if it echoes the fingerprint the card showed (`binding`). Without the echo,
  the tool would have admitted whatever the fresh preview said, which is not what the user saw.

## The check

- Anything that authorizes, or routes, a production action lives in a state key that only a tool
  writes (`build_admission`, `deploy_batch`), never in a file under the VFS. A file can describe
  the build for the model to read; it must not decide anything.
- Bind a stored approval to a digest of exactly what the card showed (here: the admission, the
  order and every staged file), and decide "approved" in one function that the middleware and the
  tool both call (`batch_approval_status`), so the two cannot disagree.
- A tool that reads, then writes, shared state refuses parallel calls of itself before any of them
  runs: `NetSuiteMiddleware.after_model` answers each such call with an error, so the tool node
  skips them all (the pattern `TodoListMiddleware` uses for `write_todos`).
- A card whose approval must match the state it showed carries that state's fingerprint and
  requires the echo (`approveDecision`), rather than trusting the resumed run to see the same state.

## Evidence

- `workers/agent-harness/tests/unit/test_netsuite_deploy.py`:
  `test_routing_comes_from_the_admission_not_the_manifest_file`,
  `test_parallel_build_steps_are_refused_before_any_runs`, and
  `test_the_approval_covers_exactly_what_the_card_showed`.
- `workers/agent-harness/tests/unit/test_destructive_action_middleware.py`:
  `test_a_rewritten_manifest_cannot_change_the_account_on_the_card`.
- `workers/agent-harness/tests/unit/test_start_build_tool.py`:
  `test_an_approval_that_does_not_echo_the_fingerprint_admits_nothing`.
