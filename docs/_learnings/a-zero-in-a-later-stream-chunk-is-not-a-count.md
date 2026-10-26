# A zero in a later stream chunk is not a count

**Scope:** transferable

**Symptom.** Standard (non-batch) Anthropic rows in `ai_usage_events` showed `input_tokens = 0` with
real output tokens: 175 of 177 PROD rows when the recovery plan measured it, 198 of the first 200
read on 2026-10-03. Their cache tokens were recorded but priced at nothing, so those calls cost only
their output.

**Why it misled.** The merge looked defensive: `next.inputTokens ?? existing?.inputTokens` keeps the
old value when a chunk has none. But LangChain (`@langchain/anthropic` 1.4.0,
`dist/utils/message_outputs.js`) does not leave the field out on later chunks. It reports the input
count (cache tokens folded in) only on `message_start`, and every `message_delta` carries a
hard-coded `input_tokens: 0` beside the cumulative output count. `0 ?? x` is `0`, so the last chunk
won. The cache counts survived only because `message_delta` has no `input_token_details`, and the
cost calculator then capped cache tokens at the (zero) input count, which hid them too.

**The check.** For a field folded across stream chunks, ask what each chunk type sends, not only
whether the field can be missing. Provider stream counts are cumulative per message, so take the
largest value seen (`mergeSplotchAiCacheUsage` since 2026-10-03). Replay one real message's chunk
shapes through the fold (`tests/unit/splotch-ai/anthropicStreamUsage.test.ts`), and look at the
rows: a field that is zero on nearly every row while its neighbours are not is a merge, not usage.

**Evidence.** Plan `plans/netsuite-ingestion/ingestion-model-call-recovery-plan.md` §6 and §10;
fix on `feat/ingestion-billing` (2026-10-03). Rows written before the fix keep their undercount.
