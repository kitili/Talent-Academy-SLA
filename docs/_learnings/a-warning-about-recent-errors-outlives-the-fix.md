# A warning about recent errors outlives the fix

**Scope:** transferable
**Where:** `workers/agent-harness/src/middleware/loop_detection/middleware.py`
(`_recent_tool_error_warnings`), 2026-09-30. Plan:
`plans/splotch-agent/migration4-run-review-plan.md` §4.
**Status:** designed out 2026-09-30.

## What happened

`create_report` rejected three report bodies, and each error named its fix. The fourth
body was stored. The `## Repeated Tool Error Warning` ("Recent tool calls are failing …
Do not retry the same tool") stayed on the next **31** model calls, across two later runs
that never called `create_report`. The agent opened about 16 turns with a variant of "the
`create_report` errors are resolved", to a user who had never seen an error.

## Why it is a trap

- **"Recent" was a window, not a state.** The notice counted error results among the last
  80 messages, and nothing after an error could cancel it. A success is exactly the event
  that makes the warning false, and it was ignored.
- **The window crossed runs.** Other counts in the same middleware were per run. This one
  was per 80 messages, so it rode into runs that started after an answered card.
- **Its category was an accident.** It was the first 90 characters of the error text. It
  happened to stop before the file name, so three different files grouped as one. A longer
  path would have split them, and a shorter one would have merged unrelated faults.
- **It costs almost nothing in tokens and a lot in trust.** Every one of those turns still
  made its tool call. The damage is a transcript that argues with an invisible notice.

## The check

For any notice raised by "N recent failures", replay: fail, fail, succeed, then several
unrelated calls. The notice must be gone on the call after the success.

## The remedy

- Errors are counted per run (`run_scope`).
- A success of a tool clears the errors counted for that tool.
- A JSON error's `code` (`invalid_body`) is its category.
- `create_report` is keyed by `file_path`.
- `test_run_scoped_budget_and_notices.py` replays the three rejections and the stored
  report.
