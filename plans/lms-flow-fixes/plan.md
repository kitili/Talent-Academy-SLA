# LMS Flow Fixes Plan

## Status

**Plan only. Not started.** Written 2026-10-26 by worker `flow-fix-plan` on branch `claude/flow-fix-plan-f58e81`,
base `71c4782`. The working branch is now `feat/improvements` (at `991c551`, one commit past `71c4782` that changes
only `skills/handoff-skill/references/this-repository.md` and `skills/orchestration-skill/references/this-repository.md`;
no code moved, so the evidence below holds). Every track branches from `feat/improvements` and merges back into it.
`main` stays production and takes a merge only with the steering engineer's go-ahead.

Decisions taken: none. D1 to D12 below wait on the steering engineer (gich2009), after the orchestrator's review.
Nothing is built. No SQL was run; no live data was read; the server was not started.

Verification run while writing this plan: reading code at `71c4782` only. `npm install` was not run in this worktree,
so no test or typecheck ran (the plan changes no code). File name: the brief asked for `plan.md`; the plan skill's
`-plan.md` suffix was not used for that reason.

## Objective

A review on 2026-10-26 (signed in as Admin, Trainer and Teacher, plus a code trace) found 25 flow problems, recorded
in the "Silverleaf Academy LMS — Flow Feedback" doc. The worst of them let a teacher finish a course without doing
it, let a teacher pass any quiz by sending their own answer key, and let any trainer edit or delete any course. The
rest are naming that overlaps, rules that disagree between screens, and copy or pages that promise what the code does
not do. This plan re-checks each finding against the code, proposes the product decisions the fixes depend on, and
splits the fixes into tracks that can run in parallel worktrees.

## Methodology

Instruction file: `.claude/CLAUDE.md`. Read: `skills/plan-skill/SKILL.md` and its reference; the orchestration
skill (*Task Boundaries And Shared Contracts*, *Choosing The Model*) and its reference; the test and migrations
skill references; `docs/_learnings/README.md` and the four entries named in the brief; `docs/guides/*.md`;
`docs/architecture/workflow.md`.

Code traced at `71c4782`: `server/routes.ts` (route map and every handler named below), `server/storage.ts`
(completion, certificates, batches, trainer desk), `server/academyPathRoutes.ts`, `server/progressLogic.ts`,
`server/quizDelivery.ts`, `server/cohortGate.ts`, `server/cohortAccess.ts`, `server/access.ts`, `server/auth.ts`,
`server/teacherAuth.ts`, `server/app.ts`, `server/vercel-handler.ts`, `server/ensureTestLogins.ts`,
`server/deskRoster.ts`, `shared/schema.ts`, `shared/academyPath.ts`, `shared/cohortMedals.ts`,
`shared/certificateDesigns.ts`, `shared/practiceLessons.ts`, and the client pages and components named per finding.
Tests read: `tests/*.test.ts` names, and the text contracts that read `server/routes.ts`, `server/storage.ts` and
client pages (a change in those files can fail them).

Not checked: live data (cohort counts in findings 15 and 16, what rows exist). Those go to the Phase 0 probe.

## Baseline Findings

Verdict per finding at `71c4782`. "Confirmed" means the code does what the review said. "Partly" means the symptom is
real but the cause or scope differs; the difference is stated. Line numbers are at `71c4782`.

### High

1. **Confirmed.** `POST /api/teacher/courses/:courseId/complete` (`server/routes.ts:3641-3681`) checks enrolment and
   that the course is next in `assignedAt` order, then writes `teacher_course_completion.status = 'completed'`. It never
   looks at module progress. It is reachable from the UI: `GET /api/teacher/assigned-weeks` sets `canCheckComplete`
   when the course is next and its first module is unlocked (`routes.ts:3628-3631`), and the dashboard then shows
   **Mark complete and open the next** and reports the course as 100% (`client/src/pages/teacher-dashboard.tsx:775-786`).
   The row it writes unlocks the next course (`server/progressLogic.ts:47-50`), counts on the academy path
   (`server/academyPathRoutes.ts:131-143`), earns the "Course done" medal, and is what the bulk certificate generator
   reads (`server/storage.ts:1923-1937`).
