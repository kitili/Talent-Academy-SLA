# A hint from another schema is worse than no hint

**Scope:** transferable
**Area:** `create_report`'s validation errors
(`workers/agent-harness/src/middleware/filesystem_middleware/artifacts/report_schema.py`), and any
validator that borrows the Word/Excel spec's `_format_error` (`artifacts/validation.py`).
**Status:** fixed for the report schema on 2026-09-30 (E4 of
`plans/splotch-agent/langsmith-trace-review-plan.md`). The shared formatter itself is unchanged.

## The trap

The report validator reused the document spec's error formatter to get friendly messages. That
formatter builds its "did you mean" and "allowed fields" hints from the **Word/Excel spec's** field
names (`_ALL_FIELD_NAMES`), whatever schema raised the error. On a report body it said:

- `sections[0].blocks[1].embed.focus: unexpected field 'focus' → allowed fields: accent, align,
  artifact_type, attribution, …`. The real fix was to move `focus` inside `embed`.
- `sections[0].blocks[2].recommendation.body: unexpected field 'body' → did you mean 'body'?`. `body`
  is a Word callout field, so the fuzzy match returned the same name.

Over 14 days, 48 `create_report` rejections were counted, including one run that retried 18 times.
Every hint pointed at a document the agent was not writing.

## Why it is easy to miss

The message has the right shape, with a path, the offending field and a suggestion, so it reads as
helpful in a code review. Only the suggestion's source is wrong, and a test that asserts "the error
names the path" passes. The model trusts a hint more than a bare error, so a wrong hint costs more
turns than no hint.

## The check

Feed each schema's validator a body with one misspelled field in each nested model. Assert that
the hint lists only that model's fields. `test_trace_review_tool_text.py` does this for reports and
also asserts that no report error names a Word field (`artifact_type`).

## The remedy

`_report_error` in `report_schema.py` finds the report model at the error's path and hints from its
fields. The common mistakes get a sentence naming the fix: a flattened embed, a Word-style callout,
a recommendation `body`, a heading used as a block, and a top-level `body`. The `create_report`
description carries a complete body that validates and uses every block type, which the same test
checks.
