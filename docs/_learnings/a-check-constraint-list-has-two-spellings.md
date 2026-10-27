# A CHECK constraint's value list has two spellings

**Scope:** transferable

## The symptom

A migration that appends one value to `background_jobs_job_type_check` — read the
live constraint, add the value, write it back — passed its first run. Run again
(or followed by the next migration doing the same), it read the whole list as a
single value and appended the new type a second time, leaving a constraint that
accepted none of the existing job types.

## Why it was misleading

`pg_get_constraintdef` looked stable: every existing migration wrote the list as
`ARRAY['ingestion'::text, …]`, so a regex for `'([^']+)'` returned each value.
But writing the list back with `format('… ANY (%L::text[])', job_types)` stores it
as an array *literal*, and Postgres then renders it as
`ANY ('{ingestion,project_delete,…}'::text[])` — one quoted token. The same
regex now matches the whole literal as one "value". Nothing fails; the list is
silently wrong, and only the *next* reader sees it.

## The check

Don't pattern-match the definition. Take the expression after `ANY (` and let
Postgres evaluate it: `EXECUTE format('SELECT (%s)::text[]', array_expr)` reads
both spellings. Write it back in the canonical form (`ARRAY[` +
`string_agg(quote_literal(t) || '::text', ', ')` + `]`) so every later reader sees
what it expects. Run the migration twice against real Postgres before shipping;
PGlite (`@electric-sql/pglite`) is enough.

## Evidence

Found 2026-10-05 executing `migrations/repo-refresh/add_code_version_delete.up.sql`
in PGlite: the second run's check `job type appended, existing kept` failed.
Fixed in that migration and its down; both spellings verified.