2. **Confirmed, and wider.** Both module-quiz submit routes score the `questions` array the client sends against the
   `correctAnswer` inside it: `POST /api/training-weeks/:weekId/files/:fileId/submit-quiz` (`routes.ts:2130-2211`) and
   `POST /api/teachers/weeks/:weekId/content/:deckFileId/submit-quiz` (`routes.ts:3997-4133`). `GET .../files/:fileId/quiz`
   returns the cached questions with `correctAnswer` to teachers (`routes.ts:2229-2278`). New, same family:
   - `GET /api/assigned-quizzes/:quizId` returns `quiz.questions` with answers to the teacher (`routes.ts:3062-3080`);
     scoring there is server-side, but the answers are in hand before attempt 1.
   - `POST /api/training-weeks/:weekId/files/:fileId/generate-quiz` is `isAuthenticatedAny`, so a teacher can call it
     (`routes.ts:1933-1997`). On a cache hit it returns the cached quiz with answers, approved or not. With
     `force: true` it pays OpenAI for a new draft, overwrites the trainer's quiz, and saves it `approved: true`.
   - `POST /api/teachers/weeks/:weekId/content/:deckFileId/generate-quiz` and `.../regenerate-quiz`
     (`routes.ts:3948-3995, 4134-4205`) let a teacher trigger OpenAI drafts and get the answers back. No client file
     calls these two or the content `submit-quiz` route (grep of `client/src` for `/content/${` finds only `/viewed`).
   - A teacher in no cohort that holds the course is let through: `teacherMayTakeQuiz([])` returns `null`
     (`server/cohortAccess.ts:33-37`, called from `server/cohortGate.ts:5-18`).
   - `POST .../regenerate-quiz-admin` is `isAuthenticated` only, so any trainer can replace any quiz (`routes.ts:2101-2127`).
3. **Partly.** A lesson file completes only when its quiz is passed: `status = 'completed'` is written only by the quiz
   pass paths (`routes.ts:2169-2173, 4029-4033`); "mark read" writes `viewed` (`routes.ts:3900-3918`). So a file with no
   quiz the teacher can open blocks the module, and the next module stays locked (`routes.ts:3821-3849`). That part is
   confirmed. But a module with **no lesson file at all** does not block: `moduleIsComplete` treats `total === 0` as
   complete (`server/progressLogic.ts:14-19`), and `tests/feedback-fixes.test.ts:95` pins that. The teacher dialog never
   generates (`canGenerateQuiz={false}`, `client/src/pages/teacher-content-view.tsx:808, 1471`), so a failed AI draft
   leaves the file with no quiz.
4. **Confirmed.** The `batches` table holds cohorts and `cohort_batches` holds the steps inside them
   (`shared/schema.ts:301, 330`). The admin Cohorts page labels each step `Week {index + 1}` in an uppercase style
   (`client/src/pages/admin-batches.tsx:517`), while `shared/academyPath.ts:7-21` calls the step a "Batch", the trainer
   desk route is `/trainer/batches`, and the trainer guide says "Open a batch" for a cohort. `training_weeks` holds
   modules (UI says "Module"). Cohorts named "Batch 2 ..." are data, not code; not checked.
5. **Confirmed.** `PUT /api/admin/academy-path/batches/:batchId/teachers` deletes every `batch_teachers` row for the
   cohort and re-inserts the union of the step lists (`server/academyPathRoutes.ts:338-369`, delete at `:361`). A
   teacher a trainer added through `POST /api/batches/:batchId/teachers` (`routes.ts:2509`) or CSV import is on no step,
   so the next admin save removes them from the cohort.
