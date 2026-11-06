# Replace steps with reusable curriculums

**Family:** Academy setup and roles · **Added:** 2026-11-06 · **Source:** the steering engineer's review of the SLA feedback ("fellows take courses in cohorts", a curriculum as a container of courses), which also folds in the earlier request "in the cohorts, batches, and courses, I feel like it's a lot" · **Blocked on:** the decisions below, and the comparison of the live database after the 2026-11-06 start-up

Read `.claude/CLAUDE.md`, `docs/_learnings`, `docs/academy-desk/README.md`, `skills/plan-skill/SKILL.md` and `skills/migrations-skill/SKILL.md` (with its `references/this-repository.md`) first. The local `.env` is the live database: never load it in tests. Rehearse on a throwaway database.

## What exists now

```
Cohort (batches)
├─ Trainers: batches.trainer_id and cohort_trainers
├─ Fellows: batch_teachers and cohort_batch_teachers
└─ Step (cohort_batches, shown as "step")
   └─ Course: cohort_batch_courses, and also batch_courses on the cohort
      └─ Module (training_weeks)
         └─ Lesson file (deck_files on the module)
```

- A cohort is both a group of people and a stage to complete: `pathSummary` in `shared/academyPath.ts` counts a Fellow as done after `academy_settings.cohorts_required` cohorts. This is why the SLA brief says "five cohorts".
- A step is the closest thing to a curriculum, but it belongs to one cohort, cannot be reused, and is usually created automatically (a cohort's first course starts its first step).
- Lesson progress (`teacher_content_progress`) is per Fellow, with no cohort. Course completion (`teacher_course_completion`) carries the cohort.
- The Admin cohort page already reads as Trainers, Fellows and Courses in order; steps sit behind "Split into parts (advanced)". The Trainer's cohort room, the Fellow's path and Analytics still say "step".

## Proposed

Two trees that meet at one point:

```
CONTENT                      PEOPLE
Curriculum                   Cohort
└─ Course (in order)         ├─ Trainers
   └─ Lesson                 ├─ Fellows
      └─ File                └─ Curriculums it runs
```

- Admins and Trainers create curriculums. A curriculum replaces the step: it takes over ordering courses and adds a name, an owner and reuse across cohorts.
- "Lesson" and "File" can be a rename of Module and Lesson file, with no structural change; unlock order and quizzes keep working.
- The seed data's five primary stages and one secondary may become a Primary curriculum of five courses and a Secondary curriculum of one. Check this against live data, read-only.
- Retire later: `cohort_batches`, `cohort_batch_courses`, `cohort_batch_teachers`, `batches.trainer_id`.

## Decide before planning (recommended option first)

1. **What does a Fellow finish to graduate?** The curriculum, so `cohorts_required` goes away. Check with the SLA speaker whether "five cohorts" meant five groups or five stages.
2. **Do all Fellows in a cohort take the same curriculums?** Yes to start; use separate cohorts when people need different ones (a pre-service group gets its own cohort and a shorter curriculum). Per-Fellow assignment adds checks across many screens.
3. **What happens when a curriculum a cohort is running gets edited?** Copy the course list to the cohort when attached and remember the source curriculum. Running cohorts stay stable; the Admin can choose to update one. Course content stays shared.
4. **Who may edit a curriculum?** Follow the course rule: a Trainer edits their own or ones on their cohorts, only the Admin deletes, and Trainers attach only to cohorts they teach. Needs its own access tests.
5. **How does a retake work?** Lesson progress has no cohort, so a course repeated in another cohort or curriculum already counts as done. `course_repetitions` exists but this needs a rule.

## Do

Write a plan under `plans/curriculums/` before any code. Stages, each landing alone behind tests on a throwaway database:

1. Add curriculums and attach them to cohorts, writing through to the existing tables.
2. Make the cohort's course list the single write target.
3. Move readers (`server/academyPathRoutes.ts`, `server/scope.ts`, `server/learnerPath.ts`, `server/certificateEligibility.ts`, `shared/academyPath.ts`) off the step tables.
4. Backfill, check counts agree, then drop the old tables in a separate reviewed migration.

Progress, completion and certificates all read the step tables (`pathSummary`, `courseCompleted`, `batchIsComplete`), so stage 3 is the risk. There is one database, so any migration or backfill is a production write that needs the steering engineer's approval.

## Boundary with the SLA fixes

Item 7 of `plans/sla-feedback-fixes/sla-feedback-fixes-plan.md` gives Trainers named-Fellow materials without touching course placement, and deliberately leaves courses going to a whole cohort until this task.
