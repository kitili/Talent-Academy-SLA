# A focused test can be missing from the default suite

**Scope:** transferable
**Area:** Node test discovery, component integration tests.
**Status:** fixed for the diagram picker on 2026-10-04 by renaming its test to `.test.ts`.

## The symptom

The creation-test audit's explicit Node command found a failing diagram picker component test. The default suite did not discover `tests/integration/diagram-types/modal-component.test.tsx` at all.

## Why it was misleading

A file under `tests/integration` looks covered by `yarn test`. An explicit invocation proves that a test can execute, but does not prove the normal runner or CI includes it.

## Why it happens

`scripts/run-node-tests-config.mjs` selects `tests/<suite>/**/*.test.ts`. The `.test.tsx` suffix misses that pattern. The picker test was renamed to `.test.ts`, using `React.createElement` to keep actual component rendering and interactions without changing the runner's scope.

## What to do

Check the default discovery pattern when adding or relocating a test. Use `.test.ts` for Node tests in this repository, and verify the full runner includes the scenario. Reserve `.spec.ts` for Playwright's appropriate test lane. Treat collection and runtime assertions as separate checks.
