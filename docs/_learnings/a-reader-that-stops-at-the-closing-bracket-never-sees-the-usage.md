# A reader that stops at the closing bracket never sees the usage

**Scope:** transferable
**Area:** any metered model stream read by a parser that knows when its value is complete. Found in the Splotch
population job: `generateProcessCurrent.server.ts` read the model stream with `dotsonTextToDotsonElementsGenerator`.
**Status:** fixed for the population job's generation and sweep on 2026-10-09 (`readTextToEnd`,
`src/utils/dot-json/stream.ts`). Any other metered consumer that parses a stream directly is still exposed.

## The symptom

Every population job showed 0 tokens and no cost on its row. In `ai_usage_events`, each generation had an `estimate`
row with tokens and an `actual` row with:

```
event_type = 'actual', status = 'cancelled', total_tokens = 0, usage_source = 'splotch_ai_stream_usage'
```

The sweep had no `actual` row at all. The splotches themselves were complete and correct.

## Why it was misleading

- **The diagram was complete.** Nothing was cut short in anything a person could see, so "cancelled" read as a
  mislabel rather than as the stream really being cancelled.
- **The unit tests passed.** They used fake recorders and fake streams with no gap between the last character and the
  trailing chunk. A fake that yields `]` and then `''` straight away is fully read; the real stream, with network delay
  between the two, is not.
- **The estimate rows looked like usage.** They carry token counts, so a glance at the table said metering worked.
  The job rollup counts only `actual` rows with `status = 'succeeded'`, which is why it read 0.

## Why it happens

The provider sends token usage in a final chunk after the last character of content. The engine's stream
(`src/lib/splotch-ai/configurations.ts`, `generatedStream`) starts with `status = 'cancelled'` and only sets
`succeeded`, with the merged usage, if it is read to its end.

The dotson reader pipes the stream through a JSON parser. Once the root array closes, the parser finishes and cancels
its source, so the engine's `finally` runs with `cancelled` and no usage. The sweep's reply went into a `Response`
whose body was never read to its end, so the engine never finished and nothing was recorded.

Measured with the real model on 2026-10-09 (no database writes):
- Draining the raw stream: `succeeded`, 2,153 input and 973 output tokens.
- The same call parsed directly: the source was closed after 989 chunks, `cancelled`, `{}`.
- With `readTextToEnd` first: `succeeded` with usage, for both the generation and the sweep.

## The check

- When a stream is metered, read it to its end before handing it to anything that may stop early. Background work
  loses nothing by not streaming.
- Test against a stream with a pause before its trailing chunk
  (`tests/unit/ai-metering/splotchPopulationActualUsage.test.ts`). Without the pause the trap does not show.
- Verify metering on the `actual` rows and the job rollup, never on the presence of `estimate` rows.
