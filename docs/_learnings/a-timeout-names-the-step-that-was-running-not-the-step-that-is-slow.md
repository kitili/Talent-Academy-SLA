# A timeout names the step that was running, not the step that is slow

**Scope:** transferable
**Area:** any multi-step job against a small managed Postgres instance (here a 1 GB Supabase instance behind PostgREST); acceptance runs of a build or migration that "fails in a different step each time".
**Status:** fixed for staging on 2026-10-16 (instance scaled from 1 GB to 2 GB; the next build published). The production instance's memory has not been examined.

## The symptom

Five builds in one day failed in four different steps, each with an error that named that step:

- the derived-config seed: `canceling statement due to statement timeout` (SQLSTATE 57014, against the API role's 8 s limit), 17:33 UTC;
- the publication seal: `Failed to load processes_with_content: canceling statement due to statement timeout`, four of them in one second;
- an earlier build's seed INSERT answered `520`, and the next write after it ended in a database restart;
- the last one: `the database system is not accepting connections` for a minute, then `Could not query the database for the schema cache`, and a version left `building`.

## Why it was misleading

Each error blamed the step that happened to be running, and each step was plausibly too heavy (a 21.6 MB value written whole, a seal that read two whole rows at once), so each failure was answered with a redesign of that step. Some of those redesigns were real defects and are worth having. But the seed that "timed out at 8 s" had passed at 13:20 with the same function and the same data, and when it was run alone, by hand, on a scratch version, it took **1.6-2.1 s** every time (the strip function 0.69 s, a plain read of the row 0.22 s). Four steps that each fail only sometimes, and each pass alone, are one cause that is not in any of them.

## Why it happens

A statement timeout is a budget measured in wall-clock time. On an instance whose memory is exhausted, every statement is slower, and the budget runs out in whichever step is running. Supabase's observability graphs showed the 1 GB instance holding about 0.9 GB in swap continuously, even when idle, and memory commitment peaking near 2.4 GB against a commit limit near 1.4 GB just before the restart at 18:15:45 UTC. The same build run from a developer machine (a slower client, so less load at once) published; run from the hosted app next to the database, with the agent and the Map reading alongside, it pushed the instance over its limit. After the instance was scaled to 2 GB the same code published at the first attempt, with no code change. (Not reproduced on a 1 GB instance that was not already in swap.)

## What to do

1. When a job fails in a different step each run, **time the failing step alone** on a scratch copy under the same `statement_timeout` before redesigning it. If it takes a fraction of the budget, the step is not the cause.
2. **Read the instance before the code:** memory used, swap, and commitment against the limit, at idle and during the run. Swap in use at idle means the instance is too small for its working set; resize first, then re-run the acceptance.
3. Keep both questions open: a step that is genuinely heavy (a whole-row write of tens of MB) still deserves its fix, and it is the swap that turns "heavy" into "fails". Record each failure with its time, step and cause so the pattern shows.
4. After a restart, look for work left half-done: a build cut off mid-run leaves its row in `building`, and its own failure call may have failed too (see `a-failed-version-is-sealed-against-its-own-cleanup.md`; operator SQL in `docs/repo-refresh/operations.md`, *NetSuite config section merge*).

Related: `a-short-cache-of-a-huge-row-lets-concurrent-callers-each-read-it-whole.md`, `a-helper-that-loads-a-whole-snapshot-loads-it-for-every-caller.md` (the real read-load defects found in the same run), `a-page-size-that-worked-on-small-versions-times-out-on-large-ones.md`.
