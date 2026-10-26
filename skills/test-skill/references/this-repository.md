# Testing In This Repository

The project-specific half of `skills/test-skill/SKILL.md`: where each layer lives here, the runners, and the traps
already met.

## Layers And Runners

| Layer | Where | Runner |
| --- | --- | --- |
| Unit and text contracts (older suite) | `tests/*.test.ts`, 19 files, listed one by one in the `test` script | `tsx --test` |
| Unit (kit layout) | `tests/unit/` (`test-infrastructure/` holds the runner and rules-file guards) | `node scripts/run-node-tests.mjs unit` (`node:test` with `--import tsx`) |
| Integration | `tests/integration/` (empty so far) | `node scripts/run-node-tests.mjs integration` |
| End-to-end smoke | `scripts/smoke-test.ts` (`npm run smoke`), against a running server at `SMOKE_BASE_URL` (default `http://127.0.0.1:8765`) | by hand |
| PDF acceptance | `scripts/pdf-acceptance.ts` (`npm run pdf:accept`) | by hand |
| Browser fixtures | none yet | none yet |
| Type check | the whole repo, from `tsconfig.json` | `npm run typecheck` (`tsc --noEmit`) |

`npm test` runs the older suite and then the kit runner over `unit` and `integration`; only a green kit run writes
`.test-runs/last-green.json`.

Most older tests are text contracts: they read a server or client source file and match it with a regex
(`tests/admin-certificates.test.ts` reads `server/storage.ts`), or call pure helpers in `shared/` and `server/`
directly (`tests/schema-guard.test.ts` calls `server/schemaGuard.ts`).

## Shared Fixtures

None yet. Tests build their own inputs inline.

## Where Each Pattern Lives Here

- **Pure rules in `shared/`** (`academyPath.ts`, `trainerDesk.ts`, `cohortMedals.ts`, `learningStatus.ts`): call
  them directly, as `tests/trainer-desk.test.ts` and `tests/cohort-medals.test.ts` do.
- **Server rules** (`server/progressLogic.ts`, `server/cohortAccess.ts`, `server/schemaGuard.ts`): import and call
  them; they do not need a database.
- **Route handlers in `server/routes.ts`**: none are driven through injected dependencies yet. The routes call
  `storage` and `db` directly, so a handler test needs a fake `storage` module first. Until then, guard route rules
  with a text contract and say so in the test.
- **Real database**: no test runs against Neon. Keep it that way in the default suite (see the trap below).

## Which Suite To Run Here

- Code, tests, scripts, migrations or dependencies changed: `npm test` once, plus `npm run typecheck`. Log the run to a
  file and read its summary.
- Nothing relevant changed since the last green run: `npm run test:needed` says so; skip the suite.
- Only docs, skills or the rules files changed: `npm run test:docs`.
- The last full run failed and the fix changed only the failing tests: `npm run test:failed`.
- One area: run its file directly, for example `npx tsx --test tests/trainer-desk.test.ts`.

## Test Traps Recorded Here

- **Line endings.** This checkout has `core.autocrlf=true`, so source files are CRLF on Windows. A text contract
  whose regex spans a line break with `\n` fails here and passes on Linux (`tests/admin-certificates.test.ts` did on
  2026-10-26). Match line breaks with `\r?\n`. See `docs/_learnings/newline-anchored-matching-fails-only-on-windows.md`.
- **One live database.** The local `.env` points at the same Neon database the live site uses. Server start-up
  (`server/app.ts`) writes to it: it creates missing tables and columns (`server/schemaGuard.ts`), resets the test
  logins, and `removeInactiveDesks()` (`server/deskRoster.ts`) deletes every account marked inactive with the rows
  that hang on it. Never load `.env` into a test run, and never start the server from a test.
