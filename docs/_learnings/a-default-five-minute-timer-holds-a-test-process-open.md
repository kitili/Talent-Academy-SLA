# A default five-minute timer holds a test process open

**Scope:** transferable
**Area:** the Node test runner (`node --test`, one process per file) with a jsdom `window` and TanStack Query; found
2026-10-26 in `plans/tooling/test-suite-speed-plan.md`.
**Status:** designed out on 2026-10-26 by `scripts/test-runtime/unref-long-timers.mjs` (a timer of a minute or more no
longer keeps a test file's process alive), `gcTime: Infinity` in the two files that showed it, and the runner's
per-file report, which names a file that stays open.

## The symptom

`yarn test` went from 2.46 min (2026-10-08) to 7 to 8 min on a quiet machine with the same hooks in place. The pass and
fail counts were fine. Per file, `tests/unit/canvas/versionView.test.ts` and `tests/unit/live-report/inlineReportCard.test.ts`
each took **309 s of wall time for 8.6 s of CPU and 0.3 to 0.5 s of test body**. Run alone, the last test printed at +6 s and the
process ended at +305 s.

## Why it was misleading

It looked like import cost (the 2026-10-08 story), because "wall time minus test time" is also how a slow import shows
up. It is the opposite: nothing is loading. And the report is green: a process that lingers after its last test passes
every assertion, so no failure points at it. Two such files left the other 13 slots idle for the last 160 s of the run
(428 s against 270 s once they were fixed), and the first of them arrived on 2026-10-17, a week before anyone measured.

## Why it happens

A test calls `setupReactDom()`, which defines `window`, and then builds a `QueryClient` with the default options. With
`window` present TanStack Query no longer treats the process as a server (where its `gcTime` default is `Infinity`), so
each query arms a 300 000 ms garbage-collection timer, and nothing in the test clears the client. A Node timer keeps
the event loop alive; `node --test` waits for the child process to exit. `process.getActiveResourcesInfo()` after the
last test showed 14 `Timeout` handles. Three other tests in the repository already carry the lesson in a comment
(`gcTime: 0` or `Infinity`, "so no garbage-collection timer holds the file open").

## What to do

- **Look for it:** per file, wall time far above CPU time plus test body. The runner prints the slowest files after a run and warns
  about a file that stayed open 30 s or more after its last test (`scripts/test-runtime/file-timer.mjs`, `formatFileTimes` in
  `scripts/test-run-record.mjs`). By hand: `setTimeout(() => console.error(process.getActiveResourcesInfo()), 40_000).unref()` in a preload.
- **Fix it at the source:** `gcTime: Infinity` (or `queryClient.clear()` in `after`) on every `QueryClient` a test builds after `window` exists.
- **The guard:** the test runner unreferences timers of 60 s or more, so a forgotten client no longer costs minutes. It
  does not replace the fix for a short timer (a 30 s timer still holds a file for 30 s).
- **Do not reach for `--test-force-exit`:** it removes the wait by calling `process.exit` while handles are still closing, and on
  Windows with Node 24.19 that tripped a libuv assertion (`src\win\async.c`, `UV_HANDLE_CLOSING`) in `getUserInfo.test.ts` in 11 of
  15 full runs, turning a passing file red.

## Evidence

Baseline 421 to 465 s (median 428, four runs); with the preload 270 s (269, 270, 273); the two files in 5 s each with `gcTime: Infinity` and no preload.
`docs/_global/testing/README.md`, *Test-Only Module Loading*, has the rule and how to walk it back.
