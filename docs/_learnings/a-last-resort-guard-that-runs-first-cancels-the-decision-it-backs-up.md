# A last-resort guard that runs first cancels the decision it backs up

**Scope:** transferable
**Where:** `workers/agent-harness/src/middleware/summarization/middleware.py` (`wrap_model_call`,
`awrap_model_call`), 2026-10-05. Found by eval C16 (`workers/agent-harness/evals/dataset/cases/c14_proof.py`).

## The symptom

A long Kimi K3 history (~219K estimated tokens, window 256K) was never summarized. Every model call
logged `[summarization] Model request is oversized before provider call: 253190 tokens > 204800;
compacting recent payloads`, the run carried ~250K tokens on every call (1.1M input tokens for one
case), and `total_summarizations` stayed 0. A static check of the same history said
`_should_summarize` → True.

## Why it was misleading

- The summary trigger (0.65 × window = 166K) and the final-request guard (0.80 × window = 204.8K)
  each looked right on its own, and the unit tests covered each on its own.
- The guard ran **first**: it shrank the history (old tool arguments dropped, long messages cut to
  16K/8K/4K) to ~127K, and the summary decision was then made on the shrunk size, under the trigger.
  So no summary was planned, and the guard re-shrank the full history on every later call.
- A history that grows a little per call crosses the trigger before the guard and summarizes
  normally. Only a history that **jumps** past the guard in one step (a large tool result, a resumed
  thread, a model switch to a smaller window) falls into the gap, which is why nothing in production
  or the tests had shown it.

## The check

- When a last-resort path (guard, fallback, truncation) sits beside a primary decision (summarize,
  retry, compact), make the primary decision on the **unmodified** input first, and let the
  last resort run only on what the primary path leaves.
- Test the jump, not just the growth: an input over both thresholds at once, built so the last
  resort alone would bring it under the primary threshold
  (`test_a_history_that_jumps_past_the_guard_is_summarized_not_only_truncated`, which fails on the
  old order and passes on the new).
- In traces: a run that logs the guard warning on every call and never a `Compacting:` line.
