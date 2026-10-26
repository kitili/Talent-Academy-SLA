# A down migration is not a decommission script

**Scope:** transferable

**Designed out 2026-09-20** for the DotSON V2 layer: `migrations/dotson-v2-deprecation-staging/`
is the composed drop, and `tests/unit/drivetrain/stagingDecommissionBucket.test.ts`
pinned its drop set until the run; that gate was retired on 2026-09-21 once the
staging postflight record existed (see
`a-bucket-test-is-a-gate-not-a-monument.md`). The trap is general and will
recur with the next retired tranche, so the entry stays.

## The symptom

The plan for dropping the DotSON V2 layer from staging said: "the statements of
the existing `.down.sql` files, applied in reverse dependency order". Sixteen
tranches had shipped, each with a down. Reading them in that order, the drop
would have failed or done the wrong thing at least five times before the first
table went:

- `add_dotson_v2_desired_draft_lifecycle.down.sql`,
  `harden_build_session_semantic_revision_binding.down.sql` and
  `repair_dotson_v2_desired_activation_coalesce.down.sql` are **forward-only by
  design**: they `RAISE EXCEPTION` and roll back. Correct for a live layer,
  useless for removing a dead one.
- `add_dotson_v2_retention_pins.down.sql` and
  `add_dotson_v2_harmony_receipts.down.sql` **restore a predecessor**: they
  `CREATE OR REPLACE` the earlier body of a function you also want gone, so the
  drop set grows by one function every time you run one.
- `add_dotson_v2_publication_bindings.down.sql` rewrites
  `create_workflow_semantic_revision_v2` back to a delegate wrapper, after a
  catalog-identity check that refuses if the body is not exactly what it
  expects.
- `add_deployment_occurrence_ledger.down.sql` drops **the whole ledger** —
  `deployment_occurrences`, `source_artifacts`, the five tables the drivetrain
  runs on — because the V2-only `reconciliation_runs` was created by the same
  migration. There is no down for "just the V2 part of this file".
- `dotson_v2_desired_candidates.basis_receipt_id` references
  `dotson_v2_harmony_receipts`, and `dotson_v2_harmony_receipts.candidate_id`
  references `dotson_v2_desired_candidates`. The tranche that added the second
  key dropped it in its own down; no tranche's down was ever asked to drop both
  tables, so **no down breaks the cycle**.

And two functions take or return a table's row type
(`dotson_v2_authored_locator_for_row_internal(public.dotson_v2_authored_views)`,
`dotson_v2_insert_harmony_receipt_internal` returning
`public.dotson_v2_harmony_receipts`), which makes the table un-droppable while
the function exists — the reverse of the order a down naturally uses.

## Why it was misleading

Every down was correct. Each one answers "how do I undo *this* tranche, on the
day it shipped, with everything before it still in place". A decommission asks
a different question: "how do I remove *everything*, on a day when nothing is
in place that should be kept". The downs share names with the answer to that
question and none of its content. The plan's sentence read as a script; it was
a reading list.

The word "down" also carried a second false promise: that reversing the drop
would be re-running the ups. It would not. The column
`deployment_occurrences.requested_from_semantic_revision_id` was part of the
ledger's `CREATE TABLE`; the semantic writer was patched five times by repairs
that anchor on the exact stored body. A rollback of the decommission is a new
migration, so the decommission's downs are forward-only and say so.

## The check

Compose the drop from the downs' **object lists**, not their statements:

1. Diff the two schema snapshots by table and by column
   (`docs/_global/database/prod-schema.sql` against `staging-schema.sql`). The
   staging-only names are the drop set. Every `CREATE FUNCTION`, `CREATE
   TRIGGER` and `ALTER TABLE` in the tranche's ups is the rest of it. The
   downs confirm the list; they do not supply the order.
2. Order the tables by the foreign-key graph of the snapshot, referencing
   before referenced, and look for the cycle before writing the first `DROP`.
3. Drop triggers, then functions, then tables — functions before tables
   because of row-type parameters, triggers before functions because a
   trigger keeps its function alive.
4. No `CASCADE`. An object the composition missed must fail the transaction,
   not vanish with it.
5. End the up in a tripwire that enumerates the catalog by name pattern and
   refuses to commit if anything matches. Put the same enumeration in the
   preflight, so the operator learns about an unlisted object before the
   transaction, not inside it.

## Evidence

`migrations/dotson-v2-deprecation-staging/01_drop_dotson_v2_tables.up.sql` — the cycle
break is one `DROP CONSTRAINT` before seventeen `DROP TABLE`s in graph order;
functions go in step 4, tables in step 5. The composition never read the live
catalog; the preflights do that instead, and refuse on any function, trigger,
policy, view or foreign key the drop set does not name.
