---
name: migrations-skill
description: Use when an agent writes, reviews, applies, hands off or repairs a database schema migration, a data backfill, relabel or repair, an operator action, or any SQL a person runs by hand against a live Postgres database; also when code is about to write a column or value the live schema may not have yet. Covers the file set (preflight, up, down, postflight, apply), guards that refuse instead of half-applying, idempotent DDL, constraint swaps, down migrations, forward repairs of applied history, confirmation-gated data changes, Node scripts that touch data, deploy order, and what to record after a run. The core method is portable; references/this-repository.md says where each part lives in this repository and who applies what where.
---

# Migrations Skill

## Purpose

A migration is the one change that runs once, by hand, against data nobody can regenerate. Write it so a person can paste it whole, read what it will do before it does it, and trust that it either finishes or changes nothing. Prefer the smallest change that does the job: additive first, one transaction, no clever tooling.

**This file is the portable core.** For this repository's folders, examples, checkers, tests, environments and who applies what, read `references/this-repository.md`. A new project copies this file and writes its own reference file.

## Who Runs What

- **Agents author; a person applies.** An agent never runs DDL or a data-changing statement against a shared database. It writes the files, runs the static checks, and hands off with exact instructions. Read-only inspection through the application's own API keys is fine where the project allows it.
- **The person applies in the order the file's header states**: preflight (read-only), the change, then the read-back at the end of the change, or the postflight.
- **Each environment is its own rollout.** Applying to staging never implies production. Record each application separately.

## Study Before Writing

1. **Read the schema evidence for the target environment**, and remember what it cannot show. A table snapshot usually omits triggers, functions, policies and cascades. Before touching a table's rows by hand, find its triggers and functions in the migration history, and read foreign keys from the live catalog at run time.
2. **Find every layer that enforces the rule you change.** The same invariant often lives in application code, again in a database function behind an RPC, and again in the UI. Grep the migrations for the column, the value and the error text; open the migration behind every RPC the feature calls.
3. **For a new value in an enum-shaped column, read the CHECK.** Types in application code do not show it. Ask which columns will hold a value that did not exist before, and check each one.
4. **Find out whether a file is applied, and where.** Applied files are history and are never edited.

## The File Set

| File | What it is | Writes? |
| --- | --- | --- |
| `<name>.preflight.sql` | Proves the database is the one the change was written for, and shows what it will touch | never (read-only) |
| `<name>.up.sql` | The change: one transaction, guards first, a read-back last | yes |
| `<name>.down.sql` | Reverses only its own up, and refuses when data depends on the change; or refuses outright, saying why | yes, or raises |
| `<name>.postflight.sql` | Proves the result, structurally, after the up | never |
| `<action>.preflight.sql` + `<action>.apply.sql` | An operator action that changes data, not schema; no down | apply only |

A multi-step operation gets a folder with numbered files (`01_`, `02_`) and a README carrying the run order, what each step creates or drops, what it deliberately leaves, and what to do after. A small change may carry its read-back at the end of the up instead of a separate postflight; say so in the header. When a folder stops taking new work, add a note in it saying so and which of its files remain applied.

## Writing The Up

**Header first.** Plain comments at the top that state: what changes and why (link the plan); the run order and prerequisites; the deploy order relative to the code; whether it is safe to rerun; what it refuses on; what it deliberately does not change; and what the final read-back should show.

**One transaction.** `BEGIN;` once and `COMMIT;` once, so a failure leaves nothing behind. Put guards before the first write:

```sql
DO $guard$
BEGIN
    IF to_regclass('public.jobs') IS NULL THEN
        RAISE EXCEPTION 'refusing: public.jobs does not exist';
    END IF;
END
$guard$;
```

Start every refusal with `refusing:` and name the object or count that caused it, so the operator knows nothing changed and why.

**Safe to rerun.** `CREATE ... IF NOT EXISTS`, `DROP ... IF EXISTS`, `CREATE OR REPLACE`, `ADD COLUMN IF NOT EXISTS`, and conditional `DO` blocks that check the catalog first. A backfill touches only rows still missing the value, and inserts only where an equivalent row is absent.

**Additive first.** New tables, nullable columns with no default, and grants on objects the same migration creates cannot be observed by the running application, so they can land well before the code. A change the old code can observe (a narrower CHECK, a dropped column, a trigger on a busy table) is a separate decision with its own blast radius.

**Swap a constraint without a window.** Add the replacement under a temporary name `NOT VALID`, `VALIDATE` it while the old one is still in force, drop the old one found by its columns in the catalog (not by a name you assume), then rename the new one to the canonical name, all in the one transaction. Refuse when existing rows violate the new rule rather than quietly narrowing the contract or rewriting rows to fit.

