# `pg_catalog.coalesce` is syntax, not a function

**Scope:** transferable
**Where:** `migrations/semantic-harmony/add_dotson_v2_desired_activation_candidates.up.sql` (applied to
staging) and its forward repair; recorded as a learning 2026-09-21 when the suite test that guarded it
was retired.

## What happened

A migration schema-qualified every call to be safe against `search_path` — including
`pg_catalog.coalesce(...)` and `pg_catalog.current_user`. PostgreSQL parses `COALESCE` and
`CURRENT_USER` as SQL syntax, not as functions living in `pg_catalog`, so the qualified form resolves to
a function that does not exist and fails with **error 42883** — at run time, after the migration has
started. An applied function had to be repaired with a second, forward migration that rewrote its body
while preserving its identity, ownership, ACLs, security mode and configuration
(`docs/_global/migrations/sql-editor-and-postgresql-pitfalls.md` has the full account and the repair shape).

## Why it is a trap

- Qualifying everything is the usual, correct defence against `search_path` games; this is the one
  place the habit is wrong, and nothing in a linter or the SQL Editor's syntax check flags it.
- The error surfaces only when the statement executes, so a `preflight` that does not call the
  function passes.

## The rule

Never write `pg_catalog.coalesce`, `pg_catalog.current_user` (or any other keyword-form construct such
as `current_date`, `current_timestamp`, `session_user`) with a schema qualifier. Before a bucket is
applied, run the on-demand check over it:

```bash
node scripts/database/check-sql-catalog-qualification.mjs migrations/<bucket>
```

It prints `file:line` per hit and exits 1. It is deliberately **not** a suite test: the applied history
in `migrations/semantic-harmony/` contains the mistake and its repair (which quotes the token) by
design, so a folder-wide test needs a permanent exception list — the file-name coupling that
`a-bucket-test-is-a-gate-not-a-monument.md` retired.

## How to check for it

Grep a new bucket for `pg_catalog\.(coalesce|current_user)` before review, or run the script above; if
it hits, unqualify the construct — do not wrap it.
