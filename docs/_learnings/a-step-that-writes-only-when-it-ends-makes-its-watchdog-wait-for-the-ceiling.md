# A step that writes only when it ends makes its watchdog wait for the ceiling

**Scope:** transferable
**Area:** `netsuite_runtime_config` phases (`src/utils/queue/processors/netsuiteRuntimeConfigProcessor.ts`), the stall sweep (`src/utils/netsuite/runtimeConfigSweep.ts`), any queue step a "silent for N seconds" watchdog recovers.
**Status:** designed out for the runtime-config chain on 2026-10-20 by `hotfix/runtime-config-heartbeat` (phase claim + timer heartbeat, `src/utils/netsuite/runtimeConfigInvocation.ts`). The parent chain (`parentChainSweep.ts`, 1800s) and the SDF wait still use the old rule.

## The symptom

A customer's PROD ingestion sat in `netsuite_wait_runtime_config` for half an hour with nothing happening: its child `background_jobs` row was `processing`, phase `schema_inventory`, `updated_at` 19:34:46, and the invocation behind it had died without writing an error. The watchdog was installed and working; it was waiting, by design, for `NETSUITE_RUNTIME_CONFIG_SWEEP_GRACE_SECONDS` (default 1800, floor 900) before it would re-dispatch, and it could do that up to three times.

## Why it was misleading

"The watchdog is too slow" reads as a tuning problem: lower the grace. It cannot be lowered safely. The phase wrote its row only when it finished, a live phase could run for the whole 800s webhook ceiling in silence, and nothing stopped two invocations running the same phase. So any window shorter than the ceiling would re-dispatch live phases and fork the chain. Silence was the only liveness signal, and a live step and a dead step were indistinguishable for 800 seconds.

## Why it happens

The step's own loop is the wrong place to prove liveness: one awaited RESTlet call blocks for 60s (`userRoleAssignments` timed out at exactly that on the customer's slow sandbox), so "write progress between items" still leaves long gaps. And once a watchdog may act while the old runner could be alive, the old runner's later writes must be refused, or the recovery itself causes the double run the long grace was protecting against.

## What to do

- Prove liveness from a **timer**, not the work loop: re-stamp the row every N seconds while the step runs, stopped in a `finally`, pinned so it only writes while the row is still in that step and status.
- Count a row carrying the heartbeat marker as dead after about three missed beats (here 60s / 180s). Keep the long window only for rows written by code that predates the heartbeat.
- Make ownership explicit: each invocation claims the row with a fresh token (compare-and-set on the token it loaded), every write pins that token, and the watchdog's re-dispatch stamps a token of its own. A superseded runner's writes then match zero rows and it stops; it never advances, forks or fails the chain.
- Serialize one runner's writes. A heartbeat rewrites the state blob whole, so a beat built before a step write and landing after it rolls the row back (`netsuiteRuntimeConfigHeartbeat.test.ts`, "never lands the older state").
- Guard side effects outside the row (here the per-job runtime artifact, one storage path per job) with an ownership check just before them.