**Bound the locks.** A change that takes heavy locks on a live table, or a data change, sets `SET LOCAL lock_timeout` (and `statement_timeout` for long work). Take the same advisory lock the application's writers take when the change must not race them, or a dedicated one so two operators cannot run it at once.

**Functions and privileges.** A `SECURITY DEFINER` function sets `search_path = ''` and qualifies every relation and catalog function it uses. Revoke from `PUBLIC` and grant only the roles that call it. New tables enable row-level security and grant explicitly.

**Drops.** No `CASCADE`: an object you missed must fail the transaction, not disappear with it. Order drops by the foreign-key graph (referencing before referenced; triggers, then functions, then tables), look for cycles first, and end with a tripwire that refuses to commit if anything named after the removed layer survives.

**Read it back.** The last statement, after `COMMIT`, is one `SELECT` that reads the result from the catalog or the rows, with a comment saying what a pass looks like.

## Preflights And Postflights

- Read-only: one row-returning `SELECT`, wrapped in `BEGIN READ ONLY` ... `ROLLBACK` (or a single bare `SELECT`). No writes, no `set_config`.
- One row, with named columns or named checks plus a list of the failed ones, and proof it wrote nothing (`current_setting('transaction_read_only')`, `txid_current_if_assigned()` is NULL).
- The header says what a pass looks like, value by value, and what zero rows means.
- Report the counts the up must preserve, so the postflight can be compared against them.
- Fail closed. A `CHECK` accepts NULL; `bool_and` over zero rows is NULL; compare nullable values with `IS DISTINCT FROM`. Wrap absence in `COALESCE(..., false)`.
- Inspect catalogs structurally (constraint columns, trigger fields, function OIDs, ACLs through `aclexplode`) rather than matching decompiled text, whose spacing varies.
- A green catalog postflight proves structure, not behaviour: a PL/pgSQL body can install and still fail on its first call. Exercise the application path that calls it in staging before calling the change done.

## Down Migrations

- A down reverses only its own up, and refuses while data exists that it would destroy or mislabel. The refusal is the point: say in the header what the operator must do deliberately first, and which code must be pushed before it runs.
- A down may be forward-only: it raises and says why (it would discard verified facts, or the layer has no code left to serve). A one-way data backfill says in its header why it has no down.
- A set of downs is not a decommission script. Downs answer "undo this step on the day it shipped". To remove a whole layer, compose a new drop from the downs' object lists, ordered by the foreign-key graph.

## Applied History And Forward Repairs

- An applied file is never edited. Moving it to another folder with its filename unchanged is fine. A defect in an applied function is fixed by a separately named forward repair with its own flights.
- A repair that patches a live function body reads the stored definition, requires an exact count of the unsafe token, replaces it, verifies the result with a whitespace-insensitive pattern, and checks that the function's identity, owner, ACL, security mode and configuration are unchanged. It is idempotent and fails closed when the definition is not exactly what it expects.
- Anchor a text replacement on one physical line, never across a line break (stored bodies keep the line endings of the file that created them). Decide "already applied" on a unique marker, not on the anchor.

## Changing Data

Backfills, relabels and repairs carry more risk than DDL, because a wrong write looks like a successful one.

