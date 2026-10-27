# A loop detector keyed by target reads paging as looping

**Scope:** transferable
**Where:** `workers/agent-harness/src/middleware/loop_detection/`, 2026-09-29. Plan:
`plans/splotch-agent/map-as-agent-navigation-layer-plan.md`, Phase 1.

## What happened

`LoopDetectionMiddleware` counted repeated calls by one argument: a `read` by its `endpoint`, a file tool by
its path. The counts lived in `tool_call_counts` in checkpointed state and were never reset. Every third call
to one target, over the thread's whole life, injected "Stop and change strategy before making another
incremental call to the same target".

In a SuiteScript 2.1 workstream the agent made three calls to `/api/netsuite/artifacts`: a probe, an invoice
search and the first page of script records. That was enough to warn. The agent wrote in its next subagent
prompt that "the loop detector blocks it", which was false: the only hard rule refuses an identical read-only
file call. It then moved about nineteen pages of paging into a subagent, which could page unseen. The run
stalled for fourteen minutes.

The same rule would have flagged walking the system map (each step is another `focus` on one endpoint) and a
workstream saving its todo progress (each is a `PATCH` to one endpoint).

## Why it is a trap

- A target is not a call. Pages, filters and focuses are what make calls different, and they live in the
  arguments the key threw away.
- "Advisory" is in the code, not in the words. "Stop and change strategy" reads as a block, and a model
  obeys the words.
- A counter in durable state outlives the run it describes. Nothing about a turn two days ago says this turn
  is looping.
- The workaround is worse than the loop. Hiding paging in a subagent removes it from the detector's sight
  and from the user's, and costs the same.

## How to avoid it

- Count per run, from the run's own messages.
- Key a call by its identity: target plus normalised arguments. Tell repeats (identical calls) apart from
  paging (calls that differ only in `offset`, `limit`, `cursor`, `page`), and give paging a much higher bar.
- Word advisory output as advice ("This is advice, not a block"), name the narrower query, and say that
  handing the calls to a subagent is not a fix.
- Test with a replay of the real call sequence, not only synthetic repeats: `test_replay_of_the_artifacts_paging_run_is_not_a_loop`.
