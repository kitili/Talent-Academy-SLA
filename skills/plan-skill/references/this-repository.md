# Planning In This Repository

The project-specific half of `skills/plan-skill/SKILL.md`. Plans go in `plans/`, one file per piece of work.

## Baseline Sources

- **Code:** `client/src/` (Vite + React pages, hooks, components), `server/` (Express routes in `server/routes.ts`
  and `server/academyPathRoutes.ts`, storage in `server/storage.ts`, rules in `server/progressLogic.ts` and
  `server/cohortAccess.ts`), `shared/` (Drizzle schema in `shared/schema.ts` and pure rules used by both sides).
- **Schema:** `shared/schema.ts`, `supabase/migrations/*.sql`, and the start-up schema guard in
  `server/schemaGuard.ts`. No snapshots yet; the live Neon database is the truth.
- **Intended behaviour:** `docs/guides/` (per role) and `docs/architecture/workflow.md`. They are not always what the
  code does; check both and say which you trust.
- **Live behaviour:** the site at https://talent-academy-sla.vercel.app and `GET /api/health`.

## Prefer The Simplest Design

There is one Express app, one database and one deploy. Most changes fit an existing route file, a `shared/` rule and
a page. A new table, service, queue or dependency needs a one-line reason; say what was cut.

## Model Spend

Quizzes are drafted with OpenAI `gpt-4o` when a lesson file is uploaded (`server/quizService.ts`), and the result is
cached in `quiz_cache`. A plan that adds or changes a model call says how often it runs, keeps the cached result
instead of paying for it twice, and says what happens when the call fails (today a failed draft leaves the lesson
with no quiz).

## One Rule, Many Layers

The same rule is often written twice: once in the client and once on the server, or once per role. Example: the
trainer's delete button in `client/src/pages/trainer-batches.tsx` is shown while `DELETE /api/batches/:id` refuses
trainers. Name every layer the rule lives in and the one that enforces it.

## Every Surface That Raises The Action

Three desks reach the same data: admin (`/admin/*`), trainer (`/trainer/batches`) and teacher (`/teacher/*`), plus
the cohort room (`/cohorts/:id`) that admin and trainer share. A plan that changes an action lists every desk that
shows or triggers it.

## Consent Is A Gate; Checks Flag

Destructive admin actions ask for typed consent: "Clear previous activity" needs `CLEAR ACTIVITY`
(`server/freshStart.ts`). Keep new destructive actions behind the same kind of gate on the server, not only in the UI.

## Server-Owned Authority

A trainer's scope (the cohorts they may see and change) and a teacher's enrolment come from server rows
(`cohort_trainers`, `batch_teachers`), never from an id the client sends. Name the row that decides it.

## Judge Outcomes From The Durable Record

Course completion is a `teacher_course_completion` row; a quiz pass is a quiz-attempt row; a certificate is a
`teacher_certificates` row. Acceptance reads those rows, not a toast or a status code.

## Plan The After-State On Every Screen

The client caches the signed-in user in session storage and React Query keeps data with `staleTime: Infinity`, so a
screen can keep showing an old state after a change. For each action, say what every open desk shows afterwards.

## Services, Environments, And Deploy Order

- **Services:** one Vercel project. `npm run build` bundles the client into `dist/public` and the server into
  `dist/api.js`, served by the function `api/index.ts`. Lesson files go to Vercel Blob.
- **Environments:** production on Vercel, and local development. There is no staging. Local `.env` points at the
  same Neon database as production, so local work against it is production work.
- **Start-up writes:** every server start creates missing tables and columns, resets the test logins, and runs the
  one-time desk prune only if its `app_flags` row `desk_roster_v2` is missing (`server/app.ts`,
  `server/deskRoster.ts`). It keeps inactive accounts. A plan that touches accounts or schema says how this interacts
  with it.
- **Deploy order:** a schema change reaches the database before code that reads it. With one database and a
  start-up schema guard, say which of the two adds the column.

## Test Plan Conventions

Name the test files: older-style tests in `tests/*.test.ts`, new ones in `tests/unit/` or `tests/integration/`.
Prefer calling `shared/` and `server/` rules directly; use a text contract only where a route cannot be driven yet.
Close with `npm test` and `npm run typecheck`.