6. **Confirmed.** `PATCH /api/courses/:id` and `DELETE /api/courses/:id` are `isTrainer` with no scope
   (`routes.ts:4599-4621`). `courses` has no owner column (`shared/schema.ts:86-96`). The same holds for
   `/api/training-weeks*`, `/api/content-items/*`, deck upload, import, external link and reorder
   (`routes.ts:1107-1466, 1657-1697`), `POST /api/courses/:courseId/weeks/reorder` (`:4656`), and
   `POST /api/courses/:courseId/assign` (`:4623-4654`, any course onto any cohort; no client caller). No trainer screen
   creates, edits or deletes courses (only `admin-batches.tsx:268-302` and the unused `home.tsx` call those routes),
   so the course edit and delete gap is API-only today. A trainer can still open `/courses/:courseId` (CourseWeeks,
   any staff) and edit any course's modules if they have its id. Deleting a course cascades to completion rows and
   certificates (`shared/schema.ts:605, 665`).
7. **Confirmed.** `POST /api/courses` is `isAdmin` (`routes.ts:4579`). The trainer guide says "**Courses** in the
   header is the curriculum. Add a course there." (`docs/guides/trainer.md`, section D); the admin guide says both
   "Courses are added inside a batch" and "A trainer can add courses only" (`docs/guides/admin.md`, sections C and D).
   `/courses` redirects trainers to `/trainer/batches` (`client/src/pages/courses-catalog-redirect.tsx`).

### Medium

8. **Partly: two pass marks, not one.** Module quizzes pass at 70%: `scoreQuizSubmission` (`server/progressLogic.ts:133`),
   used by both submit routes (`routes.ts:2153, 4009`), the legacy week quiz (`routes.ts:1877`, staff only), and the
   dialog text "Not Passed (70% required)" (`client/src/components/FileQuizDialog.tsx:457, 673`). Assigned quizzes
   (trainer exams) pass at a per-quiz `passMark`, default 80 (`shared/schema.ts:393`, `server/quizDelivery.ts:19`),
   but two reads hardcode 80 (`routes.ts:3225, 3281`). The learner guide says 80%. `tests/feedback-fixes.test.ts:16, 55`
   pins 70%.
9. **Confirmed.** Course order everywhere a teacher sees it is `batch_courses.assigned_at`
   (`routes.ts:3562, 3654-3656`). Steps carry `order_index` (`cohort_batches`, `cohort_batch_courses`) and placing a
   course on a step also writes `batch_courses` (`server/academyPathRoutes.ts:254-286`), but nothing reads step order
   for locking. Reordering steps changes nothing a teacher sees.
10. **Confirmed.** `syncTeacherCourseCompletion` counts only modules that have files; with none, `total = 0` and the
    course never completes (`server/storage.ts:1847-1885`). The teacher path treats the same modules as complete
    (`progressLogic.ts:16`). Sync also runs only after a quiz pass, so a course with no passable quiz is never synced.
    New, same function: it marks a course `completed` at 90% of modules (`storage.ts:1880`), and it writes
    `in_progress` over an earlier `completed` row on the next pass in that course (the upsert sets `status`
    unconditionally, `storage.ts:1834-1841`).
11. **Partly.** The approve route allows trainers (`routes.ts:2042`, `isTrainer`), but the only screen with the approve
    control is admin Analytics (`client/src/pages/admin-analytics.tsx:3580`; `home.tsx` also has it but is unused).
    And most AI drafts are never unapproved: deck upload saves them `approved: true` (`routes.ts:1378-1383`), as do
    teacher-reachable generate (`:1982-1987`), regenerate (`:2121`) and bulk admin generation (`:2086`). Only a quiz
    first written by hand through `PATCH .../quiz` starts unapproved (`:2021-2040`). Unapproved quizzes do 404 for
    teachers on `GET .../quiz` (`:2238-2242`), but the generate route serves them on a cache hit.
12. **Confirmed.** `client/src/components/DiscussionThread.tsx:38` says "Your trainer can reply here." It is mounted only
    on `teacher-content-view.tsx:814, 1479`; no trainer page imports it. The guides already say the trainer does not see
    it (`docs/guides/learner.md`, last paragraph; `docs/guides/talking.md`, Module discussion row). New:
    `GET /api/weeks/:weekId/discussions` is `isAuthenticatedAny` with no enrolment check (`routes.ts:6514-6522`).
13. **Confirmed.** `tryAutoGenerateCertificate` only re-runs the sync and returns `null` (`server/storage.ts:2123-2126`);
    it is called from both quiz pass paths (`routes.ts:2190, 4076`).
