# A recovery path that loses what it paid for

**Scope:** transferable
**Area:** background ingestion extraction (`src/app/api/background-ingestion/resume/route.ts`,
`src/utils/background-ingestion/waveBatches.ts`). The same shape applies to any retry loop around a
paid call.

**Status:** designed out for jobs on `INGESTION_EXTRACTION_RECOVERY_ENABLED`
(`plans/netsuite-ingestion/ingestion-model-call-recovery-plan.md`, 2026-10-03). Unstamped jobs still
run the old code until the flag is on by default.

## The symptom

The ingestion's retry machinery looked thorough. A failed batch was retried 3 times in-process, then
in up to 4 retry waves, a failed artifact write fell back to a placeholder, and nothing crashed. Three
of those safety nets were where the money went:

1. **The same prompt, bought twelve times.**
   - A provider-batch request covers 10 chunks. When its answer did not parse, the retry wave re-sent
     the *same 10-chunk prompt*: 3 in-process attempts × 4 retry waves = 12 calls.
   - The calls were answered and billed every time, and the model gave much the same answer each time.
   - PROD jobs `89fc4374`, `716bce98`, `d629466b` and `8c08dd43` each show exactly 12 retry rows after
     one bad request, at $1.02 to $1.35 each, 28% to 44% of the job's extraction spend.
   - If the twelfth failed too, the range was set aside with `failed_batches = []` and no record.
2. **An empty placeholder over paid results.**
   - When saving a wave's results failed, the catch block wrote `{ processes: [], corrupted: true }` at
     the same index "so merge doesn't crash".
   - That index is the wave's idempotency marker, so the wave counted as done: its paid answers were
     gone and nothing would ever re-send them.
3. **Metering that overwrote its own retries.**
   - Retry calls were keyed `wave:<retry wave>:batch:<slice-local index>`. Every one-batch retry slice
     had index 0, so each retry overwrote the last in `ai_usage_events` (it updates on a repeated key).
   - Job `0b11689c` had 4 failed requests and kept 2 retry rows. The balloon was invisible to the
     instrument meant to show it.

## Why it was misleading

Each net is reasonable on its own, and each is right for errors where no answer came back: a
dropped socket, a 429. For an *answered* prompt (unparseable output, or a client timeout while the
completion route keeps generating and bills), a re-send buys the same output again.

"Retry" hid the difference between "the request did not happen" and "it happened and we did not
like the answer". The placeholder read as resilience ("the job keeps going"), and it was the one
line that deleted paid work.

## The check

For every retry around a paid call, ask:

- **Did an answer come back?** If yes, the next attempt must change something: split the input,
  shrink it, or stop. Re-send unchanged only when nothing came back.
- **What does the fallback overwrite?** A fallback that writes to the key a resume reads as "done"
  converts a transient failure into permanent loss. Let the step fail and resume instead.
- **Is the retry metered under a key unique to the item and attempt?** Count rows per job against
  calls made. If a job with N failures shows fewer than N retry rows, the keys collide.
- **Where does an exhausted item go?** If the answer is `[]`, it is lost without a trace. Record it,
  with a reason.

Related: [a-swallowed-error-reads-as-an-empty-result.md](a-swallowed-error-reads-as-an-empty-result.md),
[a-bounded-read-is-not-an-ordered-one.md](a-bounded-read-is-not-an-ordered-one.md),
[a-wiring-test-that-reads-the-dead-path.md](a-wiring-test-that-reads-the-dead-path.md)
