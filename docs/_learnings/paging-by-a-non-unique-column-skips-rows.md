# Paging by a non-unique column skips rows, and repeats as many

**Scope:** transferable
**Area:** every paged read of a large table (`processes`, `scripts`, `process_script_files`,
`splotches`, …): NetSuite ingestion, repo refresh, impact context, account repair, the canvas
**Status:** designed out for `src/` (2026-09-23): every paged read of a large table ends its
order in `id`, and `tests/unit/database/pagingTiebreaker.test.ts` fails on one that does not

## The symptom

Nothing errors, and the count is right. Measured read-only on production on 2026-09-23 (demo code
version `541d4d71-22f9-4e56-b262-0316fb027bbc`, 3,313 process rows): paging the version's
processes with

```ts
.eq('code_versions_id', versionId)
.order('created_at', { ascending: true })
.range(offset, offset + 999)
```

returned 3,313 entries, as it should — with 15 rows twice and 15 rows never. The same 15 each
way, identically on three runs. At 500 rows a page, the size the Map's hydration uses, 32 went
missing. Paging by `id` returned all 3,313 distinct rows.

Downstream, a row that was never read looks like ordinary data. On that version a classification
re-run would have dropped 15 classified processes onto the Map's outer rings. The tests below show
the same shape elsewhere: an impact assessment reports the processes it never read as not
impacted, and a refresh validation flags the associations of a never-read process as crossing a
version boundary and refuses a good version.

## Why it was misleading

- **The count matches.** Duplicates and misses come in equal numbers when every page is full, so
  `rows.length === count` holds. Only a distinct-id check shows it.
- **It is deterministic.** The same rows go missing on every run, which reads as a fact about the
  data (those processes do not exist, or are filtered out) rather than a paging defect.
- **`created_at` looks unique.** It is not. Finalize inserts processes in batches and each batch
  shares one `now()`: 3,311 of the 3,313 rows shared a timestamp with another row (73 shared
  values, the largest held by 122 rows). Project clone stamps one timestamp on every process,
  script and functional process it copies, so a cloned version's processes are a single tie.
- **An unordered read looks fine in development.** With no `ORDER BY`, every row is one tie. On a
  small table the plan happens to return rows in a stable physical order; nothing guarantees it
  across pages, plan changes or concurrent writes.
- **A test that an order is present is not a test that it is total.**
  `versionQueryPagination.test.ts` asserted that `orderColumn: 'script_id'` reached the query, and
  it did. On `process_script_files` that order is still a tie: one shared library has an
  association with every process. The test's fake kept only the last `.order()` call, so it could
  not have told the difference anyway.
- **Dedupe hides half of it.** Callers that fold rows into a `Map` by id (the clone's
  `mergeRowsById`, the impact builder, the SDF post-processor) drop the duplicates silently, so
  only the misses remain, and they look like absent data.

## Why it happens

Postgres gives no order among rows that tie on every `ORDER BY` key. A paged read sorts again for
every page, with a different `LIMIT`/`OFFSET`, and the sort (a top-N heapsort under a limit) is
not stable. So page one and page two can each take a different slice of the same tie: some rows
land on both pages and others on neither.

## The fix

Keep the existing order and add the primary key last, so the order is total:

```ts
.order('created_at', { ascending: true })
.order('id', { ascending: true })
.range(offset, offset + pageSize - 1)
```

An unordered page loop gets `.order('id', { ascending: true })`. `loadAllRows` / `loadRowsByIds`
(`src/utils/repo-refresh/versionQueries.ts`) append `id` after any other `orderColumn`
themselves.

## The check

1. **Grep.** Every `.range(` whose chain ends in anything but a unique column:

   ```bash
   grep -rn -B8 "\.range(" src | grep -E "\.order\(|\.range\(|\.from\("
   ```

2. **The structural guard.** `tests/unit/database/pagingTiebreaker.test.ts` walks the TypeScript
   AST of every `.range()` chain under `src/` that names a large table and fails unless its last
   `.order()` is `id`.

3. **The behaviour.** `tests/fixtures/database/tieScramblingPostgrest.ts` is an in-memory PostgREST
   that honours only the requested order keys and breaks the remaining ties differently on every
   request. Drive the real loader with it and assert every row comes back exactly once
   (`assertEveryRowOnce`), then rerun with `ignoreOrderColumns: ['id']` to prove the test would
   have caught the missing tiebreaker.

