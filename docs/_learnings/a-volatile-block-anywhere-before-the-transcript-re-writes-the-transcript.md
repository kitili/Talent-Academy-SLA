# A volatile block anywhere before the transcript re-writes the transcript

**Scope:** transferable
**Where:** `workers/agent-harness/src/middleware/prompt_caching/`, `loop_detection/`, `step_budget/`,
`filesystem_middleware/tool_call_compaction.py`, `computer_use_middleware/middleware.py`, 2026-09-30.
Plan: `plans/splotch-agent/langsmith-trace-review-plan.md` §4 (decision D1).

## What happened

The harness put three Anthropic cache breakpoints on every request: the last tool, the last *stable* system
block, and the automatic breakpoint at the end of the messages. Per-call warnings (`## Loop Detection
Warning`, `## Paging Note`, `## Repeated Tool Error Warning`, `## Duplicate User Message Notice`,
`## Step Budget Warning`) were appended to the system prompt *after* the stable breakpoint, which looked safe:
the product prefix stayed cached.

It was not safe. Over 14 days of production Opus traces, 154 mid-turn calls re-wrote the whole transcript to
the cache although the transcript had not changed, $143.55 of $196 in cache writes. The signature was
`cache_read` pinned at ~15.7K tokens (tools plus stable system) while the context grew to 200–250K. The most
expensive trace ($41.72) paid about $1.30 per call instead of $0.13 because the step-budget counter changed on
every call. Diffing consecutive prompts put the causes at:

- a system block that appeared, changed or disappeared: ~60%;
- tool-call argument compaction sliding its 30-message window by one message per call: ~23%;
- screenshot pruning: ~16%.

`## Step Budget Warning` was not even in `DYNAMIC_SYSTEM_BLOCK_PREFIXES`, so on those calls the "stable"
breakpoint sat on the changing block itself.

## Why it is a trap

- **The cache is one prefix, in the order tools → system → messages.** A breakpoint is a *position* in that
  prefix, not an independent cache. Changing any byte before the transcript changes every position after it,
  so every transcript entry misses. "Volatile blocks go after the stable breakpoint" protects only what is
  before the breakpoint.
- **A rewrite far back costs the same as a rewrite at the top.** A hit is looked for at most 20 content blocks
  before a breakpoint. Compaction and pruning rewrite messages 30+ back, so the nearest reusable entry is the
  system breakpoint and the whole transcript is written again, not just the rewritten span.
- **A note at the end still needs care.** Moving a notice to the end of the request is half the fix: the
  automatic breakpoint then lands *on the notice*, and the entry it writes contains text the next call does
  not send. A notice that persists across calls (the step-budget counter) would leave no reusable entry at all.
- **Nothing fails.** The request is valid, the answer is right, and the only symptom is a cost line.

## How to avoid it

- Never append per-call text to the system prompt. `append_request_notices` in
  `prompt_caching/middleware.py` is the one path: it adds a request-only `HumanMessage` (marked
  `splotch_request_notice`) after the last human or tool message, which langchain-anthropic merges into the
  final user turn as trailing text blocks. It is never written to state.
- When a notice is present, `StablePromptCachingMiddleware` puts the transcript breakpoint explicitly on the
  last block *before* it and drops the automatic one. A tool result is tagged by rebuilding the exact
  `tool_result` block langchain-anthropic would send, so the tagged bytes equal what the next call replays.
- Rewrite history in chunks, never with a sliding window: compaction moves its boundary in steps of 20
  messages (`_COMPACTION_CHUNK_MESSAGES`), screenshot pruning fires once per 10 stale frames
  (`SCREENSHOT_PRUNE_BATCH`).
- Test the serialized request, not the middleware output:
  `workers/agent-harness/tests/unit/test_prompt_cache_stability.py` runs a multi-call run through the real
  middleware, serializes each request with `ChatAnthropic._get_request_payload`, and asserts the prefix up to
  the previous call's breakpoint is byte-identical except at a chunk boundary.
- To check production, compare `cache_read` with `input_total` per call: a mid-turn call whose read stays at
  the stable-prefix size is a break. The review's scripts in the plan (§12) find the first changed block.

**Status:** designed out on the harness 2026-09-30. A chunk boundary still re-wrote the transcript once per
chunk, and on short runs that step landed mid-message (20–33% of a run's cost in three benchmark runs). Since
2026-10-23 compaction's boundary is held in state and moves only when the cache is already cold
(`prompt_cache_is_cold`, `plans/splotch-agent/compaction-on-cold-cache-plan.md`), so a rewrite happens only
when the next call writes the cache anyway. Screenshot pruning still moves in batches of 10: it bounds
checkpoint memory, not tokens.