14. **Confirmed.** `POST /api/admin/certificates/issue` checks only that the teacher and course exist
    (`routes.ts:4833-4861`, `storage.ts:2055-2100`), and stamps `completionPercentage: 100`. Course wording hardcodes
    "Culture of Achievement, Lesson Planning, Lesson Delivery, Silverleaf Promises" for every course
    (`shared/certificateDesigns.ts:30-32`). New: `GET /api/batches/:batchId/certificates` is `isTrainer` with no cohort
    scope (`routes.ts:4921-4930`).
15. **Partly: three rules confirmed, the numbers not checked.** People counts cohorts where the trainer is
    `created_by` or `trainer_id` (`routes.ts:4413`). The trainer desk, trainer analytics and admin users list use
    `getAllBatches(trainerId)`: `trainer_id`, `created_by`, or a `cohort_trainers` row (`storage.ts:1236-1243`). The
    route guard uses `trainerOwnsBatch`: `trainer_id`, `created_by` or `trainerIds` from `cohort_trainers`
    (`server/access.ts:13-18`). `GET /api/courses/:courseId/batches` uses `created_by` alone (`routes.ts:4567-4569`).
    The admin People card also shows the count under a "files completed" field and a 0/100 "progress"
    (`routes.ts:4421-4422`, `client/src/pages/admin-trainers.tsx:258-281`). Which screen showed 0, 1 and 8 is live data.
16. **Not verifiable without data; mechanism consistent.** A teacher sees cohorts through `batch_teachers`; a trainer
    through the rules in 15. A teacher enrolled in a cohort whose trainer is not assigned to it produces exactly this.
    Phase 0 Q4 and Q8 check it.
17. **Partly: the cause is the session, not only the cache.** Logout does clear this tab's `sessionStorage` and reloads
    to `/auth` (`client/src/hooks/use-auth.tsx:115-130`). Two things bring the old desk back:
    - New: one session can hold a staff user and a teacher at once. Teacher sign-in adds `teacherId` to the existing
      session without clearing the passport user (`server/teacherAuth.ts:25-75`; staff `/api/login` does the same for a
      teacher account, `server/auth.ts:206-212`), and `/api/user` returns the passport user first
      (`server/auth.ts:347-361`). So signing in as Teacher after Trainer, without logging out, shows the trainer desk.
      Logout sends `/api/logout` and `/api/teacher/logout` in parallel on the same session (`use-auth.tsx:117-120`), and
      `endSession` answers after 1.5 s even if the destroy has not finished (`server/auth.ts:47-76`); whether a racing
      save can re-create the row was not reproduced.
    - Every client gate trusts `sessionStorage` without asking the server: `staleTime: Infinity`
      (`client/src/lib/queryClient.ts:60`) with `initialData` from storage (`use-auth.tsx:31-40`), and `unified-auth.tsx:54-56`,
      `role-home.tsx:8` and `protected-route.tsx:17` redirect on the stored user alone. Another tab, or a back-navigation
      that restores the page, keeps the old desk.
18. **Partly.** "Learning materials" is `PracticeShelf` (`client/src/components/PracticeShelf.tsx`), a fixed list from
    `shared/practiceLessons.ts` ("Week One: Watch before you teach", playgroup-style) shown to every teacher on the
    Learning tab (`teacher-dashboard.tsx:722`), whatever their course or track. They are short text lessons, not
    videos (no video or YouTube reference in either file).

### Low

19. **Confirmed.** The trainer desk shows Delete on a cohort (`client/src/pages/trainer-batches.tsx:1102-1108`, call at
    `:865`); `DELETE /api/batches/:batchId` is `isAdmin` (`routes.ts:2357`), so it always fails for a trainer.
20. **Confirmed.** `client/src/pages/cohort-workspace.tsx:278`: "Assign a module quiz from the trainer workspace."
21. **Confirmed.** `docs/guides/trainer.md` lists a Certificates tab; the trainer tabs are Desk, Cohorts, Assessments &
    quizzes, Progress, Attendance, Messages, Schedule (`trainer-batches.tsx:136-142`).
