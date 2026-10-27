# An interrupt ends the run, but not a count that starts at the user's message

**Scope:** transferable
**Where:** `workers/agent-harness/src/middleware/step_budget/`, `loop_detection/`, 2026-09-30.
Plan: `plans/splotch-agent/migration4-run-review-plan.md` §5.
**Status:** designed out on the harness 2026-09-30 (`src/middleware/run_scope.py`).

## What happened

The step budget turns the client's `recursion_limit` (1000 supersteps) into turns: 11
supersteps a turn, so tools stop at turn 80 and the warning starts at 60. It counted
"AI messages since the last `HumanMessage`", and its docstring said that was the run,
because `recursion_limit` applies per run.

A staging workstream on 2026-09-30 had one typed message and then five answered
`ask_question` cards and one approval card. It made 7 LangGraph runs over 5 h 32 min, of
7, 8, 16, 5, 27, 9 and 9 turns. The count ran 7, 15, 31, 36, 63, 72, 81: the warning
arrived in the fifth run ("used 60 of 80"), and the seventh run had its tools switched
off at its ninth turn, before the last todo was saved. The agent spent its last 20 turns
"landing within budget" and skipped the comparison, the map and one generated file the
playbook asked it to show.

## Why it is a trap

- **A card answer is not a `HumanMessage`.** The graph resumes with a `ToolMessage`
  carrying the answer. Nothing in the transcript marks the run boundary.
- **The resume is a new invocation, with a fresh limit.** LangGraph sets
  `stop = checkpoint_step + recursion_limit + 1` each time it is invoked
  (`langgraph/pregel/_loop.py`), so the limit the budget protects had reset six times.
- **"Per run" reads true.** For a thread with no interrupts, the human boundary *is* the
  run. Tests built from `HumanMessage` + N `AIMessage`s pass. The more cards a workstream
  uses (which is the product's preference), the worse it gets.
- **A re-run tool call must decide the same way twice.** A call that raises an
  `interrupt()` is run again on resume, inside the new run. A check counted from the end
  of the transcript reads zero turns there, skips the `interrupt()` and loses the answer.

## The check

For anything scoped "per run", ask what the boundary is made of. If it is "the last
`HumanMessage`", replay a transcript with an `ask_question` answer in it. In LangSmith,
the thread has several root runs, and the harness counts across them.

## The remedy

- `TimingMiddleware` stamps every `AIMessage` with the LangGraph run id
  (`splotch_run_id`), in the `after_model` hook it already had, so no superstep is added.
- `run_scope.run_start` ends a run at the user's latest message **or** at the last reply
  another run stamped. Unstamped history falls back to the human boundary.
- Tool-side decisions count from the **reply that made the call**, so a re-run on resume
  reaches the same `interrupt()`.
- At the stop, the user gets the continue card (`ask_question`, "Keep going / Wrap up
  now"), because a resume really does restore the limit.
- `test_run_scoped_budget_and_notices.py` replays the thread's shape.
