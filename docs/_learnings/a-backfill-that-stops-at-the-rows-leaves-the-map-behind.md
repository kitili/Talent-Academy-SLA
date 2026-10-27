# A backfill that stops at the rows leaves the Map behind

**Scope:** transferable

## The symptom

After the 2026-09-22 coverage backfill on the 4a Demo Project, the Map & Schema universe grew a
wide band of concentric rings of tiny nodes outside the lifecycle atlas. 1,541 elements sat there.
Nothing on the page said why. Bundles mode, meanwhile, still reported every one of the 64
packages as coverage `unknown` with 0 acquired components, although the same backfill had just
stamped 1,194 rows with their package.

## Why it was misleading

The backfill was careful about rows. Each sub-target called the exact function ingestion calls,
and its header promised that a backfilled version and a fresh one "produce the same rows for the
same input". That was true, and it was the wrong question. Ingestion finalize does two more things
after it persists rows, and both derive state from the rows:

- the deterministic functional classification, which writes one `functional_processes` row per
  business function listing its member processes. The Map places an element inside a lifecycle
  only when some row lists it; everything else goes on the leftover rings outside the atlas.
- the package documentation and coverage projection, which persists `packageAcquisitionCoverageV1`
  computed with the attribution ledger.

The backfill ran neither, so the rows were right and everything computed from them was stale.

The coverage half had a second trap, found while fixing the first. Rebuilding the package catalog
took a package's persisted coverage entry in preference to the one the ledger computed. The
persisted map exists to stand in for the ledger at read time, but the rule applied at projection
time too, so the stale `unknown` entry was read back and written again. Supplying the ledger
changed nothing. Only after the ledger took precedence did 23 packages become `measured`.

## The rule

- A writer that adds or changes process rows is not done when the rows are. Finish the version the
  way ingestion finishes it: classification, then the package projection. Record success only after
  a check that every latest-leaf process is listed by some classification row
  (`finalizeBackfilledNetSuiteVersion`, `loadClassificationMembership`).
- A persisted projection is a fallback for when the fresh inputs are absent. When the caller
  supplies them, the fresh computation wins, or the old value re-persists itself forever.
- Show the unexplained. The Map's legend now counts the elements outside every business function,
  and how many arrived after the last classification run.

## Where it is designed out

Every NetSuite backfill that writes `processes` (coverage, template catalog, `own_script_id`,
deployment facts, workflow inventory) now calls the finish through its store. A failed finish is
`finalize_pending`, and the next coverage run (or `--finalize`) finishes first. The reclassify
script's postcondition fails on any unplaced process. `scripts/audit-functional-classification-coverage.ts`
lists affected repositories read-only. The demo was remedied on 2026-09-23 (0 unplaced, 23 packages
measured). See `plans/netsuite-ingestion/netsuite-backfill-functional-classification-plan.md`.

Related: the classifier loader and the Map hydration paged `processes` by `created_at` alone, so a
re-run would have dropped 15 rows onto the rings by itself; see
`paging-by-a-non-unique-column-skips-rows.md`.