22. **Confirmed.** Medals mix a per-cohort progress figure with academy-wide quiz counts from the report card
    (`routes.ts:3684-3722`, signals at `:3709-3710`). Any quiz answered anywhere earns "First step", "Answering" and
    "Quiz pass" in every cohort, so 3 of 7 show at 0% progress (`shared/cohortMedals.ts:46-58`).
23. **Partly.** Still present: "the way Canvas and Moodle keep the desk short" (`teacher-dashboard.tsx:615`),
    "Training Program Planner" (`teacher-dashboard.tsx:488`; also in unused `home.tsx`, `landing.tsx`, `auth-page.tsx`),
    "Sign them in" for approve (`client/src/pages/approvals.tsx:184, 225, 253, 297`; `docs/guides/admin.md`, section C).
    Not found at `71c4782`: "Adult teachers" (removed by `335c100`) and "Achievemment" (the certificate text spells
    "Achievement").
24. **Confirmed, plus one.** Routed with no link: `/admin/handover` (`App.tsx:67`), the trainer content history
    (`App.tsx:54`), `/emergency-reset` (`App.tsx:71`; its server route already refuses, `routes.ts:354-356`), and the two
    certificate pages (`App.tsx:56-57`; only the unused `home.tsx:384, 446` links them). Not routed at all: `home.tsx`
    (imported only by `client/src/components/examples/Home.tsx`), `landing.tsx`, `auth-page.tsx`, `teacher-auth.tsx`,
    `admin-ops-catalog.tsx`. New: `admin-certificate-approval.tsx:28` matches `/admin/certificates/:batchId`, but the
    route is `/admin/certificates/:batchId/approve`, so the page never reads its batch id.
25. **Confirmed.** `docs/architecture/workflow.md:55` and `docs/ops/README.md:39` cite `/admin/data-catalog`, which is not a
    route. `replit.md` describes the older "Training Program Planner" with public teacher registration.

### Also found: start-up deletion

**Confirmed.** `createApp` (`server/app.ts:63-67`) calls `ensureAllTestLogins`, which runs `pruneExtraDesksOnce()`
then `removeInactiveDesks()` (`server/ensureTestLogins.ts:140-147`). The latter hard-deletes every trainer and teacher
whose `approval_status = 'inactive'` (except admins, `trainer1`, `teacher@test.com`), first deleting rows keyed on them
by `user_id`/`teacher_id` and reassigning owner columns to the admin (`server/deskRoster.ts:101-240`). On Vercel,
`createApp` runs on every cold start (`server/vercel-handler.ts:3-14`), so this runs many times a day against
production. Only `pruneExtraDesksOnce` sets `inactive` (`deskRoster.ts:42-49`, once, behind the `app_flags` row
`desk_roster_v2`); no screen does. `tests/inactive-desks.test.ts:5` pins "inactive desks are deleted, not kept", so this
was a choice, while `admin-trainers.tsx:134` and `admin-teachers.tsx:161` say "Inactive desks stay folded below".

### Also found: other gaps on the way (marked new above, collected here)

- N1. One session can hold two identities (finding 17).
- N2. Teachers can trigger OpenAI quiz drafts, replace an approved quiz, and read unapproved quizzes (finding 2).
- N3. Module quizzes accept a teacher in no cohort for the course (finding 2).
- N4. `GET /api/teachers/weeks/:weekId/content` checks neither enrolment nor draft status, and only the previous module
  of the same course; the previous-course lock exists only in `assigned-weeks` (`routes.ts:3811-3895`).
- N5. Completion sync downgrades a completed course and completes at 90% (finding 10).
- N6. Trainer-readable certificates of any cohort; any-cohort course assignment; any-module discussion reads
  (findings 14, 6, 12).
- N7. The certificate approval page cannot read its route parameter (finding 24).

## Decisions

Open questions for the steering engineer. The recommended option comes first, and each says what changes under it.
None is taken. Each track names the decision it implements. A different answer changes that track's brief, not the
graph, except where noted.

