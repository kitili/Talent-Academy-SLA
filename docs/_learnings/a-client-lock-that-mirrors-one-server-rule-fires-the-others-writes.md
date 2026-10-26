# A client lock that mirrors one server rule fires the other rule's writes

**Scope:** transferable
**Area:** the splotch page's autosave (`useSplotchAutoSave`, `SplotchPageClient.tsx`) against `PUT /api/splotches`.
**Status:** fixed for autosave on 2026-10-12 (`shouldBlockCurrentAutosave`, `src/utils/before-and-after/core.ts`).

## The symptom
Every time a splotch was opened (the Business Logic Map's board, the Map side panel), the console showed:

```
Failed to save splotch: {error: Current is read-only. Create or open the Draft to make changes.}
```

and `useSplotchSave` reported it to Sentry as a permanent error. Nothing was lost; the server refused correctly.

## Why it was misleading
- The page *has* a Current lock (`shouldLockCurrentBranch` → `isDraftLocked` → `isSaveBlocked`), so a write to a
  read-only Current looked impossible.
- The comment on the fingerprint reset says it exists "so initial load doesn't trigger a save". It does: the first pass
  records a fingerprint and still calls the save.

## Why it happens
The PUT refuses `current_branch` for two reasons: a **critical drivetrain** splotch (always), or a base version exists.
The client lock mirrors only the second, and its `hasBaseVersion` reads `false` until the check answers. So on open,
a critical splotch's Current looked writable to autosave, and the initial-load save went out.

## The check
When the client mirrors a server write rule, list every refusal the server makes and map each one to the client gate.
A "false until loaded" flag is an open lock during load. Treat pending as locked for writes.
