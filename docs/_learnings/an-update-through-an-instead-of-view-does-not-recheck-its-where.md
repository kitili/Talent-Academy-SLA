# An update through an INSTEAD OF view does not recheck its WHERE

**Scope:** transferable
**Area:** any Postgres view made writable with `INSTEAD OF` triggers, where callers rely on
`UPDATE ... WHERE <expected value>` as a compare-and-set.
**Status:** designed out for `processes_with_content` and `scripts_with_content` on 2026-10-12
(D11 in `plans/repo-refresh/shared-version-content-storage-plan.md`).

## The symptom
None, until two writers race: the second write lands on top of the first even though its
`WHERE script_content = 'old body'` should no longer match, and light columns the second writer
never mentioned are reset to the values it read.

## Why it was misleading
On a plain table the same statement is safe. Under READ COMMITTED, an UPDATE that waits for a
concurrent writer re-evaluates its WHERE against the new row version (EvalPlanQual) and skips the
row if it no longer matches. Moving the statement to a view looks like a rename.

## Why it happens
- The view's rows are read without a row lock, and there is no re-evaluation: the trigger runs
  with the `OLD` row from the statement's snapshot.
- `NEW` is the whole view row with the update applied, so it also carries every column the
  caller did not set, at the values from that stale read. A trigger that writes `NEW` to the
  table overwrites a concurrent writer's light-column change too.
- Shown on Postgres 17 (PGlite and staging, 2026-10-11/12) by changing the row from a volatile
  function in the WHERE, between the view's read and the trigger's write.

## What to do
- In the `INSTEAD OF UPDATE` trigger, `SELECT ... FOR UPDATE` the base row first and compare it
  with `OLD` (every column the trigger will write, or a content hash plus the light columns).
  If anything moved, raise SQLSTATE `40001` so the caller retries, instead of writing.
- Test it in one session: a volatile function in the UPDATE's WHERE that changes the row
  reproduces the race deterministically. An HTTP race between two clients did not reproduce it
  reliably.
