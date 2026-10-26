# A custom query persister writes the whole cache on every query event

**Scope:** transferable
**Area:** TanStack Query persistence: `PersistQueryClientProvider` with a hand-written `Persister`
(`src/utils/cache/query-persister.ts`, `src/providers/QueryProvider.tsx`); 2026-10-10.
**Status:** fixed for this app's persister on 2026-10-10 (`plans/project-actions/project-settings-cog-latency-plan.md`): writes are throttled to one a second.

## The symptom

On a signed-in project overview, the settings gear appeared about 1.9 s after the project list it depends on had
finished downloading, with no request running in between and nothing on the page explaining the wait. Other
controls arrived late in the same way.

## Why it was misleading

The network waterfall looked complete, so the delay read as a slow render, a lazy chunk or a delayed reveal.
None of those were there. The page's own code was idle; the main thread was busy inside the cache library's
persistence, which no component calls.

## Why it happens

`persistQueryClientSubscribe` (`@tanstack/query-persist-client-core`, `persist.js`) subscribes to the query cache
and, on every `added`, `removed` and `updated` event, calls `persistQueryClientSave`, which dehydrates the whole
client and calls `persister.persistClient`. It does not throttle. The throttle lives inside TanStack's storage
persisters (`createAsyncStoragePersister`, `throttleTime: 1000`); a hand-written `Persister` that calls
`idb-keyval`'s `set` directly has none. An IndexedDB `put` structured-clones its value synchronously on the main
thread, so every query event became a full copy of the persisted cache.

Measured in the browser fixture (`tests/browser-fixtures/project-settings-cog.spec.ts`): one overview load made 23
to 37 writes. With a seeded 9 MB cache entry they cost 0.8 s of main-thread time per load and delayed the gear's
paint 0.2 s after its data arrived; with 18 MB, 1.6 s and 0.3 s; with an empty cache, almost nothing. Throttled,
the same load made two writes and the gear painted 25 to 60 ms after its data. The cost scales with the whole
persisted cache, so it grows with every project a user has opened that day (the cache's `gcTime` is 24 h).

## What to do

- A custom `Persister` must coalesce writes itself: keep the latest snapshot and write it once per window
  (1 s, as TanStack's own persisters do), ideally in an idle callback.
- Write an emptied cache at once: sign-out clears the client, and a throttled write would leave the previous
  user's data on disk for the window.
- To check a running app: wrap `IDBObjectStore.prototype.put` in an init script and count calls during one page
  load; more than one per second is this trap. `window.diag.idbSize()` in this app reports what each write copies.
