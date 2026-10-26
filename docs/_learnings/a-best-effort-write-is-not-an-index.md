# A best-effort write is not an index

**Scope:** transferable

## The symptom

A splotch's version tree showed six entries. Two offered "Revert to this
version". The three "Reverted version" nodes offered nothing.

No error. Nothing failed in NetSuite, nothing failed in the deployment lineage,
and every revert had worked — the account changed correctly each time and the
canvas narrative followed. Only the *offer* was missing.

## Why it was misleading

Two nodes were correctly unofferable, which made the pattern look intentional:

- **"Autosaved"** — never deployed, so there is genuinely no deployed state to
  return to. Correct.
- **"Reverted version" ×3** — a bug.

Mixing a real rule with a bug is what makes this hard to see. The obvious theory —
*"only some version types are revertable"* — explains the data and is wrong.

The actual cause was one line of schema:

```sql
action text NOT NULL CHECK (action = ANY (ARRAY[
    'created', …, 'version_snapshot', 'version_restored',
    'draft_created', 'draft_promoted', 'draft_discarded', …
]))
```

`version_reverted` is not in that list. So the insert pairing a timeline node
with the process a revert created failed **every single time**:

```
[revert-narrative] recorded the reverted version bddd830f… but could not pair it
with process eb2c9319…: new row for relation "splotch_audit_log" violates check
constraint
```

And `draft_promoted` *is* allowed — which is precisely why "Draft promoted to
current" was offered while no revert ever was. The one path that worked was the
one whose action value happened to predate the feature.

## The trap

**Using a deliberately best-effort write as the only index for a functional
lookup.**

The audit insert is best-effort *on purpose*, and that judgement was right: a
failed audit row must never undo a completed content restore. It is wrapped, it
logs, and it continues.

The error was reading that same row back to decide **which versions the UI may
offer**. That turns "this bookkeeping did not land" into "this version does not
exist", silently and permanently. A best-effort write can be absent for reasons
that have nothing to do with the truth it records — and a lookup built on one
inherits every one of those reasons as a false negative.

The fix is not "make the write fatal". It is to record the same fact somewhere
authoritative — here `process_versions.metadata.narrative_version_id`, on the
table that IS the record of what was deployed, in a jsonb column with no CHECK to
trip on — and keep the audit log as a fallback and as history.

A secondary trap: this is the **second** CHECK constraint in the same feature to
reject a new value. `process_versions.triggering_event` was widened days earlier
for exactly the same reason. Having just fixed one, the natural feeling is that
the class of problem is handled. It is not — each enum-shaped CHECK is its own
gate, and adding one new domain value can need several.

## The check

**Before writing a new string into any column, read its definition.** Enum-shaped
CHECKs do not announce themselves in the TypeScript types:

```bash
grep -n "CREATE TABLE public.<table>" -A 20 docs/_global/database/*-schema.sql
```

Cheaper still, ask the question that finds all of them at once: *for this new
concept, which columns will hold a value that did not exist before?* Then check
every one. For a revert that was `process_versions.triggering_event` **and**
`splotch_audit_log.action`.

And when a lookup returns "nothing" for something you can see exists, check
whether the row it reads is written best-effort. If it is, the absence is not
evidence.

## A third instance: a status nobody could write (2026-10-04)

`background_ingestion_jobs.status` had no `cancelled`, so for months both cancel
routes stored a user stop as `failed` + a cancel message (33 of 61 failed PROD
rows). No error, because nobody tried `cancelled`. Readers grew around the hole
instead: a message-matching helper (`src/utils/jobs/userStopped.ts`), a card
that re-reads the message, and billing that counted "failed" as the cancel case.
When a value is missing from a CHECK, the encoding in another column spreads to
every reader. Widen the CHECK rather than teach one more reader the encoding
(`plans/background-processes/ingestion-cancelled-status-plan.md`).

**Order trap.** The fix/drivetrain preview reads the PRODUCTION database, so
code that writes a new value goes live against the old CHECK the moment the
branch is pushed, before anyone runs the migration. Apply the migration first.
If the write is one a user depends on (a cancel), have it fall back to the old
shape on SQLSTATE `23514` naming the constraint, as
`src/utils/background-ingestion/markCancelled.ts` does.

## Evidence

- Splotch `7f03a153`, 2026-08-24: six `versions` rows, `listRevertableTargets`
  returned two — `ff0481e9` (audit_pairing, a `draft_promoted`) and `13f80b9a`
  (base_version). All three `restored` nodes were missing.
- The failing insert: `revertSplotchNarrative.server.ts:385`.
- Fixes:
  `migrations/process-refresh/widen_splotch_audit_log_version_reverted.up.sql`
  (the CHECK) and `backfill_revert_narrative_pairings.up.sql` (existing rows,
  joined on the process version number the node's own description carries —
  exact, not timestamp proximity).
- The durable pairing:
  `process_versions.metadata.narrative_version_id`, preferred over the audit
  pairing by `listRevertableTargets`.
- Pinned by `tests/unit/process-refresh/revertedVersionsAreRevertable.test.ts`,
  which asserts the lineage route resolves BEFORE the audit route.

## What worked

The failure was logged, not swallowed — `console.warn` naming both the version
and the process it could not pair. That is the only reason the diagnosis took one
grep instead of a bisect, and it is the direct payoff of
[a-swallowed-error-reads-as-an-empty-result.md](a-swallowed-error-reads-as-an-empty-result.md).

The gap that remains: nobody read the log until a user asked why the buttons were
missing. A best-effort write that fails on *every* attempt is not a transient
blip — it is a broken contract, and it deserves louder treatment than a warning
nobody tails.
