# A job the finder cannot see is a job the user starts twice

**Scope:** transferable
**Where:** `src/app/api/netsuite/config-extraction/start/route.ts`,
`findActiveNetSuiteRuntimeConfigJobForCode` in `runtimeConfigJobService.ts`, the
`idx_bg_jobs_active_ns_runtime_config_code_version` guard; found 2026-09-22 on the
first use of Project Settings → Configuration refresh (now Config Repair, preview and development builds only).

## What happened

The new settings row started a runtime-config job and then drew an idle control
over it: no bar, the pill enabled, "Last refreshed: 1d ago". The job was running
(`status: processing`, `progress: 42`). Its row had `code_versions_id: null`.

The active-job finder filters `background_jobs` on `code_versions_id =
<latest published version>`, and the partial unique index that allows one active
job per version is on the same column. The processor stamps the column at
completion. The full-ingestion queue path resolves the version and writes it on
insert; the standalone start route, which the connection form's Add Config and
the settings row both call, wrote only `code_id`. So every job started that way
was invisible to the finder while it ran, the guard never applied to it, and a
second start was accepted.

The same insert also wrote `code_id`, the column `add_code_versions_table.sql`
dropped from `background_jobs`. Production still carries it as transitional
drift and took the write; staging has no such column, so the same start failed
outright there. Two readers still filtered `background_jobs` on `code_id` too
(the account export's latest-ingestion lookup, silently null on staging, and
script source recovery's active-job `or()`, which PostgREST fails whole on an
unknown column). All three now run on `code_versions_id`, through the code's
published versions.

## Why it is a trap

- Two insert paths, one column contract. The one that was written second
  copied the shape of the row without the column the readers key on.
- It heals itself at completion, so a status read after the job finishes looks
  right and the gap only shows while a job is in flight.
- The symptom is on the surface, not in the job: a control that looks idle over
  a running job is exactly what invites the second click the guard exists to
  refuse.

## The rule

A column that a finder or a uniqueness guard keys on is part of the insert
contract for every path that creates the row. Resolve it at insert, or the
readers see nothing until something else fills it in. Here the start route now
resolves the latest published version the same way the queue path does.

## How to check for it

- For each `.eq('<column>', …)` in a "find active" query and each partial
  unique index `WHERE … status IN (active)`, list every `insert` into that
  table and confirm each sets the column.
- `tests/unit/netsuite-ingestion/netsuiteRuntimeConfigBackground.test.ts` pins
  the start route's insert against the finder's filter and that no NetSuite
  utility names `background_jobs.code_id`; the account export lookup is
  covered in `account-export/netsuiteAccountExportLoad.test.ts`.
- `grep -rn "code_id" src | grep -B8 "from('background_jobs')"` should find
  nothing: `code_versions.code_id` and the other tables' columns are real,
  `background_jobs.code_id` is not.
