# A bounded read is not an ordered one

**Scope:** transferable
**Area:** Repo Refresh version-scoped reads; `splotch_audit_log` in the
post-refresh canvas sync
**Status:** both halves fixed — the five unordered pagers now delegate to
`loadAllRows`, `loadUserEditedSplotchIds` reads through `loadRowsByIds`, and
`tests/unit/repo-refresh/versionQueryPagination.test.ts` guards each half
separately

## The symptom

None. That is the entire problem with this class of bug.

PostgREST caps an unbounded `select` at 1,000 rows and **returns no error when
it does**. A reader that omits `.range()` answers from the first 1,000 rows of a
repository and looks completely healthy on every repository below the cap —
which is most of them during development. 23 of 77 published versions exceed it,
the largest at 14,436 processes, so for NetSuite repositories the cap is the
normal case, not an edge case.

That much was already known and already guarded. The trap is what the guard let
through.

## Why it was misleading

A structural AST guard existed and passed. It flagged any read of a
version-scoped table that lacked a bound:

```ts
const BOUNDED = /\.range\(|\.maybeSingle\(|\.single\(|\.limit\(|head:\s*true|loadAllRows|loadRowsByIds/
```

A green guard reads as "this class is handled". It was not, in two separate
ways, and both are invisible in review.

### 1. `.range()` alone satisfied the regex

Five hand-rolled pagers looped `.range(offset, offset + PAGE_SIZE - 1)` with no
`.order()`. Postgres makes **no ordering promise without `ORDER BY`**, so page
boundaries can shift between requests and the same read can return a row twice
or not at all. The codebase's own helper says exactly this in its docstring —
"trading one silent corruption for another" — and the guard beside it accepted
the pattern anyway, because a bare `.range(` matched `BOUNDED`.

Where they sat made it worse:

| Reader | What an unordered page costs |
|---|---|
| `versionValidation` | **the publication seal** validates over a set that is not the version's true set |
| `versionMaterialization` | the completeness record disagrees with the version it describes |
| `impactClosure` (×2) | a dropped dependency is never re-derived; the refresh copies forward a stale process |
| `startDecision.server` | a changed SuiteScript's owning XML is never fetched as context |

And the moment they run is the moment the risk is real: against a `v_next` the
pipeline has just finished writing, when concurrent updates are what move an
unordered scan's page boundaries.

### 2. The guarded table list was scoped to the wrong property

The list held version-scoped tables — `processes`, `scripts`,
`netsuite_configs`, and so on. "Version-scoped" was a reasonable proxy for "can
return many rows", and it missed the one read in the feature whose truncation is
*destructive*:

```ts
// canvasSync.ts — before
await supabase
    .from('splotch_audit_log')
    .select('splotch_id, action, metadata')
    .in('splotch_id', splotchIds)          // no chunking
    .in('action', ['edited_text', 'edited_diagram', 'edited_title'])
                                           // no range
```

`loadUserEditedSplotchIds` decides which splotches the post-refresh canvas sync
must **not** touch. A splotch missing from that set gets its working text
overwritten, or the splotch deleted outright — and the deletion cascades to
versions, texts and diagrams. Every other truncation in the feature produces a
wrong number; this one destroys user work.

Two things make it likelier than it looks:

- The `.in()` list is unchunked, so the id list can outgrow the GET URL.
- **The row count grows with refreshes, not just with user edits.** Each repoint
  writes its own `edited_text` row into the very table the next refresh reads
  back and filters client-side. The canvases most at risk are the ones refreshed
  most often — the opposite of the "only huge accounts are affected" intuition
  the row cap usually invites.

### 3. The test encoded the broken shape

The unit test stubbed exactly `.from().select().in().in()` and returned
everything. A stub that models no page window cannot fail for a reader that
reads one page, so the test was green by construction.

## The check

Three, all cheap:

1. **Grep for `.range(` without `.order(` in the same statement.** Any hand-rolled
   pager is suspect; there is no correct unordered one.
2. **Ask what a truncated result *does*, not what it displays.** If the answer is
   a write — especially a delete — the read belongs in the guard regardless of
   whether its table is version-scoped.
3. **Make the stub enforce the page window, and assert the fixture crosses it.**
   `assert.ok(requests.length > 1)` before asserting the result; otherwise the
   test proves nothing about paging.

## The general lesson

**A guard proves only the property it actually tests, and "bounded" and
"ordered" are two properties.** A single regex covering a family of bugs will be
read as covering the family. When the helper exists and its docstring names both
halves, check that the guard enforces both — a green structural test is exactly
the evidence that stops anyone looking.

And when scoping a guard by a table property, sanity-check it against
consequence rather than shape. `splotch_audit_log` fails every test of
"version-scoped" and is the most important read in the set.

**And ordering is itself only half of it.** This entry's fix — page through a
helper that orders — is necessary and not sufficient: ordering by a column that
*repeats* slices ties differently on every page, which is the same corruption one
step further in. Measured on the production demo, 3,313 processes paged by
`created_at` returned 15 rows twice and 15 never, with the total still correct.
The order has to end in a unique key. See
[paging-by-a-non-unique-column-skips-rows.md](paging-by-a-non-unique-column-skips-rows.md),
and note that `loadAllRows` now appends `id` after any other order column, so
delegating to it gets both halves.

**The guard's table list is a third boundary.** (Added 2026-10-03.)

- **What it missed.** `loadAllArtifacts` (`src/utils/database/artifactHelpers.ts`) reads `background_job_artifacts`. That table is job-scoped, not version-scoped, so it was outside the guarded set. The reader ordered correctly and **never paged**.
- **Who it affects.** Every ingestion merge flattens all of a job's `wave_result` rows through it, so a job with more than 1,000 such rows would merge only the first 1,000 and look healthy.
- **When it would have fired.** No measured job had crossed the cap: provider-batch jobs write one row per wave. Saving extraction results per concurrency group (the recovery plan) multiplies the row count, which is when this would have started losing paid results silently.
- **The fix.** It now pages through `readAllArtifactPages` (100 rows, `artifact_index` then `id`), and `tests/unit/code-ingestion/artifactPaging.test.ts` drives it against a fake capped at 1,000.
- **The check.** When you raise the row count of any table, find its unbounded readers first, whether or not a guard covers that table.

Related: [one-rule-many-layers.md](one-rule-many-layers.md),
[sql-ordering-must-match-application-sort.md](sql-ordering-must-match-application-sort.md),
[a-refusal-test-that-passes-when-the-refusal-is-gone.md](a-refusal-test-that-passes-when-the-refusal-is-gone.md),
[a-swallowed-error-reads-as-an-empty-result.md](a-swallowed-error-reads-as-an-empty-result.md)
