# A `node --test` started inside a test runs no files and passes

**Scope:** transferable
**Area:** any test that spawns Node's test runner as a child (here `tests/unit/bootstrapping/bootstrapRunner.test.ts`, which runs a bootstrapped project's copied `scripts/run-node-tests.mjs`), and any runner that records a green run from the child's exit code.
**Status:** open for the runner (it still records a green run of 0 tests); avoided in that test on 2026-10-16 by removing `NODE_TEST_CONTEXT` from the child's environment.

## The symptom

The child run exited 0 and the copied runner wrote its green record, with no test output at all:

```text
Running Node test suite(s): unit, integration (tests/unit/**/*.test.ts, tests/integration/**/*.test.ts)
Green run recorded in .test-runs/last-green.json (HEAD a8afe20ab); `yarn test:needed` compares the tree against it.
(node:60180) Warning: node:test run() is being called recursively within a test file. skipping running files.
```

## Why it was misleading

Exit code 0 and "Green run recorded" are what a passing suite prints, and the warning is one line on stderr that reads like noise. A test that checks only the exit code or the "recorded" line passes, and so does a later `test:needed`, which now says the tree is covered by a run that executed nothing.

## Why it happens

Node's test runner sets `NODE_TEST_CONTEXT` in the environment of every test file it runs. A child process inherits it, so a `node --test <patterns>` started from inside a test believes it is itself a file under the parent runner: it skips running files, reports nothing, and exits 0. The runner script then sees exit 0 and records the run, because it does not check the counts in the TAP report (`tests 0`).

## What to do

- When a test spawns `node --test` (or a script that does), pass an environment without `NODE_TEST_CONTEXT`: `const env = { ...process.env }; delete env.NODE_TEST_CONTEXT`.
- Assert what ran, not only the exit code: a named test's `✔` line, or the recorded counts (`counts.tests > 0`).
- A runner that records green runs should refuse to record one with 0 tests. Ours does not yet (`scripts/run-node-tests.mjs` writes the record on exit 0 whatever the counts); the fix needs its own message and exit code, so it is not a one-line change.