4. **The live data.** `scripts/audit-functional-classification-coverage.ts --paging-check`
   (read-only) measures what paging a version's processes by `created_at` alone would lose, per
   page size, against the real rows.

## Evidence

Fixed, each with a test that drives the real function through the emulator (`tests/unit/…`):

| Loader | Was | Test |
| --- | --- | --- |
| `buildProcessImpactContext` (`netsuite/processImpactContext.ts`) | `created_at` | `netsuite/processImpactContext.test.ts` — 355 of 2,401 read twice and 355 never, before the fix |
| `collectNetSuitePersistedArtifactState` processes (`netsuite/accountRepairDiscovery.ts`) | `created_at` | `netsuite-ingestion/netsuiteAccountRepairDiscovery.test.ts` — 338 twice, 338 never |
| same function, `process_script_files` | unordered **and unfiltered**: it paged every association in the database | same file; now chunked by this version's script ids |
| `parseSdfForProcesses` (finalize's SDF parsing) | unordered | `functional-clustering/sdfPostProcessor.test.ts` — 280 twice, 295 never |
| repo refresh impact closure, processes and scripts | unordered | `repo-refresh/impactClosure.test.ts` |
| `loadAllRows` / `loadRowsByIds` with `orderColumn: 'script_id'` (impact closure, version validation, copy-forward) | `script_id` | `repo-refresh/versionQueryPagination.test.ts` |
| refresh start decision, previous process references | unordered | `repo-refresh/startDecision.test.ts` |
| refresh version validation snapshot | unordered | `repo-refresh/versionValidation.test.ts` |
| deployment-facts and workflow-inventory backfill stores | unordered | `netsuite-ingestion/netsuite{DeploymentFacts,WorkflowInventory}Backfill.test.ts` |
| refresh completeness projection scripts, canvas splotch pages (`/api/canvas/svtd`) | unordered / `created_at` | structural guard only |

Already correct when checked, and now pinned: project clone (`copyCodeArtifactsForClone` pages
every table by `id`; `project-clone/copyCodeArtifacts.test.ts` asserts every source process is
copied exactly once) and `scriptSourceRecovery.ts` (every paged read ends in `id`).

Fixed separately by Phase 1 of
`plans/netsuite-ingestion/netsuite-backfill-functional-classification-plan.md` (`f6c62cc39`, with
its own stub test `tests/unit/functional-classification/processPaging.test.ts`): the classifier
loader (`functional-classification/persist.ts`), the Map hydration reads
(`api/save-code-processes/route.ts`, three) and the MCP system-map source
(`services/system-map/loadSystemMapSource.ts`). The functional-clustering `POST` read, unreachable
behind `ENABLE_FUNCTIONAL_CLUSTERING = false`, went with the AI clustering pipeline (`42fc43f6c`).

## The same shape, not yet fixed

- **Cursor paging on a timestamp.** `.lt('created_at', cursor)` skips every row that ties with the
  cursor row: splotch audit and version history (`api/splotches/[id]/audit`, `…/versions`,
  `versioning/auditLogger.ts`, `versioning/snapshotService.ts`). Rows written in one transaction
  share `now()`. The fix is a compound cursor, `(created_at, id)`.
- **List endpoints over small tables**, ordered by `updated_at` or `created_at` alone: canvases,
  projects, meetings, the jobs list. Ties need a bulk write, and the damage is one item shown twice
  or not at all in a list.
- **Operator scripts** under `scripts/` (coverage audits, probes) page `processes` the same way;
  their counts can be off by exactly this.

## Related

- [a-count-and-a-list-over-two-graphs-disagree-on-the-first-drill.md](a-count-and-a-list-over-two-graphs-disagree-on-the-first-drill.md)
  — another way a count that looks right hides a list that is wrong
- [one-rule-many-layers.md](one-rule-many-layers.md) — `versionQueries.ts` already said an
  unordered paged read "silently duplicates and drops rows"; the rule lived in one helper and not
  in the dozen hand-rolled loops beside it
- [a-swallowed-error-reads-as-an-empty-result.md](a-swallowed-error-reads-as-an-empty-result.md) —
  "not found" and "never read" presenting identically
- [a-bounded-read-is-not-an-ordered-one.md](a-bounded-read-is-not-an-ordered-one.md) — the step
  before this one. That entry's guard caught readers that paged with no `ORDER BY` at all; this
  one caught readers that had an `ORDER BY` and still tore, because the column repeated. Bounded,
  then ordered, then ordered by something unique — each looked like the whole answer at the time
