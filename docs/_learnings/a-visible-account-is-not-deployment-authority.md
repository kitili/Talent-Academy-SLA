# A visible account is not deployment authority

**Scope:** transferable

## Symptom

A Build approval card showed one production NetSuite account while the deploy
route could choose another. The Splotch source provenance belonged to a third
account.

## Why it was misleading

Every individual connection was valid and production-scoped. The client and
server both chose a plausible connection, but each selected the first item from
a differently ordered organization-level list. A correct-looking account label
therefore said nothing about which repository account the process represented.

## The check

Resolve the target from the repository identity before inspecting connection
lists:

```text
processes.code_versions_id
  -> newest netsuite_configs by extracted_at DESC, id DESC
  -> exact connection_id + account_id
  -> exact netsuite_connections row
```

Freeze that pair at Build start, show the same pair at approval, and compare it
again at deploy API ingress, worker ingress, and occurrence binding. There must
be no sibling-connection fallback.

## Since then: a canvas-level walk has the same trap one step earlier

**2026-10-08.** Structural record writes have no process to start from, only the project (canvas), so they walk
`code` (by `canvas_id`) -> newest published `code_versions` -> newest `netsuite_configs` -> its connection
(`resolveRecordWriteTarget` in `src/app/api/netsuite/config-changes/context.ts`). The obvious helper for the first two
steps, `resolveSystemMapVersion` (`src/utils/process-graph/systemMapSource.ts`), takes the canvas's `code` row with an
**unordered** `.limit(1)`: right for drawing a map, wrong for choosing the account a write lands on. The record-write
resolver reads the canvas's code rows itself and refuses unless there is exactly one. An existing resolver is not a
safe one until it has been read against the question "could this pick a different target on another day?".

## Since then: the unbound paths had the organization fallback too

**2026-10-14.** A deploy with no Build binding, the reader install, the revert and Enable Features still took the
first valid connection of the organization. All of them now resolve the project's account first
(`src/utils/netsuite/projectAccount.server.ts`); see
`a-fallback-to-any-connection-in-the-organization-can-write-to-a-customer.md`. The approval card's label
(`pickProductionConnectionTarget`) still names the organization's first production connection: open, as a task.

## Evidence

The defect lived independently in
`src/components/builder/BuildPaneContainer.tsx` and
`src/app/api/netsuite/deploy/edits.ts`. The repaired shared authority is
`src/utils/netsuite/criticalDrivetrainDeployTarget.server.ts`; the final SQL
check is in
`migrations/drivetrain/enforce_critical_drivetrain_deploy_target.up.sql`.
