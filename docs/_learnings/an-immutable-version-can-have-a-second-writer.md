# An immutable version can have a second writer

**Scope:** transferable

## The symptom

A Build-with-Splotch deploy changed a workflow in NetSuite, and the repository
version that existed *before* the deploy (v1) afterwards contained the change.
The repository pointer had not moved, no new version existed, and v1's report
still described the account as it was before the deploy.

## Why it was misleading

Repo Refresh's model is that a published version is immutable: every refresh
writes brand-new rows under a new `code_versions_id` and never touches the
previous one. Its docs say so, its publication lifecycle enforces it, and every
refresh-side write path honours it. Reading that code, "v1 never changes" looks
like a guarantee.

It is a guarantee about *refresh*. The drivetrain's legacy promotion path
(`deployProcessVersionForSplotch` in `src/services/process-refresh/deployDraft.ts`)
clones the deployed process with `code_versions_id: predecessor.code_versions_id`
— a new `processes` row, inside the old version. Nothing in Repo Refresh calls
it, so nothing in Repo Refresh shows it.

A second trap sits right beside it. The obvious fix — stop writing into v1 and
put the change in a new version — loses the change on that path, because legacy
deploys read their source straight from the splotch's process and keep no delta
chain. The next legacy deploy would build on v1's unchanged source.

And a third: the obvious way to "move splotches to the new version" is the
refresh canvas sync, which repoints unedited splotches. A critical drivetrain
splotch's `process_id` is the anchor its source resolver rebuilds deployed
source from (base version + chain of deployed deltas); repointing it breaks the
next deploy and every rollback.

## The check

- Before relying on "version rows are never written after publication", grep
  for every writer of the version-scoped tables, not just the feature you are
  in: `grep -rn "code_versions_id:" src workers` and read each insert's source
  of that value. A value copied from a *predecessor* row is a write into an old
  version.
- Before repointing any splotch, check `current_deployment_occurrence_id`. The
  canvas sync now skips those (`drivetrain_bound` in
  `src/utils/repo-refresh/canvasSync.ts`).

## Evidence

- Legacy promotion still live: completed deploys on 2026-09-22 and 2026-09-28
  took it; 4 CODE splotches were off the critical ledger.
- Designed out for the critical path on 2026-10-02: a critical deploy now
  creates a new version (`buildRepositoryVersionFromDeploy`) and v1 is not
  written. The legacy path is unchanged pending a decision — see
  `docs/repo-refresh/future-improvements.md` § Deploys through the legacy
  promotion path.
- The new version had its own trap: finalize's flat SDF parse replaced the
  deployed object's enriched row. Designed out on 2026-10-06; see
  [a-successful-write-that-wrote-nothing.md](a-successful-write-that-wrote-nothing.md)
  § Second instance.

## Since 2026-10-14: every shipped change versions

Track B (`plans/drivetrain/ship-publishes-repository-version-plan.md`) extends the critical path's "a deploy creates a
version" to every verified change Splotch ships: files-only and Mode B deploys, cleanup, saved searches and structural
record writes. Two second writers remain, by decision: the legacy promotion path (a deploy for a Splotch off the
critical path) still clones into the base and is left out of shipped-change versions (B-D8), and
`POST /api/netsuite/configs` still upserts the latest published version's config row in place, which a shipped-change
build that copied the config a moment earlier does not see.
