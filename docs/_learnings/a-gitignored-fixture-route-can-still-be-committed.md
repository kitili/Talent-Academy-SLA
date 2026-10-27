# A gitignored fixture route can still be committed

**Scope:** transferable
**Where:** `src/app/test-fixtures/`, the generated route tree the browser-fixture runner materializes
from `tests/browser-fixtures/implementation/app/test-fixtures/`. Found 2026-09-29 on `qa` (`983f098`).

## The symptom

```text
Error: Production build refused: generated browser fixture routes exist at /vercel/path0/src/app/test-fixtures.
Finish or clean the fixture run before building.
    at assertProductionFixtureIsolation (scripts/browser-fixtures/fixtureRoutes.mjs:264:15)
```

Every Vercel build failed at `next.config.mjs`, before a line of the app compiled.

## Why it was misleading

The folder is in `.gitignore`, so it looks impossible to commit. But `git add -f`, or adding it from a
tool that ignores `.gitignore`, tracks it anyway, and a tracked file stays tracked. The Inbox POC
(`90a457df8`) wrote its fixture straight into `src/app/test-fixtures/collaboration-inbox/`, where it
worked locally in dev, passed `yarn test`, and rode `comment-inboxing` into `qa` unnoticed. The guard
treats any existing tree as a fixture run left behind, so the message points at cleanup, not at git.

## The check

- Put a new fixture page under `tests/browser-fixtures/implementation/app/test-fixtures/<name>/`.
  The runner copies it into `src/app/test-fixtures/` for the run and removes it afterwards.
- A fixture's API route is different: it lives in `src/app/api/test-fixtures/` and ships, gated at
  request time by `@/utils/test-fixtures/gate`.

## Status

Designed out: `tests/unit/code-ingestion/browserFixtureRouteIsolation.test.ts` fails `yarn test` when
git tracks anything under `src/app/test-fixtures`.

Related: [a-green-test-run-is-not-a-green-build.md](a-green-test-run-is-not-a-green-build.md)
