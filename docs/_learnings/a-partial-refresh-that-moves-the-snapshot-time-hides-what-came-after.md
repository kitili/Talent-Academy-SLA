# A partial refresh that moves the snapshot time hides what came after it

**Scope:** transferable

## The symptom

Caught in review on 2026-10-04, before it shipped (`plans/netsuite-performance/netsuite-performance-data-plan.md`,
Phase 2). The Performance data card's **Collect** runs a snapshot-only configuration refresh: two
SuiteQL datasets (script execution log counts, scheduled-script run counts), saved into the project's
existing `netsuite_configs` row. The save went through `upsertNetSuiteConfigRecord`, which stamps
`extracted_at = now()` on every write.

`extracted_at` is not only bookkeeping. The Map's deployed-script overlay reads it as "the snapshot was
taken then", and shows only what Splotch deployed after it
(`loadDeployedScriptOverlay`: `.gt('completed_at', snapshotAt)`). A Collect that re-read no script would
therefore have made every deploy since the last full read vanish from the Map. Their changes would have
been treated as already in a snapshot that never saw them.

## Why it is easy to miss

- The column's name says "extracted at", and a partial refresh is an extraction, so moving it looks
  right.
- The reader that depends on it lives in another feature (the system map), behind a loader keyed on the
  config row.
- Nothing fails. The overlay simply has fewer entries, and an empty overlay is the normal state for a
  project nobody deployed to.

## The rule

- A timestamp that readers use as "the data was taken then" moves only when the data it stands for is
  re-read in full.
- A partial refresh records its own time on what it refreshed. Here that is each dataset's `generatedAt`
  in the snapshot manifest. The row-level time is left alone.
- Before stamping a shared time on a row, grep for its readers in every feature, not just your own.

## What was done

`upsertNetSuiteConfigRecord` takes `snapshotOnly`. It keeps `extracted_at` as it was and refuses to
create a row, since a snapshot-only run has nothing to stand on without one. The runtime-config
processor passes it for snapshot-only runs. This is pinned in
`tests/unit/netsuite-performance/observedDatasets.test.ts`
("keeps the config row's extracted_at, and never creates a row").

## It recurred through another writer (2026-10-14)

The demo's v6 was made by a refresh on 2026-10-07, and its config row's `extracted_at` reads 2026-10-10 12:54: an
in-place write moved it three days later. Which writer did is not established (read-only selects, 2026-10-14);
`POST /api/netsuite/configs` upserts the latest published row through `upsertNetSuiteConfigRecord`, which stamps it
unless the caller passes `snapshotOnly`. Every reader that takes `extracted_at` as the snapshot time (the deployed-script overlay,
`featureStateOverlay`) hides what Splotch shipped between the two dates. Shipped-change versions
(`plans/drivetrain/ship-publishes-repository-version-plan.md`, D3) therefore date their lineage by the full read's job
start (`summary.shipped.fullReadStartedAt`), a time no in-place writer touches, and copy `extracted_at` unchanged.
