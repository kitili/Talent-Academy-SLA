# A conflict resolved toward a move drops the other side's edits

**Scope:** transferable
**Area:** merges between long-lived branches (here `qa` into `feat/functional-taxonomy-v2`) where one side
moved code into a new file and the other side edited it in the old one. Found in the process-selection
details panel; the trap is not specific to it.
**Status:** the lost sections were restored on 2026-09-26 and now have suite cover
(`tests/unit/netsuite-ingestion/netsuiteSupportingComponentDetails.test.ts`). The trap stays open for any
merge that brings in an extraction.

## The symptom

`tests/browser-fixtures/process-selection-deterministic-objects.spec.ts` expected a UI/style library's
expanded row to show **Component Purpose**, **Capabilities**, **Exports** and **Used By**. The row showed
Catalog Summary, Reference Files and Customization Types, and with enrichment matched it would also have
shown Operational Status, Insights and Configuration Context — the "active / fully operational"
presentation the plan (`plans/netsuite-ingestion/netsuite-ui-style-library-custom-object-classification-plan.md`)
was written to remove.

`git log -S 'Component Purpose'` named one commit, the one that added the sections (51ca77ac9,
2026-08-10), and nothing that removed them.

## Why it was misleading

- **`git log -S` does not look inside merges.** Without `-m` it never diffs a merge commit against its
  parents, so a string that a merge dropped has no "removing" commit at all. `git log -m -S` named seven
  merges; counting the string in each merge's two parents showed the one that lost it: 0847a075b
  (2026-09-08), whose first parent (the feature branch) had it and whose second parent (qa) did not.
- **qa never had the feature, so it did not remove it.** qa's b568f94dc (2026-08-27) extracted the modal's
  details renderer into `ProcessDetailsPanel.tsx` from a modal that predated 51ca77ac9 on its side. The
  merge then conflicted in the *old* file, where the extraction had deleted the region the feature branch
  had edited: one of 72 conflicted files in that merge (`git merge-tree --write-tree 6f798acda 99640bfee`
  replays it). Resolving that file toward qa was right for the file, and it took the feature's three hunks
  with it. The new file arrived from qa without conflict, so nothing in the merge marked where the hunks
  should have gone. Diffing qa's pre-extraction renderer against the feature's showed that those three
  hunks were the only difference.
- **Everything around the lost code stayed alive.** The producer, the repair, the fixture row and the
  docs all still described the sections. The account catch-up script registered the supporting-component
  repair on 2026-09-24 (1f7be2210), two weeks after its rendering was gone. The producer is off by default
  (`NETSUITE_SUPPORTING_COMPONENT_CLASSIFIER_MODE=off`) and production and staging held no component rows,
  so no user ever saw the page regress.
- **Only a browser fixture covered the rendering, and `yarn test` does not run browser fixtures.** For 18
  days the suite had no way to notice. The fixture's neighbour, `process-selection-bundles.spec.ts`, had
  been red for seven weeks for the same reason, on a label renamed in f377c3f76 (`Custom Workflows` →
  `Processes & Automations`, 2026-08-05). It was edited once in between (a71cc42d2 changed its fixture
  URL) and stayed red.

## The check

- After resolving a conflict toward the side that moved code, list the other side's edits to the moved
  region and look for each one in the new file:
  `git diff <merge-base> <other-parent> -- <old file>`, then grep the new file for every added line.
- To find where a string vanished, use `git log -m -S '<string>' -- <file>`, then count the string in each
  parent: `git show <merge>^1:<file> | grep -c '<string>'` and the same for `^2`. The merge whose result
  lacks it while one parent has it is the one that lost it.
- Give UI that only a browser spec covers a unit render too (`renderToStaticMarkup` of the real component,
  as in `tests/unit/canvas/mapDetailRecordPanel.test.ts`), fed by the real producer's output rather than a
  hand-built row ([a-display-kind-is-not-what-the-thing-is.md](a-display-kind-is-not-what-the-thing-is.md)).
- When you rename a visible label, grep `tests/browser-fixtures` as well as `tests/unit`.

## Evidence

- Loss: 0847a075b ("Merge branch 'qa' into feat/functional-taxonomy-v2", 2026-09-08). The string count in
  `ProcessSelectionModal.tsx` was 1 at 6f798acda (first parent), 0 at 99640bfee (second parent) and 0 in
  the result. The panel came from b568f94dc, which does not contain 51ca77ac9.
- Restored in `src/components/canvas/ProcessDetailsPanel.tsx`, which the process-selection modal and the
  Workflows & Objects page both render. The new unit test fails on the unrestored panel and on a mutant
  without the enrichment guard.
- Read-only counts on 2026-09-26: 0 rows with `own_script_id` like `component::ui_style_library::%` or a
  `supporting_component_v1` stamp, in production and in staging.

## Related

- [a-test-that-reads-source-as-text-cannot-guard-a-move.md](a-test-that-reads-source-as-text-cannot-guard-a-move.md):
  another way a move escapes its tests.
- [a-documented-entry-point-can-be-unreachable.md](a-documented-entry-point-can-be-unreachable.md): docs
  that kept describing a path the app no longer drew.
