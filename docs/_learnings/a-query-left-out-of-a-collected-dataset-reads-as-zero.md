# A query left out of a collected dataset reads as zero

**Scope:** transferable
**Area:** any dataset assembled from several queries whose rows are tagged by query; here the NetSuite snapshot's
multi-query datasets (`record_counts`, `tax_usage_counts`, `transaction_usage_counts`, the revenue counts) and every
reader that filters their rows by `queryName`.
**Status:** designed out on 2026-10-09 by `failedQueries` / `skippedQueries` and `snapshotQueryRows`
(plans/netsuite-ingestion/netsuite-assessment-read-gaps-plan.md, F6, DD4).

## The symptom

Every snapshot of the demo account stored `record_counts: failed`, "projects: … Record 'Job' was not found". The account
has no Projects, so one of nine queries was refused, and with it the dataset lost customers, items by type and
transactions by type: 261 sales orders read as "not collected" on every screen, and the revenue arrangement count with
them.

## Why it was misleading

The obvious fix is to run each query alone and keep the rows of the ones that answered. But the readers found a query's
rows with `rows.filter((row) => row.queryName === name)`. A refused query has no rows, so that filter returns `[]`, and
`[]` is an observed empty result: "0 transactions of this type", "0 items with a revenue rule". The whole-dataset failure
was at least honest; the obvious fix would have turned it into a confident zero.

## Why it happens

The value and its evidence travel apart. Whether a query ran is a fact about the extraction; the rows carry only
what it returned. A GROUP BY that legitimately finds nothing and a query that never ran both leave no row behind.

## What to do

- When a dataset can be partly collected, record which parts were not (`failedQueries`, `skippedQueries`) beside the
  rows, in the artifact and the manifest, and make coverage read `partial`.
- Give readers one accessor that answers "not collected" (here `null`) for those parts, and route every reader through
  it. Filtering rows by tag is the bug, wherever it is written.
- A part that cannot run on this account (a feature that is off) is skipped, not failed, so the dataset is not partial
  forever on every account without the feature.
- Pin it with a test that refuses one query and asserts the reader says not collected, strictly (`'not_collected'`,
  never `0`): `tests/unit/netsuite-ingestion/netsuiteSnapshotQueryIsolation.test.ts`,
  `tests/unit/netsuite/processSetup.test.ts`.

Related: `a-failed-count-stored-as-zero-is-an-observation-nobody-made.md` (the same trap at a producer) and
`a-swallowed-error-reads-as-an-empty-result.md`.
