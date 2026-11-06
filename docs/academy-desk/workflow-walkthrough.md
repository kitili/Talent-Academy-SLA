# Workflow walkthrough

`scripts/workflow-walkthrough.ts` plays the whole flow over HTTP and then tries what each desk must be refused.

## What it plays

1. Three requests (an instructional Trainer, a second Trainer, a pre-service Fellow). A pending person cannot sign in.
2. Admin approves; sign-in says "create your password"; passwords are created (one with stray spaces); each person
   signs in, the Fellow with their username and then their email in other capitals.
3. Admin makes a cohort and gives it to the instructional Trainer. The other Trainer sees nothing.
4. The Trainer registers a Fellow (who creates a password and signs in), enrols the requested Fellow, changes a kind.
5. The Trainer schedules an online session. The Fellow, Trainer and Admin timetables show it; the other Trainer's does
   not. A script link, a bad date and a backwards range are refused, and a link is refused once the Trainer is in-house.
6. Admin writes the academy year; Trainer and Fellow read it and cannot write.
7. The Trainer shares an assessment with one named Fellow and another with the cohort. Each Fellow sees the right ones;
   the Fellow not named cannot answer.
8. Refusals: Fellows and visitors on Trainer routes, the other Trainer on this cohort, password hashes and reset
   tokens absent, injection-shaped login, a script in a title kept as text.

12. All four kinds on People and on sign-in; a closed item with nothing to leak; reopening for one Fellow and for everyone; materials reaching only those named; Admin mail both ways; the calendar right granted and taken away; attendance downloads; refused script addresses; daily lines per role.

## How to run it (throwaway database only)

It writes people, a cohort and calendar rows. It refuses any base URL that is not `127.0.0.1` or `localhost`, but the
database behind that server is yours to protect: never point the server at the live academy database.

1. Make an empty Postgres (a temporary Neon project works) and run `npm run db:push` against it.
2. Start the server with only that URL: `NODE_ENV=production PORT=8765 NEON_DATABASE_URL=… node dist/index.js` after
   `npm run build`, on Node 20 or newer. The Vite dev server also needs Node 20 or newer.
3. `npx tsx scripts/workflow-walkthrough.ts`. In production mode the script sends `X-Forwarded-Proto: https` so the
   Secure session cookie is kept.
A local Postgres works as well as a temporary Neon project. On this machine: `initdb`, `pg_ctl -o "-p 55432" start`, `createdb academy_local`, then `NEON_DATABASE_URL=postgres://postgres@127.0.0.1:55432/academy_local npx drizzle-kit push --force`. **The tables must exist before the first start**, or sign-in has no test logins until the next start.

4. `npm run smoke` runs the older smoke test against the same server (use `NODE_ENV=development` so cookies are kept).
   Two checks fail on an empty database, on the original code as well: the graduation certificate (the test Fellow has not
   finished the path) and the shared module thread (403 from `discussionAccess`).

9. Round 2: who sits an assessment by name, the marking roster, the cross-cohort refusal on marking, deadlines (hidden,
   refused with 410, kept when handed in), session editing (Trainer, Admin, an in-house Trainer keeping links), Trainer
   courses (make, place, rename; refused to another Trainer; delete refused), the upload mode without a Blob token, and
   the new figures.

Last run: 157 of 157 on 2026-11-06 against a local Postgres, on `NODE_ENV=development`. Before that, 104 of 104 on 2026-10-29 against a temporary Neon project. The same day each desk was
clicked through in a browser on that database; the run found the raw-SQL time zone bug
(`docs/_learnings/a-timestamp-read-by-raw-sql-reaches-the-browser-without-its-zone.md`).
