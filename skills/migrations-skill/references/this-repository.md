# Migrations In This Repository

The project-specific half of `skills/migrations-skill/SKILL.md`.

## Environments And Who Applies

There is one database: Neon Postgres, read through `NEON_DATABASE_URL` or `DATABASE_URL`
(`server/databaseUrl.ts` also prefers `SUPABASE_DATABASE_URL` once that move happens; see
`docs/architecture/supabase-workflow.md`). Production on Vercel and local development both use it. There is no
staging.

Agents write migration files and run the static checks. The steering engineer applies SQL by hand, in the Neon SQL
editor, and records it. Agents never run `npm run db:push`, a `server/migrations/*.ts` script, or a local server
start against this database without the engineer's go-ahead, because each one writes to production.

## Layout

New work goes in `migrations/<feature>/` (the folder does not exist yet; create it with the first migration), using
the file set in `SKILL.md`: `<name>.preflight.sql`, `.up.sql`, `.down.sql`, `.postflight.sql`.

Note that `drizzle.config.ts` names `./migrations` as drizzle-kit's `out` folder. Drizzle has never generated files
there; if someone runs `drizzle-kit generate`, its output lands beside the hand-written buckets. Keep the two apart
by feature folder.

## Examples To Copy

None in the kit's file-set shape yet. The nearest are `supabase/migrations/0004_discussions.sql` (a single idempotent
`CREATE TABLE IF NOT EXISTS`) and `server/migrations/003-add-teacher-demographics.ts` (a script with a `rollback`
argument).

## Current Versus Legacy

Four ways the schema has changed so far, all still present:
- `shared/schema.ts` pushed with `npm run db:push` (drizzle-kit push; no migration files).
- `supabase/migrations/0001` to `0004`, SQL run by hand. Whether each one is applied to the Neon database is not
  recorded.
- `server/migrations/002` to `004`, TypeScript scripts run with `npx tsx`.
- At start-up: `ensureWrittenAssignmentTables()` in `server/db.ts` runs `CREATE TABLE IF NOT EXISTS`, and
  `ensureSchemaColumns()` (`server/schemaGuard.ts`) creates any table or column `shared/schema.ts` names that the
  database lacks.

Treat all four as legacy. New schema work uses `migrations/<feature>/`. Keep `shared/schema.ts` in step, and remember
the start-up guard will add a column the moment a deploy names it.

## SQL Editor Facts Recorded Here

None yet.

## Checkers And Tests

- `node scripts/database/check-sql-catalog-qualification.mjs migrations/<feature>` before handing off a bucket.
- `tests/schema-guard.test.ts` guards the start-up schema guard's table and column list.

## After A Run

Record what was applied, when, by whom, and the read-back result in the bucket's README. There are no schema
snapshots yet; if the engineer starts keeping them, add `docs/_global/database/`.

## Hand-Off Message

Name the file, the order (preflight, up, read-back or postflight), and what the preflight must show before the
up runs. Say that the target is the production database, since there is no other.

## Traps Recorded Here

- Server start-up writes to the database: it adds schema, resets the test logins, and runs `pruneExtraDesksOnce()`
  (`server/deskRoster.ts`) only if its flag row is missing. It keeps inactive accounts. Starting a local server with
  `.env` loaded is a production write.
- `pruneExtraDesksOnce()` ran a one-time cleanup keyed by the `app_flags` row `desk_roster_v2`. Deleting that row
  would run it again and remove every trainer but `trainer1` and every teacher but `teacher@test.com`.
