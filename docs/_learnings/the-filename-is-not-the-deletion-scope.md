# The filename is not the deletion scope

**Scope:** transferable
**Area:** removing a feature slice; DotSON v2 rollback removal, 2026-09-14

## The symptom

Removing the strict DotSON v2 rollback looked like a clean name-based sweep:

```
src/utils/netsuite/dotsonV2Rollback.ts
src/utils/netsuite/dotsonV2Rollback.server.ts
src/app/api/splotches/[id]/rollback/route.ts
src/app/api/splotches/[id]/rollback/preview/route.ts
tests/unit/netsuite/dotsonV2Rollback.test.ts
tests/unit/netsuite/dotsonV2RollbackMigration.test.ts
```

Every path matches the feature being deleted. The written plan said to delete all
six. Five were correct.

`dotsonV2RollbackMigration.test.ts` contains **no V2 machinery at all**. It pins
`migrations/semantic-harmony/add_dotson_v2_rollback_operation_kind.up.sql`, which
gives `prepare_deployment_occurrence_v1` its `p_operation_kind` parameter, the
`('deploy','rollback')` validation, the server-stamped `job_data.operationKind`
check, and the idempotent-retry comparison. That is V1 occurrence-ledger
plumbing. The replacement rollback is built directly on it.

Deleting it would have removed the only regression cover for the foundation the
replacement stands on — and it would have looked correct, because the tests would
have gone green.

## Why it was misleading

The file was named after the feature that *motivated* the migration, not the
thing the migration changed. Both are legitimate naming instincts, and nothing in
the path distinguishes them. A name-based sweep cannot tell "this is part of X"
from "this was added for X but belongs to Y".

Tests are especially prone to it: a test is named for the story that produced it,
while its assertions accumulate against whatever they need to protect.

## The check

Before deleting a file because its name matches, read what it actually asserts,
and ask which layer breaks if it is gone. Concretely, for each candidate:

```bash
# What does it reference that is NOT the thing being deleted?
grep -oE "(src|migrations|workers|scripts)/[A-Za-z0-9_/.-]+" <file> | sort -u
```

For this file, that listed `migrations/semantic-harmony/…`,
`src/app/api/netsuite/deploy/route.ts`, `src/utils/netsuite/sdfDeployService.ts`
and `src/utils/netsuite/deploymentOccurrence.ts` — four paths that were all
staying. That is the signal: **a test whose references mostly survive the
deletion is not part of the deletion.**

The same pass is what surfaced the other half of this job. `sdfDeployService.ts`
carries:

```ts
if (options.operationKind === 'rollback' && !options.desiredStateBindingRequired) {
    throw new Error('A rollback deploy exists only through the strict desired-state chain.')
}
```

A V1 rollback sets the kind without a desired-state binding, so that guard
refuses it. It is not in any file named for rollback, and it would have failed at
runtime rather than at compile or test time. Found by reading the outbound
references of the test that was nearly deleted.

## Evidence

- Removal commit deletes 5 files; `dotsonV2RollbackMigration.test.ts` retained
  and its describe block retitled to `occurrence-ledger rollback operation-kind
  contract` so the next reader is not misled the same way.
- Surviving plumbing the test protects: `prepare_deployment_occurrence_v1`'s
  `p_operation_kind`, `deploy/route.ts` `rollback_semantics_server_only`,
  `deploymentOccurrence.ts:436`, and the `operation_kind === 'rollback'` row in
  `DeploymentHistorySection.tsx`.
- The guard at `src/utils/netsuite/sdfDeployService.ts:76` is recorded as a
  known blocker in
  `plans/drivetrain/critical-drivetrain-rollback-and-script-coverage-plan.md`.

Designed out 2026-09-20: `dotsonV2RollbackMigration.test.ts` was finally
deleted with the DotSON V2 layer
(`plans/drivetrain/dotson-v2-deprecation-plan.md`) — this time after checking
that `add_dotson_v2_rollback_operation_kind` stays in the production migration
bucket and that `tests/unit/drivetrain/rollbackOccurrenceLink.test.ts` and
`prodMigrationBucket.test.ts` still pinned it (the latter retired 2026-09-21,
after the production bucket was applied). The lesson stands; that plan's
explicit keep-list is the same per-file check written down before the sweep.

## The general shape

When a plan says "delete everything matching X", the plan is a hypothesis about
naming, not a fact about dependencies. Verify it per file. The cost of checking
is a grep; the cost of missing one is a silent hole in regression cover that
nothing will report, because deleted tests do not fail.

Related: `one-rule-many-layers.md` — the guard above is another instance of the
same invariant living somewhere the obvious search does not reach.
