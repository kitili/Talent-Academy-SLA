# An evaluator library logs its own feedback inside a test case

**Scope:** transferable

Found 2026-10-06 while building the agent-eval judges (`workers/agent-harness/evals/evaluators/`).

## The symptom

Inside a `@pytest.mark.langsmith` test, an `openevals` or `agentevals` evaluator called as a function
returns its result **and** writes it to LangSmith as feedback, under its own key
(`score`, `trajectory_<mode>_match`, ...). Code that also logs the returned score with
`t.log_feedback` gets every score twice, under two keys. Nothing errors; the experiment just carries
duplicate, differently named metrics, and a summary over "every numeric key" counts them both.

## Why it is easy to miss

The evaluators look like pure functions: inputs in, a dict out. The logging is a side effect in
`openevals/utils.py` (`_run_evaluator_untyped`, the `_TEST_CASE` branch), which checks whether a
`langsmith.testing` case is active. Outside pytest, in a scratch script, it logs nothing, so a quick
manual check shows the expected single result.

## What to do

- For `create_llm_as_judge`, pass an `output_schema`: the evaluator then returns the raw structured
  verdict and logs nothing. The eval judges do this (`evals/evaluators/judge.py`).
- `agentevals.create_trajectory_llm_as_judge` and `create_trajectory_match_evaluator` have no such
  switch: use their prompt constants through your own judge, or match trajectories yourself
  (`evals/evaluators/trajectory.py` does both, and a unit test checks its verdicts agree with agentevals').
- The library still opens its own nested `t.trace_feedback`, so a judge's model call may show as a
  separate evaluator trace.
