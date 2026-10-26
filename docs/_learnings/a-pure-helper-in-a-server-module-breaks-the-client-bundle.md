# A pure helper in a server module breaks the client bundle

**Scope:** transferable
**Where:** `src/components/canvas/RepoRefreshReport.tsx` importing from
`src/utils/repo-refresh/deploymentReport.ts`. Found 2026-10-06 on `fix/drivetrain`.

## The symptom

Vercel failed the production build; typecheck and the full unit suite were green:

```text
Import trace for requested module:
node:async_hooks
./src/utils/performance/server/scope.ts
./src/utils/performance/server/timedFetch.ts
./src/utils/supabase/adminClient.ts
./src/utils/repo-refresh/deploymentReport.ts
./src/components/canvas/RepoRefreshReport.tsx
> Build failed because of webpack errors
```

## Why it was misleading

The client component imported only two pure functions — a label map and a
string builder — and neither touches the database. But webpack bundles the
*module*, not the functions: `deploymentReport.ts` also held the loader that
reads files through the admin client, so the whole server chain came along.
Nothing in the import line hints at it, the module has no `.server` suffix, and
`tsc` and `node --test` resolve server modules happily.

## The check

- A file a `'use client'` component imports must not reach `adminClient`,
  `supabase/server`, or anything under `utils/performance/server` — at any depth.
  Put client-usable helpers in their own module with only `import type`
  dependencies (here `deploymentReportFormat.ts`), and name server loaders
  `*.server.ts` where practical.
- Run `yarn build` before pushing a change that adds an import to a client
  component. See also [a-green-test-run-is-not-a-green-build.md](a-green-test-run-is-not-a-green-build.md).
- `tests/unit/repo-refresh/deploymentReport.test.ts` now asserts the modal does
  not import the server module and that the format module has only type imports.
