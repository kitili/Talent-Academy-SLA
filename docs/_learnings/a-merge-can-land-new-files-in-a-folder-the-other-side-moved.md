# A merge can land new files in a folder the other side moved

**Scope:** transferable
**Area:** merges between long-lived branches where one side relocated a whole directory and the
other side added files to the old one. Found merging qa into `feat/live-reports` (862b5c806); the
trap is not specific to it.
**Status:** fixed for that merge on 2026-09-29. The trap stays open for any merge across a
directory move.

## The symptom

After a clean-looking merge, the browser-fixture runner could not start and a production build
would have refused to run: `Production build refused: generated browser fixture routes exist at
src/app/test-fixtures`. qa had moved every fixture page to
`tests/browser-fixtures/implementation/app/test-fixtures/`, which the runner copies into
`src/app/test-fixtures` only for a fixture run (see `docs/code-ingestion/test-suite.md`). The feature
branch had added four fixtures (`live-report`, `live-report-external`, `live-report-share`,
`panel-tabs`) in the old place.

## Why it was misleading

- **Nothing conflicted.** Git moves files one by one, not directories. Files added on the other side
  have no counterpart on the moving side, so they merge in silently at the old path.
- **`yarn test` stayed green.** Unit and integration tests do not build the app or run fixtures, and
  the fixture pages still typechecked where they were.
- **The fixtures still worked when served by hand**, from a dev server started with
  `ENABLE_TEST_FIXTURES=true`, because the old directory is exactly where the runner puts them.
- **Moved back to the right place, they stopped typechecking.** Their relative imports
  (`'../../reports/[token]/…'`) only resolve once the runner has copied them under `src/app`. Use
  `@/app/...` in fixtures.

## The check

- After a merge, list the files the merge added under any directory the other side emptied:
  `git ls-tree -r --name-only <other-side> <old-dir>` is empty while
  `git ls-tree -r --name-only HEAD <old-dir>` is not.
- Specifically for fixtures: `git ls-files src/app/test-fixtures` must print nothing.
- Run the supported runner (`yarn test:browser-fixtures <spec>`) after a merge rather than a
  hand-started server. The runner refuses an unmarked `src/app/test-fixtures`, which is the point.

## Related

- [a-conflict-resolved-toward-a-move-drops-the-other-sides-edits.md](a-conflict-resolved-toward-a-move-drops-the-other-sides-edits.md):
  the same move, when the other side *edited* the moved code rather than adding beside it.
