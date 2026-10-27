# A documented entry point can be unreachable

**Scope:** transferable

## The symptom

On 2026-09-25 the Google Docs ingestion docs said the active import path was `GDOCSUploader`, opened from
`Import from Google Docs` in the canvas `+ New` modal (`CreateSplotchModal`), and listed what it did: a
granted-scope check with consent re-auth, per-plan topic capacity with a streaming-limit modal, a "no process
found" message, and Topics funnel events. Nothing in the app could open that modal: `showCreateSplotchModal`
was declared, rendered and closed, but never set to `true`. Its opener had gone around 2025-09-22, a
commented-out leftover on 2025-10-05. For a year the documented flow was dead code, while the real one
(`DemoPicker`'s **Google docs** card) had none of those four behaviours. Three other doc folders listed
`CreateSplotchModal` as an entry point too.

The same week, the diagnostics widget's retired process graph (off behind `ENABLE_PROCESS_GRAPH_TAB = false`
since 2026-07-24) still had a browser test that clicked its **Graph** tab, and an architecture section
describing it as current behaviour.

## Why it was misleading

A component that compiles, is imported and is rendered under a condition looks reachable: every grep for it
finds a caller. Its docs were written when it was live and nobody rewrote them when its opener went. The
richer, unreachable path then reads as the product's behaviour, and the live path's gaps (no scope check, no
client-side capacity trim) are invisible, because the docs promise the dead path's protections.

A flag-gated feature has the same shape: `false` in `constants.ts` keeps its code, tests and docs alive, and
each looks like coverage.

## The check

- Before trusting that a UI path is live, find what turns it on: the state setter called with `true`, the
  route that renders it, the flag's value. A `useState(false)` whose setter only ever receives `false` (or is
  passed down unused) is a dead door.
- Measure reachability from the app's entry points, not by grep. An import graph over `src/` from the
  Next.js route files, with the gated render sites cut, names every module the gate alone keeps alive
  (`tmp/dead-code/reachability.cjs`, the method used for the 2026-09-25 removal; the TypeScript language
  service then shows which exports of a partly-live module only the dead set used).
- "The app never imports it" is not "unused". Give every deployable its own entry set before calling a
  module dead: Trigger.dev tasks (`src/trigger`), each worker, operator scripts, the browser-fixture routes
  copied into `src/app` at test time, and files read by path (SuiteScript bundles). On 2026-09-26, 65 of
  the 165 `src/` modules the app never loads were used by one of those (`tmp/dead-code/inventory.cjs`). To
  prove what ships, read the production build's `.next/trace` build-module spans
  (`tmp/dead-code/trace-check.cjs`), not the graph: the root `middleware.ts` looks like an entry but Next
  never builds it, because it looks for middleware only beside `src/app`.
- When removing an unreachable path, compare what it did with what the live path does, and write the
  difference down as known gaps (`docs/google-docs-ingestion/future-improvements.md`); do not let its
  docs describe the product.

## Evidence

- Removed 2026-09-25: `CreateSplotchModal.tsx`, `GDOCSUploader.tsx`, `NoProcessFound.tsx`, the retired
  process graph (explorer, network renderer, workers, connection engine, caches, perf recorders, switches),
  and their tests; docs in ten folders brought to the live paths.
- `git log -S "setShowCreateSplotchModal(true)" -- src/components/canvas/CanvasThumbnails.tsx`.
- Live Google Docs path: `handleGoogleDocsImport` / `pickerCallback` / `handleGdocsTopicsConfirmed` in
  `src/components/canvas/DemoPicker.tsx`; the save route's limit check is `checkSplotchCreationLimit`.
