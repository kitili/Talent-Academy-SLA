# A parent that waits on a child is silent by design

**Scope:** transferable
**Area:** `sweepStalledBackgroundIngestionParents` (`src/utils/background-ingestion/parentChainSweep.ts`), the parent's `netsuite_wait_runtime_config` and `netsuite_wait_sdf` steps in `src/app/api/background-ingestion/resume/route.ts`.
**Status:** fixed for `netsuite_wait_runtime_config` on 2026-10-20 (`hotfix/runtime-config-heartbeat`). Open for `netsuite_wait_sdf` (same shape; not changed in the hotfix).

## The symptom

A customer's parent ingestion in `netsuite_wait_runtime_config` last wrote at 19:27:44 and then nothing, while its runtime-config child kept working. Nothing had failed yet, but the parent sweep was due to "recover" it: every 1800s of parent silence it re-armed the parent and stamped `job_state.watchdog.parentRecoveryCount`, and after three it fails the job loud with "Ingestion stopped responding in phase "netsuite_wait_runtime_config" and did not recover after 3 automatic restarts."

## Why it was misleading

The parent sweep's rule, "a `processing` row silent past the grace is dead", is right for a parent running a phase. A parent that is waiting does not run anything: the wait step re-reads the child, writes once, returns without enqueueing, and relies on the child's terminal write to wake it. Its silence measures the child's run time, not its own health. Each re-arm only re-observes the wait, so it looks harmless, but it spends recovery budget the parent may need for a real stall later (a materialize out-of-memory kill), and a child run longer than four grace windows (about two hours) failed a healthy ingestion.

## Why it happens

Two watchdogs watched one chain from different rows. The child's sweep owns the child; the parent's sweep had no idea a child existed, and the counter it used was never reset by progress.

## What to do

- Before a watchdog counts a waiting row as stalled, ask what it is waiting on. While the child is still active (`pending`, `processing`, `paused`), leave the parent alone and spend nothing: the child's own watchdog recovers the child, and the child's terminal write wakes the parent.
- Still re-arm when the child has ended (or is gone) and the parent never moved: that is a lost wake, the one failure the parent sweep can fix there.
- When the child cannot be read, skip without stamping; never spend recovery on a guess.
- Check every wait phase, not only the one in front of you: `netsuite_wait_sdf` has the same shape (the SDF child runs on the Railway worker and can run for hours).
