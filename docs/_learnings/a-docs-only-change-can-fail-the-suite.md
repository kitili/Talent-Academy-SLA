# A docs-only change can fail the suite

**Scope:** transferable

## The symptom

A rule was added on 2026-09-20 to skip the full `yarn test` when only docs, plans, comments or file
moves had changed since the last green run. Building the check behind it (`yarn test:needed`) showed
the premise is false here: **18 test files read `docs/` as text**, and a docs-only edit can fail them.

```
tests/unit/database/databaseDocumentationBoundary.test.ts   → docs/_global/database
tests/unit/project-actions/backgroundJobColumns.test.ts     → docs/_global/database/{staging,prod}-schema.sql
tests/integration/project-actions/canvas-job-indicator-contract.test.ts → docs/project-actions/*.md, docs/project-clone/README.md
tests/integration/document-generation/document-generation-contract.test.ts → docs/document-generation/*.md
tests/integration/diagnostics-widget/report-export-contract.test.ts → docs/diagnostics-report/*.md
tests/unit/performance/dataset-config.test.ts                → docs/performance/*.md
tests/integration/netsuite-ingestion/repositoryOverlayConfigPersistence.integration.test.ts → docs/netsuite-ingestion/*.md
tests/unit/before-and-after/activationCrossSiteAgreement.test.ts → docs/before-and-after/architecture.md
```

## Why it was misleading

"Docs" reads as prose that nothing executes. In this repository a documentation folder is part of a
feature's contract: the database snapshots are parsed, feature READMEs are pinned for the promises
they make, and learnings entries are cited by the tests that guard the trap they describe. The mental
model "code and tests are behavioural, everything else is inert" puts those files on the wrong side.

The same goes for `scripts/`, `migrations/` and `workers/`: tests read them as text too.

## The check

Run `yarn test:needed`. It fingerprints every path the Node suites can exercise — `src`, `tests`,
`scripts`, `migrations`, `workers`, `docs`, and the root config files — against the last green run
recorded by `yarn test` in `.test-runs/last-green.json`, and it scans the test files for the
`docs/...` paths they name. A changed doc that a test names makes the run stale; a changed doc that
no test names is listed separately and does not. Do not decide by hand which docs are "just docs".

To find out whether a doc you are editing is a contract:

```bash
grep -rn "docs/<folder>" tests --include=*.ts
```

## Since 2026-09-24: the blast radius, not the suite

A docs-only change needs tests, but only the ones that read the changed docs. A doc is read as text, no
application code reads docs at runtime, and so only a test that names a doc can see a change to it.
`yarn test:needed` says "Only docs changed" when that is all that changed, and `yarn test:docs` runs
exactly those test files and refreshes the green record. The scan also reads a path written in pieces
(`join(root, 'docs', 'x', 'y.md')`): under the full-suite rule, a test reading a doc that way was still
run; under the subset rule it would be skipped. Code, tests, scripts, migrations, workers and
dependencies still need the full suite.

## Evidence

- The scan that found the 18 files: `rg "['\"\`]docs/" tests`, 2026-09-20.
- The check and its unit tests: `scripts/test-run-record.mjs`,
  `tests/unit/test-infrastructure/test-run-record.test.ts`; the rule that prompted it is step 5 of
  `.claude/CLAUDE.md`, `AGENTS.md` and `rules/rules.md`.
- Related: [a-test-that-reads-source-as-text-cannot-guard-a-move.md](a-test-that-reads-source-as-text-cannot-guard-a-move.md)
  — the same class of test, seen from the other side.