- **Exact selection.** Join on facts the rows themselves carry (an id, a number written into the row), never on proximity or a guess. Rows with nothing to match on are left alone and reported.
- **Conditional writes.** Write only rows still in the state you read (`WHERE status = 'failed' AND ...`, or an `updated_at` match), merge JSON with `||` rather than replacing it, and change only the fields the action is about.
- **Count, then compare.** Count the rows before the write, compare with what the operator confirmed, check `GET DIAGNOSTICS ... ROW_COUNT` after each write, and refuse on any mismatch.
- **Mark what you wrote** (a `backfilled: true` flag or a source name in the row's metadata) so a postflight can tell backfilled rows from live ones.
- **Verify the effect, not the report.** "N rows written" counts requests. Read the field back.
- **Finish the derived state.** If other data is derived from the rows you changed, the change is not done until that is refreshed too.

### Operator actions: preflight, confirmation, apply

1. The preflight is one read-only `SELECT` returning one row: `preflight_passed`, `blockers` (every reason the apply would refuse), `confirmation` (a small JSON value, NULL while anything blocks), and the counts behind it.
2. The apply has one marked line where the operator pastes that value:
   ```sql
   -- EDIT: paste the preflight's `confirmation` value between the quotes.
   confirmation constant jsonb := '{}';
   ```
   It refuses when the line is unedited, then re-checks everything inside its transaction and refuses unless the live state still matches the confirmation.
3. **Say exactly what to paste where, with an example**, in the apply's header and in the hand-off message: "Run the preflight; copy the `confirmation` cell, for example `{"rows_to_relabel": 7}`; replace `'{}'` on the EDIT line so it reads `confirmation constant jsonb := '{"rows_to_relabel": 7}';`; run the whole file." An operator who has not used the pattern before will otherwise run it unedited and meet the refusal.
4. Both files refuse when run unedited. The apply's last statement reads the result back.

### Scripts that touch data from application code

- Dry run by default; write only with `--apply`. Print what would change.
- Take an explicit `--environment`; never infer the database. Check the target against its own rows (the account the config row names, the version's owner) and refuse on a mismatch.
- Write conditionally (match the row's `updated_at`), keep a before-image of every changed field, and offer a rollback by run id.
- Page by a unique key (add the primary key as the last order column), filter in the query, and size pages by row width: rows carrying large JSON or source text page at about 200. Dry-run against the largest dataset first.
- Model spend or other paid calls need their own flag on top of `--apply`.

## The SQL Client Is Not psql

Write for the client the operator actually uses (often a web SQL editor):
- **ASCII only**, so pasting cannot corrupt a character.
- **No meta-commands** (`\set`, `\echo`, `\i`).
- **Notices are not shown.** A pass is a returned row, or the absence of an exception; never a `RAISE NOTICE`.
- **Only the last result set is shown.** Make the one row-returning `SELECT` the last statement.
- **Syntax is not a function.** Never write `pg_catalog.coalesce` or `pg_catalog.current_user` (error 42883, possibly latent inside PL/pgSQL). Qualify real catalog relations and functions.
- No grammar words as aliases (`constraint`); use `constraint_row`. `PUBLIC` is a grant keyword, not a role row.
- At most 100 function arguments, so at most 50 pairs per `jsonb_build_object`; build smaller objects and concatenate.
- Parenthesise and cast JSONB operators (`(doc #> '{a}'::text[]) - 'b'::text`).
- An `ORDER BY` on text compared against an application-sorted list pins `COLLATE "C"`.

## Deploy Order And Compatibility

- Apply the migration **before** pushing code that depends on it. Find out which database each deployment reads: a preview that reads production makes every push a production deploy for schema dependencies.
- Where a user depends on the write, let the code tolerate the old schema briefly: on the specific constraint violation, write the legacy shape and warn.
- An API layer that rejects a whole update when one column is unknown turns a code write to a missing column into a production failure. Check written keys against the target environment's schema evidence.

## After Applying

- Record the application in the feature's docs: date, environment, and the observed counts (a runs table for repeatable actions).
- Keep the postflight result as dated evidence when the change matters.
- Refresh the environment's schema snapshot from a new export, never by hand, then remove the drift note it settles. Never edit a snapshot to match code, a migration or another environment.
- Delete the operation's one-off structural test in the same change that records the postflight.
- Register every new backfill, repair or operator action in the project's catch-up list, in dependency order, in the same change that builds it.

## Tests

- Keep tests that execute SQL against a real database out of the default suite. Run them by hand (a local replica with the real trigger bodies) and list them in the feature's `test-suite.md`.
- Text-contract tests that pin a migration's guards are cheap and stay: one transaction, guards before writes, the refusal text, the CHECK values equal to the constants the code reads, the confirmation keys the preflight emits equal to those the apply reads, ASCII only, read-back last. Normalise line endings before matching.
- A test pinning a refusal must fail when the refusal is removed. In SQL probes, catch the specific SQLSTATE and assert the message, never `WHEN OTHERS`.
- A one-off bucket test is a gate: write it with the bucket, run it in the review before the run, delete it once the run is recorded.

## Final Checklist

- Did you read the schema evidence, the triggers and functions on the tables, and every other layer that enforces the rule?
- Does the header state why, run order, prerequisites, deploy order, rerun safety, refusals and the expected read-back?
- Is the up one transaction, guards first, idempotent, additive where possible, with bounded locks, no `CASCADE`, and a read-back `SELECT` last?
- Is the preflight read-only, one row, with a stated pass, failing closed on NULL and absence?
- Does the down refuse when data depends on the change, or say why it is forward-only?
- For a data change: exact selection, conditional writes, counts compared, a confirmation with a literal paste example, provenance marked, the effect read back?
- For a Node script: dry run by default, `--apply`, explicit `--environment`, target checked, before-image, pages ordered by a unique key?
- Is the file ASCII, free of meta-commands and qualified syntax, with no notice relied on?
- Is it applied before the code that needs it, with a fallback where users depend on the write?
- After the run: application recorded, snapshot re-exported, drift note removed, bucket test retired, catch-up step registered?
