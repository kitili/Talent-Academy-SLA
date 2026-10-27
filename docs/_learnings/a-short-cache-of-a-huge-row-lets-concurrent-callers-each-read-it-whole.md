# A short cache of a huge row lets concurrent callers each read it whole

**Scope:** transferable
**Area:** any server-side loader that caches an expensive read per process instance; here
`src/services/system-map/loadSystemMapSource.ts` over `netsuite_configs.config_data` (one 21.6 MB row per version).
**Status:** fixed for the System Map source loader on 2026-10-16 (`e20849cde`, `873989af8`, `2bdf19b71`; merged at
`436aaf3be`). Staging acceptance is pending. Open for other whole-row readers of the same row
(`resolveFromConfig`; `tasks/unprioritised/narrow-the-whole-row-netsuite-config-readers-on-the-version-build-path.md`).

## The symptom

Staging stopped answering for several minutes while a workstream agent opened the System Map and started a Draft
(2026-10-16, 13:26–13:40 UTC). The Postgres log held 47 of

```
canceling statement due to statement timeout
```

in that hour, in bursts: 9 at 13:38:27–28 and 6 at 13:37:36. Every entry inspected was PostgREST running

```
SELECT config_data, extracted_at FROM netsuite_configs WHERE code_versions_id = $1 ORDER BY extracted_at DESC LIMIT 1
```

and only the Map loader sends that select. The row is v6's config, 21.6 MB, on a 1 GB instance.

## Why it was misleading

- The loader already had a cache, 60 s per code version, so it read as "one read a minute at worst". A cache
  with a TTL says how often a *warm* entry is refilled, not how many callers refill it at once.
- The failure path was correct in isolation: a failed load caches nothing, because caching a failure serves it
  as the answer (`a-swallowed-error-reads-as-an-empty-result.md`, seventh instance). But "cache nothing" also
  means "remember nothing", so under a timeout every retry started another whole read while the earlier ones
  were still running in the database.
- The row had not changed: `updated_at` 13:21:28, seven seconds after the version published at 13:21:21. Every
  read in the burst fetched the same 21.6 MB again.

## Why it happens

- The cache is per instance and filled only after a complete load, and nothing records a load in flight. Callers
  that arrive while it is empty (a cold or recycled instance, a new version, the moment the TTL lapses) each run
  every read. The loader had ten callers (the agent's Map route, MCP tools, descriptions, the blast radius, Live
  Reports), and the browser Map also made its own uncached whole read of the same row. Derived from the code,
  not observed: a Map open plus an agent question plus a Draft put three to five 21.6 MB reads on the database
  within a second or two.
- A whole read of such a row takes about 2.9 s alone (20 MB PROD row, 2026-10-06). Three to nine at once on a
  small instance reach the statement timeout, and the harness's retry ("Try once more") adds to the pile.
- Raising the timeout would only let more of them stack up.

## What to do

- **Coalesce misses.** Keep a map of in-flight promises beside the cache: a miss joins the load running for
  that key or starts one, and the entry is removed in `finally`, only if it is still that load's own. Joiners
  share a failure; none of them caches it, and the next call after it settles tries again.
- **Key the expensive part on the row's revision, not on a clock.** Read a one-row identity first (`id`,
  `updated_at`) with a total order (add `id` as the tiebreak), reuse the cached derivation when the key matches,
  and read the heavy column only on a miss, **by that `id`**, so the two reads cannot pick different rows. This
  holds only if every writer stamps the revision: grep the writers (here the operator rebuild was the one that
  did not) and add a maximum age so a writer that forgets leaves a bounded staleness.
- **Bound the cache.** Derived folds of a 20 MB row stay resident now, not for 60 s: keep a few keys (least
  recently used out).
- **Test the pattern, not the text.** Five concurrent cold calls must make one whole read (count the
  heavy-column selects in the request log of a database emulator); five whose read fails must make one and all
  reject; an unchanged row after the TTL must cost an identity read and no whole read; a changed revision must
  be read whole (`tests/unit/system-map/systemMapSourceLoadPattern.test.ts`).
- **Look at who else reads the row whole.** Here the browser Map did too, uncached, and could not succeed above
  Vercel's 4.5 MB response limit (`docs/system-graph/architecture.md`, *Data Loading*).
- Do not raise the statement timeout, and do not cache the failure.

Plan and evidence: `plans/system-graph/system-map-source-load-plan.md`.
