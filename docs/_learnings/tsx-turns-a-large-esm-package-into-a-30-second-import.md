# tsx turns a large ESM package into a 30-second import

**Scope:** transferable
**Area:** the test runner (`node --import tsx --test`); found 2026-10-08 in the quiet-window measurement of the
`test:affected` plan.

## The symptom

Eight unit tests that render one React component each took about 215 s inside the suite and 28-34 s alone, for 3-12
assertions apiece. Nothing in the repository code they load is slow.

## Why it is misleading

The time is in a package, not in the code under test, and only under tsx. `import('framer-motion')` takes 0.45 s in
plain Node, about 30 s with `--import tsx`, and 0.24 s if the CommonJS build is loaded instead. Its ESM build (with
`motion-dom`) is about 400 small modules, and tsx's loader hooks add tens of milliseconds to each, every run: the tsx
cache in `%TEMP%` exists and does not help. The LangChain SDKs show the same effect (6-46 s each), and their
CommonJS builds only partly avoid it. Per-file timing in the suite hides it as "contention", because the slow files
all start together.

## The check

Time a suspect import in a fresh process with and without tsx:
`node --import tsx --input-type=module -e "const s = performance.now(); await import('<package>'); console.log(performance.now() - s)"`,
then the same without `--import tsx`. A large
gap means tsx is in the loop: load the package's CommonJS build for tests, or keep it out of import-time code
(load it lazily where it is used).

## Evidence

`plans/tooling/test-affected-and-dependency-map-plan.md`, *Results (2026-10-08 quiet window)*: a test-only preload
resolving `framer-motion` to its CommonJS entry took the full suite from 8.27 to 3.87 minutes with the same tests.
Both fixed 2026-10-08 (full suite 8.27 -> 2.46 min, same tests): the test-runner hook in `scripts/test-runtime/` and
lazy SDK imports in `src/lib/splotch-ai/configurations.ts`. The decision, its limits and how to walk it back:
`docs/_global/testing/README.md`, *Test-Only Module Loading*.

## Update 2026-10-26: the cache directory is a second per-process cost

The cache is not neutral. `tsx` lists its whole cache directory (`<os.tmpdir()>/tsx-<user>`) at every process start and
finds each module's entry with a linear scan. On a machine with many worktrees the directory reached 122,000 entries /
3.0 GB in nine days, and a trivial test file started in 103 ms (15-way) against 62 ms with a fresh directory (plain Node: 22 ms). The full suite ran
about 70 s slower for it (270 s against 200 s). The runner now replaces a directory of more than 20,000 entries before a run
(`purgeTsxCache` in `scripts/test-run-record.mjs`; `plans/tooling/test-suite-speed-plan.md`, D2). `TSX_DISABLE_CACHE=1` is not the
answer: 2 of 5 cache-off full runs had an extra failure (`esbuild` "The service was stopped").
