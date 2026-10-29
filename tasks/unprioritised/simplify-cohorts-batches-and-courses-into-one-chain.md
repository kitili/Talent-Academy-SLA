# Simplify cohorts, batches and courses into one chain

**Family:** Academy setup and roles · **Added:** 2026-10-29 · **Source:** the steering engineer's request: "in the cohorts, batches, and courses, I feel like it's a lot"

Read `.claude/CLAUDE.md`, `docs/_learnings` and `docs/academy-desk/README.md` first. The local `.env` is the live database:
never load it in tests; use a throwaway Neon project and `scripts/workflow-walkthrough.ts`.

## What exists now

- `batches` is what the screens call a **cohort**. `cohort_batches` ("steps", shown as "batches") sit inside it.
- Courses are attached twice: `batch_courses` (cohort level, what a Fellow sees) and `cohort_batch_courses` (step level,
  used by the path and progress).
- Fellows are enrolled twice: `batch_teachers` and `cohort_batch_teachers` (a step save adds to the cohort, never removes).
- Trainers are linked twice: `batches.trainer_id` and `cohort_trainers`.

## Proposed

Cohort -> ordered Courses -> Content. A cohort has Trainers, Fellows and an ordered list of courses; the words "batch" and
"step" go. Keep `batches`, `batch_courses` (add `order_index`), `batch_teachers`, `cohort_trainers`. Retire later:
`cohort_batches`, `cohort_batch_courses`, `cohort_batch_teachers`, `batches.trainer_id`.

## Stages (each lands on its own, behind tests, on a throwaway database)

1. UI only: stop showing "batch/step"; one cohort page with three lists (Trainers, Fellows, Courses in order).
2. Make `batch_courses` the single write target, writing through to the old tables.
3. Move readers (`server/academyPathRoutes.ts`, `server/scope.ts`, `server/learnerPath.ts`, certificate eligibility,
   `shared/academyPath.ts`) to `batch_courses` + `order_index`.
4. Backfill, check counts agree, then drop the old tables in a separate reviewed migration.

## Risk

Progress, completion and certificates read the step tables (`pathSummary`, `courseCompleted`, `batchIsComplete`).
Stage 3 touches all of them. Blocked on: the steering engineer choosing the stage to start with.