**D1. One naming model, and whether steps gate.**
- **Recommended: Cohort → Step → Course → Module → Lesson file, in every screen and guide.** The words "batch" and
  "week" leave the UI. Tables and routes keep their names (`batches` = cohort, `cohort_batches` = step,
  `training_weeks` = module, `deckFiles` = lesson files). The mapping is written once, in `shared/academyPath.ts`
  (`ACADEMY_TERMS`), and in the docs. **Steps order the courses, and that order gates:** a course opens when the
  course before it in step order is complete. That is the existing course lock fed a new order. Courses on no step
  follow, by `assigned_at`. Changes: `admin-batches.tsx` "Week n" becomes "Step n". Trainer copy that says "batch" for
  a cohort says "cohort". Course order in `assigned-weeks`, `complete` and the content route comes from step order.
- Alternative B: keep "Batch" for the step (today's `ACADEMY_TERMS`). Fix only the places that say "batch" for a
  cohort and "Week" for a step. Less copy, but "batch" keeps colliding with every table and route name.
- Alternative C: rename the tables. Cut: a migration on the only database, with no gain users can see.
- Gate alternatives: steps as labels only (fix the order source, change no gate), or a step-level gate (every course
  in step N before any course in step N+1, with courses inside a step open in parallel). The step-level gate needs a
  second lock rule. The recommended option reuses the one that exists.

**D2. Whether trainers create courses.**
- **Recommended: no. Admins create, edit, delete and place courses. Trainers edit the modules, lesson files and
  quizzes of courses placed on cohorts they run.** `PATCH`/`DELETE /api/courses/:id` become admin-only. `POST
  /api/courses/:courseId/assign` has no caller and is deleted. Module, file and quiz routes check the trainer's scope
  through the course's placements. No migration. The trainer and admin guides change to match.
- Alternative: trainers create courses. That needs `courses.created_by` (a migration), an owner check on every course
  route, a trainer Courses screen that does not exist today, and a rule for a course a trainer created that an admin
  then placed elsewhere.

**D3. The pass mark.**
- **Recommended: 80% for module quizzes.** That matches the learner guide, the assigned-quiz default and the analytics
  "on-track" line. Assigned quizzes keep their per-quiz `passMark` (default 80), and the two hardcoded 80s read it.
  Passes already recorded at 70-79% stay passed, because attempt rows are not re-scored. At deploy, teachers mid-course
  need 80% on their next module quiz.
- Alternative: 70% everywhere. The learner guide, the dialog text and the assigned-quiz default move to 70
  (`schema.ts:393`, `quizDelivery.ts:19`). Changing a default needs no migration for new rows, but existing quizzes
  keep 80.
- Either way the number lives in `shared/constants.ts`, and `tests/feedback-fixes.test.ts:16, 55` change with it.

**D4. Certificates, and the completion rule.**
- **Recommended: a course is complete when every module is complete (100%), and certificates stay manual.** The admin
  issues them. The server refuses a course certificate unless the teacher meets the completion rule, computed from
  progress rows rather than from the stored `completed` flag (which the finding-1 skip may have set). A Fellowship or
  Advanced certificate requires the academy path to be done (`pathSummary(...).done`). Advanced stays the admin's
  judgment on top of that. The stub `tryAutoGenerateCertificate` is renamed for what it does (sync). Why 100%: modules
  lock in order, so 90% only ever means "the last module skipped".
- D4b, wording. **Recommended:** the course certificate names the course and drops the fixed topic list. The
  Fellowship and Advanced wording stays, because it describes the fellowship itself.
- Alternative: automatic certificates at completion. That adds a certificate write inside the quiz-submit path, a
  template choice per course, and a retry story for a certificate write that fails after the pass is saved.
- Alternative: keep 90%. Then the guides must say a course completes with its last module unpassed.

**D5. Whether trainers approve their own AI-drafted quizzes.**
- **Recommended: yes, for courses on cohorts they run, and every AI draft is saved unapproved.** The approve and edit
  dialog (`FileQuizEditDialog`) moves onto the module page trainers already use (`/courses/:courseId`, CourseWeeks).
  Admins keep it in Analytics. Generation is staff-only. A teacher sees a quiz only after a person approves it.
- Alternative: only admins approve. The server changes are the same, and trainers see "waiting for admin approval". The
  admin gets a list of quizzes waiting, and every new lesson file waits on the admin.
- Today's behaviour (drafts go live on save) is not offered, because it is the gap in N2. See
  `docs/_learnings/an-approval-the-model-can-write-is-not-an-approval.md`.

**D6. A module with no lesson file, or a lesson file with no quiz.**
- **Recommended: missing trainer work never blocks the teacher.** A lesson file is done when its approved quiz is
  passed. When it has no approved quiz, the file is done once the teacher marks it read. A module with no lesson file
  stays done without opening (today's rule, pinned by `tests/feedback-fixes.test.ts:95`), and now also counts towards
  course completion. The trainer desk lists lesson files with no approved quiz, so the trainer knows what to fix. A
  quiz approved after the teacher marked the file read does not undo their progress.
- Alternative: block and alert. The quiz stays a hard gate, and the trainer desk lists blocked teachers. Teachers wait.

**D7. Removing inactive accounts at server start.**
- **Recommended: stop.** Remove `removeInactiveDesks()` from start-up. Inactive desks stay, folded on People, as the
  page already says. If deletion is wanted later, it becomes an explicit admin action behind typed consent, like "Clear
  previous activity", not a side effect of a cold start. `pruneExtraDesksOnce()` stays: it is flag-gated and has
  already run. The plan still records its trap: deleting `app_flags.desk_roster_v2` marks every trainer but `trainer1`
  and every teacher but `teacher@test.com` inactive again.
- Alternative: keep it. Then the People copy changes to "Inactive desks are deleted the next time the app starts", and
  the plan records that a cold start is a destructive write.

**D8. One rule for a trainer's cohorts (findings 15, 16).** This is not in the brief's list, but tracks share it.
- **Recommended: a trainer's cohorts are those with a `cohort_trainers` row for them, or with `batches.trainer_id`
  set to them.** Those are the admin's two assignment writes (`academyPathRoutes.ts:326-330` keeps `trainer_id` equal
  to the first cohort trainer). `created_by` stops granting access, since only admins create cohorts now (`POST
  /api/batches` is `isAdmin`). Every count and guard uses this one rule. Phase 0 Q4 first counts cohorts a trainer
  reaches only through `created_by`. If there are any, the admin assigns that trainer before deploy, or the engineer
  keeps `created_by` in the rule.
- Alternative: keep all three sources (today's guard), and only make People and the course-batches filter match it.

**D9. What an admin's step save does to cohort enrolment (finding 5).**
- **Recommended: a step save adds missing cohort enrolments and never removes any.** Taking a teacher out of the cohort
  stays the explicit Remove on the roster, and the step editor says so. No migration.
- Alternative: record where each enrolment came from (`batch_teachers.source`, `step` or `trainer`; a migration).
  Then remove only step-sourced rows that no step still holds.

**D10. Completion rows the skip already wrote.**
- **Recommended: leave them, and report them.** Certificates (D4) and the new locks recompute from progress, so a bad
  row no longer earns a certificate. A read-only report lists rows marked complete that fail the rule, and the
  engineer decides per row. An optional repair (an `.apply.sql` that marks those rows `in_progress` again) is written
  but not applied.
- Alternative: run the repair at deploy. Teachers who skipped see the course reopen.

**D11. Module discussion (finding 12).**
- **Recommended: make the copy true now and scope reads to the cohort.** New copy: "Other teachers in your cohort can
  read this. Your trainer does not see this thread; use desk mail for a reply." A trainer view of threads goes to
  future improvements.
- Alternative: build the trainer view (read and reply per module on the trainer desk). That is a new screen and a new
  reply notification.

**D12. "Learning materials" (finding 18).**
- **Recommended: remove the shelf from the teacher Learning tab.** Delete `PracticeShelf.tsx` and
  `shared/practiceLessons.ts` if nothing else reads them. Today the shelf shows one early-years list to every track.
- Alternative: keep it, labelled "Extra reading (not part of your course)", and show it only to the playgroup track.
