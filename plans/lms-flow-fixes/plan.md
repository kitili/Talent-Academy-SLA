# LMS Flow Fixes Plan

## Status

**Plan only. Not started.** Commits on this branch: `36d7561`, `bb240de`, `8715d16` (WIP parts), then the final
commit. Written 2026-10-26 by worker `flow-fix-plan` on branch `claude/flow-fix-plan-f58e81`,
base `71c4782`. The working branch is now `feat/improvements` (at `991c551`, one commit past `71c4782` that changes
only `skills/handoff-skill/references/this-repository.md` and `skills/orchestration-skill/references/this-repository.md`;
no code moved, so the evidence below holds). Every track branches from `feat/improvements` and merges back into it.
`main` stays production and takes a merge only with the steering engineer's go-ahead.

**Approved, 2026-10-26, by the steering engineer (gich2009), with three amendments.** Merged into
`feat/improvements` at `ce1ca23`. Nothing is built yet.
- **D1 to D12: approved as recommended.**
- **Amendment 1, D13 added and decided: learners are called "Fellow"** in every screen and guide (see D13).
- **Amendment 2, acceptance runs on a Neon branch first.** The full acceptance list runs against a Neon branch
  (a copy of production, `.env.design`) with the local app, before `feat/improvements` merges into `main`. Production
  gets only a short read-only smoke check after deploy (see *Acceptance Criteria*). Phase 0 also runs on that branch.
- **Amendment 3, a hotfix from `main` closes the two worst live gaps now** (Track H): answers sent to teachers with
  server trust in them, and the course skip at 0%. It ships to production ahead of the tracks, with the engineer's
  go-ahead, and merges into `feat/improvements` before Layer 2 starts.

Before approval: D1 to D12 were proposed by the worker and reviewed by the orchestrator. No SQL was run; no live data
was read; the server was not started.

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

**D13. What learners are called.** Added at approval; decided 2026-10-26 by the steering engineer.
- **Decided: "Fellow".** Every screen, sign-in frame, tour and guide says Fellow where it means the learner today
  ("Teacher"). It matches Analytics, the ops docs, the `fellow_*` tables and the fellowship certificates. "Trainer"
  stays for the academy coach. Tables, routes and code identifiers keep `teacher` (as D1 keeps table names); the word
  lives in `ACADEMY_TERMS` (C6) as `learner: "Fellow"`. Track 0 adds the term; Track G changes the copy and guides; a
  track that touches a learner-facing string in its own files uses the term.

## Scope

In scope: findings 1-25, the start-up deletion, and N1-N7, under the recommended decisions. Out of scope: design
feedback (a separate track), table renames, new features beyond what a decision names, analytics screens other than
the counts in finding 15, and the legacy staff-only week quiz (`routes.ts:1813, 1858`; QuizDialog on the staff course
view, unreachable for teachers because `isAuthenticated` admits passport users only).

## Shared Contracts (Track 0)

Every contract two tracks share is fixed in committed files by **Track 0**, which merges into `feat/improvements`
before Tracks B, C, D, E and G branch. Where a later track disagrees with this section, this section wins, and the
track stops and reports.

| # | Contract | Lives in | Read by |
| --- | --- | --- | --- |
| C1 | Pass marks: `MODULE_QUIZ_PASS_PERCENT` (D3), `ASSIGNED_QUIZ_DEFAULT_PASS_PERCENT` (80), `QUIZ_ATTEMPTS` (3) | `shared/constants.ts` (new; the first constants module, as `.claude/CLAUDE.md` step 5 asks) | B (scoring, dialog text), C (progress), G (guides) |
| C2 | Completion rule: `COURSE_COMPLETE_PERCENT` (D4) in constants; pure `fileIsDone({ hasApprovedQuiz, quizPassed, markedRead })`, `moduleIsComplete`, `isCourseComplete` (D4, D6) | `shared/constants.ts`, `server/progressLogic.ts` (existing home of these rules) | B, C, D, E (trainer desk average) |
| C3 | `computeCourseCompletion(teacherId, courseId) → { totalModules, doneModules, complete }`, from progress rows, quiz-cache approval and quiz passes, using C2 | `server/completion.ts` (new) | C (the sync writer, `complete`, locks), D (certificate check), C's report SQL mirrors it |
| C4 | Trainer scope (D8): pure `trainerOwnsBatch` and its SQL twin in `storage.getAllBatches` | `server/access.ts`, `server/storage.ts` method `getAllBatches` (Track 0 owns this one method) | B, C, D, E |
| C5 | Resolvers: `trainerCohortIds(trainerId)`, `trainerMayEditCourse(user, courseId)` (D2: admin, or the course is placed on a cohort in scope), `teacherCohortsForCourse(teacherId, courseId)` (open cohorts only), `cohortCourseOrder(cohortId)` (D1: step `order_index`, then course `order_index` inside the step, then unplaced courses by `assigned_at`) | `server/scope.ts` (new) | B, C, D, E |
| C6 | Naming (D1, D13): `ACADEMY_TERMS` with `cohort`, `step`, `course`, `module`, `lessonFile`, `learner` ("Fellow") | `shared/academyPath.ts` (existing; updated, not copied) | C, E, G |
| C7 | New refusals: `{ error, code }` with `code` one of `NOT_ENROLLED`, `MODULE_LOCKED`, `COURSE_INCOMPLETE`, `NOT_YOUR_COURSE`, `QUIZ_NOT_APPROVED`, `ADMIN_ONLY`, each with the sentence a user sees | `shared/constants.ts` (`REFUSALS`) | B, C, D, E, and the client pages that show them |
| C8 | Cross-track call signatures that stay fixed: `storage.syncTeacherCourseCompletion(teacherId, courseId)` (B calls it; C owns its body); `storage.getCachedQuiz(weekId, fileId)` (C reads `approved`; B owns it) | unchanged files | B, C |

Justification for the new files (one line each, per paradigm 1):
- `shared/constants.ts`: the pass mark and completion percent are read on both sides and in docs; one reviewable place.
- `server/completion.ts`: the completion rule has four copies today (findings 3, 10, N5); C and D both need it.
- `server/scope.ts`: trainer and teacher scope have four copies today (finding 15); B, C, D and E all need them.

Track 0 also moves the existing readers of the old rules in the same commit (checklist 5):
`tests/feedback-fixes.test.ts` (70% cases, the module-unlock cases), `tests/access.test.ts` (trainer scope),
`tests/academy-path.test.ts` if `ACADEMY_TERMS` text changes. The client and guide readers are named in B, E and G.

## Task Boundaries

### Ownership of the two large server files

`server/routes.ts` and `server/storage.ts` cannot each have one owner without making B, C, D and E run one after
another. This plan proposes **region ownership** of those two files, anchored by route path and method name (line
numbers at `71c4782` are a guide only). A track edits only its own regions. If it needs a line elsewhere, it stops and
reports. Disjoint regions merge without conflict, except two hot spots, which the orchestrator resolves at merge by
keeping both sides: the import block at the top of `routes.ts`, and the `IStorage` interface at the top of
`storage.ts`. If the orchestrator prefers the strict "one owner per file" rule, the fallback order is under
*Dependency Graph*.

`server/routes.ts` regions:

| Region (first route → last route) | Lines at `71c4782` | Owner |
| --- | --- | --- |
| Top of file: imports, middlewares, `staffCanAccessBatch`, `teacherRecordAllowed` | 1-300 | Track 0 (others add imports only) |
| `/api/health` → `/api/trainer/reset-teacher-password` (auth, profile, approvals) | 302-1106 | none |
| `/api/training-weeks` → `/api/training-weeks/:weekId/files/:fileId/quiz-passed` (modules, lesson files, content items, module quizzes) | 1107-2298 | B |
| `/api/batches` → `/api/quiz-attempts/:attemptId/review-open-ended` (cohorts, rosters, trainer exam management) | 2299-3047 | E |
| `/api/teacher/quizzes` → `/api/teacher/quiz-attempts` (teacher assigned quizzes) | 3048-3340 | B |
| `/api/batches/:batchId/progress` → `/api/teachers/weeks/:weekId/content/:deckFileId/viewed` (progress, gradebook, learner path, complete, medals, stars, content) | 3341-3920 | C |
| `/api/teacher/week/:weekId/file-quizzes` → `.../regenerate-quiz` (teacher module-quiz routes) | 3921-4205 | B |
| `/api/trainers/teachers/:teacherId/weeks/:weekId/content-history` | 4206-4245 | C |
| `/api/admin/dashboard-stats` → `/api/courses/:courseId/weeks/reorder` → `/api/batches/:batchId/courses/:courseId` (admin people, courses, placements) | 4246-4761 | E |
| `/api/teacher/:teacherId/courses` → `PATCH /api/certificates/:certId` (certificates) | 4762-4977 | D |
| `/api/admin/analytics/*` → `/api/teacher/goals/:id` | 4978-6312 | none |
| `/api/batches/:batchId/teachers/import-csv` → `/api/teacher/assignments/:assignmentId/submit` (CSV import, written work, discussions) | 6313-6576 | C, for `/api/weeks/:weekId/discussions` only (D11); the rest none |
| `/api/batches/:batchId/events` → end | 6577-6826 | none |

`server/storage.ts` methods:

| Methods | Owner |
| --- | --- |
| `getAllBatches` | Track 0 (C4) |
| Quiz cache and quiz attempt methods (`saveCachedQuiz`, `getCachedQuiz`, `approveCachedQuiz`, `updateCachedQuizQuestions`, `deleteCachedQuiz`, attempt savers and readers) | B |
| `syncTeacherCourseCompletion`, `upsertTeacherCourseCompletion`, `calculateTeacherCourseCompletionPercentage`, `tryAutoGenerateCertificate`, teacher content progress methods | C |
| `getCompletedTeachersForBatchCourse`, `issueAcademyCertificate`, `generateTeacherCertificate`, certificate readers and `updateTeacherCertificate` | D |
| Batch, cohort, course and placement methods other than `getAllBatches`; `getTrainerAnalytics`, `getTrainerDesk` | E |
| Everything else | none |

### Tracks

**Track 0 — Shared contract.** Model: **Opus** (a shared contract every other track builds on).
- Fixes: nothing alone. It lands the decisions as code: C1 to C8.
- Owns: `shared/constants.ts` (new), `server/progressLogic.ts`, `server/completion.ts` (new), `server/scope.ts` (new),
  `server/access.ts`, `shared/academyPath.ts`, `storage.getAllBatches`, `routes.ts` lines 1-300,
  `tests/feedback-fixes.test.ts`, `tests/access.test.ts`, `tests/academy-path.test.ts`, `tests/unit/contract/`.
- Depends on: the decisions.
- Tests: `tests/unit/contract/pass-mark.test.ts` (the scorer at the boundary: 79% fails, 80% passes under D3);
  `tests/unit/contract/completion-rule.test.ts` (`fileIsDone` with and without an approved quiz; `isCourseComplete` at
  N-1 of N modules is false under D4; modules without files count);
  `tests/unit/contract/trainer-scope.test.ts` (`trainerOwnsBatch`: `cohort_trainers` yes, `trainer_id` yes,
  `created_by` alone no under D8); `tests/unit/contract/course-order.test.ts` (the pure part of `cohortCourseOrder`:
  step order, then course order, then unplaced by `assigned_at`). The db-backed resolvers in `server/scope.ts` and
  `server/completion.ts` take their row readers as arguments, so the tests drive them with rows in memory.
- Note: on its own, Track 0 changes what users get (the pass mark, the completion rule). It is merged into
  `feat/improvements` only, and nothing deploys until every track is in (see *Rollout*).

**Track A — Sign-in and session (N1, finding 17).** Model: **Opus** (sign-in and sessions).
- Fixes: each sign-in (staff `/api/login` for staff or teacher accounts, `/api/teacher/login`) regenerates the session,
  so it holds one identity. `/api/user` answers for that one identity. Logout makes one request that ends the whole
  session, and the client waits for it before it reloads. The client asks the server who is signed in on every load:
  `/api/user` is not `staleTime: Infinity`, and the stored user is a placeholder only. `unified-auth`, `role-home` and
  `protected-route` redirect on the server's answer, not on `sessionStorage`.
- Owns: `server/auth.ts`, `server/teacherAuth.ts`, `client/src/hooks/use-auth.tsx`, `client/src/lib/sessionUser.ts`,
  `client/src/lib/protected-route.tsx`, `client/src/pages/unified-auth.tsx`, `client/src/pages/role-home.tsx`,
  `tests/unit/auth/`.
- Depends on: nothing. Layer 1.
- Tests: `tests/unit/auth/one-identity-per-session.test.ts`. It drives the login handlers with a fake session object
  and asserts that a teacher login after a staff login leaves no passport user, and the reverse. It must fail with
  `regenerate` removed. Also run the text contracts that read `unified-auth.tsx` or `server/auth.ts`
  (`tests/access-request.test.ts`, `tests/admin-desk.test.ts`, `tests/attendance-board.test.ts` at `71c4782`) and keep
  them green with `\r?\n`.
- Not covered by a test: the browser back-navigation case. Acceptance checks it by hand (*Acceptance Criteria*).

**Track B — Quiz integrity (findings 2, 8, 11; N2, N3; part of 6).** Model: **Opus** (quiz scoring, role checks,
model spend).
- Fixes:
  - Teachers receive questions without `correctAnswer` or explanation (module quiz `GET`, assigned quiz `GET`, and
    attempt reads until the teacher has passed or used every attempt).
  - Module-quiz submit takes `answers` only and scores against the approved cached quiz on the server, with C1. Body
    `questions` are ignored. Old clients still work, because they served the same cached quiz.
  - Submit refuses a teacher with no open cohort for the course (`NOT_ENROLLED`) and a module that is locked for them
    (`MODULE_LOCKED`, via C3 and C5). `teacherMayTakeQuiz([])` refuses instead of allowing.
  - Delete the three teacher routes nothing calls: content `generate-quiz`, `submit-quiz`, `regenerate-quiz`.
  - Generate, regenerate and edit become staff-only and scoped by `trainerMayEditCourse`. Every AI draft is saved
    unapproved (D5) at deck upload, generate, regenerate and the bulk admin job. A cache hit does not serve an
    unapproved quiz to a learner.
  - Approve is scoped the same way. `FileQuizEditDialog` is mounted on CourseWeeks for trainers (D5).
  - The module, lesson-file and content-item routes in B's region check `trainerMayEditCourse` (D2, finding 6 for
    modules).
  - The hardcoded 80s at `routes.ts:3225, 3281` read the quiz's `passMark`. `FileQuizDialog` shows the pass mark from C1.
  - `/api/teacher/week/:weekId/file-quizzes` reports `quizExists` only for approved quizzes. Track C's content view
    needs this.
- Owns: its `routes.ts` regions; its `storage.ts` methods; `server/quizDelivery.ts`, `server/cohortGate.ts`,
  `server/cohortAccess.ts`, `server/quizService.ts`; `client/src/components/FileQuizDialog.tsx`,
  `client/src/components/FileQuizEditDialog.tsx`, `client/src/pages/course-weeks.tsx`; `tests/unit/quiz/`.
- Depends on: Track 0.
- Tests: `tests/unit/quiz/learner-projection.test.ts` (no `correctAnswer` in any field of what a learner gets);
  `tests/unit/quiz/server-scoring.test.ts` (a forged `questions` body with every answer "right" scores against the
  cache and fails; it must fail with the cache lookup removed); `tests/unit/quiz/quiz-gate.test.ts`
  (`teacherMayTakeQuiz([])` refuses). Route wiring that cannot be driven yet is guarded by text contracts in
  `tests/unit/quiz/route-contracts.test.ts`: the submit handler does not read `req.body.questions`; no
  `saveCachedQuiz({... approved: true })` remains; generate is not `isAuthenticatedAny`. Each is proven by removal.
  Per `docs/_learnings/a-test-that-reads-source-as-text-cannot-guard-a-move.md`, they say so.

**Track C — Learner path and completion (findings 1, 3, 9, 10, 22; N4, N5; D10 report; D11 scoping).** Model:
**Opus** (completion and locks; quiet failures).
- Fixes:
  - `POST .../courses/:courseId/complete` refuses unless C3 says complete (`COURSE_INCOMPLETE`). `canCheckComplete`
    uses the same rule.
  - Course order and locks in `assigned-weeks`, `complete` and the content route come from `cohortCourseOrder` (D1).
  - Module and file completion follow C2 (D6). Marking a file read completes it when it has no approved quiz, and
    triggers the sync.
  - `syncTeacherCourseCompletion` computes with C3, counts every module, completes at C1/C2's rule, and never writes
    `in_progress` over `completed`. `tryAutoGenerateCertificate` is renamed for what it does (D4); both callers
    (`routes.ts:2190` in B's region, `:4076` deleted by B) stay working through C8.
  - The teacher content `GET` checks enrolment, draft status and the previous-course lock (N4).
  - Medals use per-cohort quiz signals (finding 22). The trainer progress and gradebook figures read the same rule.
  - Discussions are read and posted only by teachers enrolled in a cohort that holds the module's course, and staff in
    scope (D11).
  - The content-history route checks the trainer's scope.
  - Teacher content view: lesson files without an approved quiz show "Mark read to continue".
  - Write the D10 report SQL.
- Owns: its `routes.ts` regions; its `storage.ts` methods; `client/src/pages/teacher-content-view.tsx`,
  `client/src/components/DiscussionThread.tsx` (scope behaviour; G writes the copy line through C's brief, see G);
  `migrations/lms-flow-fixes/`; `tests/unit/progress/`.
- Depends on: Track 0. It does not depend on B: C reads quiz approval through C8.
- Tests: `tests/unit/progress/complete-refuses-at-zero.test.ts` (the handler's rule function with in-memory rows:
  0 of 3 modules refuses; 3 of 3 accepts; must fail with the check removed);
  `tests/unit/progress/sync-never-downgrades.test.ts`; `tests/unit/progress/step-order-lock.test.ts`;
  `tests/unit/progress/medals-per-cohort.test.ts` (a quiz passed in cohort X earns nothing in cohort Y). Update
  `tests/cohort-medals.test.ts` if its signals change.

**Track D — Certificates (findings 13, 14, 21 behaviour, 24's certificate pages; N6, N7).** Model: **Opus**
(certificates).
- Fixes: issue and bulk generate refuse a course certificate unless C3 says complete, and a Fellowship or Advanced
  certificate unless the academy path is done (D4). Course wording names the course only (D4b). The admin
  certificates page lists who is eligible, as the server computes it, and shows the refusal sentence. `GET
  /api/batches/:batchId/certificates` checks cohort scope. Delete the unlinked approval and view pages and the bulk
  route if the engineer agrees they are unused (N7 makes the approval page dead anyway); otherwise fix the route
  pattern and link them from the admin certificates page.
- Owns: its `routes.ts` region; its `storage.ts` methods; `shared/certificateDesigns.ts`,
  `client/src/pages/admin-certificates.tsx`, `admin-certificate-approval.tsx`, `admin-certificate-view.tsx`,
  `client/src/App.tsx` lines 56-57 only (G owns the rest of `App.tsx`; see the hot-spot rule), `tests/unit/certificates/`,
  `tests/admin-certificates.test.ts`.
- Depends on: Track 0 (C3, C5). It does not depend on C, because it recomputes rather than reading C's rows.
- Tests: `tests/unit/certificates/issue-requires-completion.test.ts` (refusal proven by removal);
  `tests/admin-certificates.test.ts` updated for the new wording.

**Track E — Cohorts, steps, courses and trainer scope (findings 4, 5, 6, 7, 15, 16, 19; D1 admin side, D2, D8, D9).**
Model: **Opus** (role checks).
- Fixes:
  - `PATCH`/`DELETE /api/courses/:id` become `isAdmin`; delete `POST /api/courses/:courseId/assign` (D2).
  - `POST /api/courses/:courseId/weeks/reorder` checks `trainerMayEditCourse`.
  - A step teacher save never removes cohort enrolment (D9).
  - People, analytics and the course-batches filter count cohorts with C4. The People card labels the figure
    "Cohorts", not "files completed", and drops the 0/100 bar.
  - `admin-batches.tsx` labels steps with C6 ("Step n"). The trainer desk says "cohort" where it means a cohort.
  - Remove the trainer's cohort Delete button (finding 19).
  - Link the trainer content history from the Progress tab (finding 24).
- Owns: its `routes.ts` regions; its `storage.ts` methods; `server/academyPathRoutes.ts`;
  `client/src/pages/admin-batches.tsx`, `trainer-batches.tsx`, `admin-trainers.tsx`, `admin-teachers.tsx`,
  `admin-people.tsx`; `tests/unit/cohorts/`, `tests/cohort-admin.test.ts`, `tests/trainer-desk.test.ts`.
- Depends on: Track 0.
- Tests: `tests/unit/cohorts/step-save-keeps-enrolment.test.ts` (the enrolment diff as a pure function: a
  trainer-added teacher survives a step save; proven by removal); `tests/unit/cohorts/course-routes-admin-only.test.ts`
  (text contract: no `isTrainer` on course PATCH or DELETE); `tests/unit/cohorts/trainer-counts-agree.test.ts` (People,
  desk and guard counts come from one function for the same rows).

**Track F — Start-up writes (D7, "Also found").** Model: **Opus** (start-up writes to production).
- Fixes (under D7 recommended): `ensureAllTestLogins` no longer calls `removeInactiveDesks()`. The function stays,
  unused, only if the engineer wants a later admin action; otherwise it is deleted with its test cases.
  `tests/inactive-desks.test.ts` changes to pin "start-up does not delete" (a text contract over
  `server/ensureTestLogins.ts`, proven by putting the call back). Every reader of the old rule changes in the same
  commit: `skills/test-skill/references/this-repository.md`, `skills/migrations-skill/references/this-repository.md`,
  `skills/plan-skill/references/this-repository.md` and `skills/orchestration-skill/references/this-repository.md` all
  say start-up deletes inactive accounts. Under the alternative (keep), F only adds the trap to the docs, and E changes
  the People copy.
- Owns: `server/ensureTestLogins.ts`, `server/deskRoster.ts`, `tests/inactive-desks.test.ts`, the four skill
  reference files named above. (Base those on `feat/improvements` at or after `991c551`, which edited two of them.)
- Depends on: nothing. Layer 1.
- Tests: as above, plus `npm run test:docs` for the skill text.

**Track G — Copy, dead pages and docs (findings 12 copy, 18, 20, 21, 23, 24, 25; D11, D12; every guide).** Model:
**Sonnet** (UI copy, text contracts, docs). A separate Sonnet verify pass follows before merge.
- Fixes:
  - Copy: `cohort-workspace.tsx:278`, `teacher-dashboard.tsx` (Canvas and Moodle line, "Training Program Planner"),
    `approvals.tsx` ("Sign them in" → "Approve").
  - D12: remove `PracticeShelf` from the teacher dashboard.
  - Delete unrouted pages: `home.tsx`, `landing.tsx`, `auth-page.tsx`, `teacher-auth.tsx`, `admin-ops-catalog.tsx`,
    `components/examples/Home.tsx`.
  - Remove the `/emergency-reset` route and page, and `/admin/handover` (or link it from the admin desk if the
    engineer wants to keep it).
  - Docs: `docs/guides/*.md` for D1-D9 and D11; `docs/architecture/workflow.md`; `docs/ops/README.md`; `replit.md`
    (replace with a pointer to `README.md`, or delete).
  - The `DiscussionThread` copy line goes to Track C, the file's owner, as a fixed sentence from D11.
- Owns: `client/src/pages/teacher-dashboard.tsx`, `approvals.tsx`, `cohort-workspace.tsx`, `admin-handover.tsx`,
  `emergency-reset.tsx`, the deleted pages, `client/src/components/PracticeShelf.tsx`, `shared/practiceLessons.ts`,
  `client/src/App.tsx` except lines 56-57, `docs/guides/`, `docs/architecture/workflow.md`, `docs/ops/README.md`,
  `replit.md`, and the text-contract tests that read those pages (`tests/admin-desk.test.ts`,
  `tests/teacher-desk-split.test.ts`, `tests/attendance-board.test.ts` where they read these files).
- Depends on: Track 0 (C6 terms, C1 numbers). It merges **last**, after B to E, so the guides describe what merged.
- Tests: the text contracts above stay green; `npm run test:docs`. Grep that no page still imports a deleted file.

**Track H — Hotfix from `main`: quiz answers and the course skip (findings 1, 2; N2, N3).** Added at approval
(amendment 3). Model: **Opus** (quiz scoring and a production deploy).
- Branch: `hotfix/quiz-answers-and-skip`, cut from `main` (`origin/main`, `335c100`). It merges into `main` with the
  engineer's go-ahead (Vercel then deploys it), and the same branch merges into `feat/improvements` before Layer 2
  starts, so B and C build on it. It keeps today's 70% pass mark; D3's 80% ships with the full rollout.
- Fixes, smallest change that closes the gap:
  - Teachers never receive `correctAnswer` or explanations from `GET /api/training-weeks/:weekId/files/:fileId/quiz`
    or `GET /api/assigned-quizzes/:quizId`. Staff still do. Whatever the teacher's result screen needs after a submit
    comes back in the submit response, computed on the server.
  - Module-quiz submit scores the teacher's `answers` against the approved cached quiz on the server and ignores any
    `questions` in the body.
  - `POST .../generate-quiz` becomes staff-only, so a teacher can neither read a cached quiz through it nor trigger a
    draft. The three teacher content quiz routes with no client caller (content `generate-quiz`, `submit-quiz`,
    `regenerate-quiz`) are deleted.
  - `teacherMayTakeQuiz([])` refuses (N3).
  - `POST /api/teacher/courses/:courseId/complete` refuses unless every lesson file in the course that has an approved
    quiz has a passing attempt by that teacher. Files without an approved quiz do not block (today's escape hatch,
    and D6's direction). `canCheckComplete` uses the same rule, so the button shows only when the server would accept.
- Owns: the handlers named above in `server/routes.ts` (in B's and C's regions, before they start), `server/cohortAccess.ts`,
  a new `server/learnerQuiz.ts` if a pure helper is needed (B absorbs it later), the client pages that read the
  answers (`client/src/components/FileQuizDialog.tsx`, the assigned-exam page), and its tests. It does not touch Track
  0's files (`server/progressLogic.ts`, `server/access.ts`, `shared/academyPath.ts`, `storage.getAllBatches`); it
  calls `scoreQuizSubmission` as it is.
- Tests: `main` has no kit runner, so its tests go in `tests/*.test.ts` and the `test` script list, in the older
  style: a learner projection with no `correctAnswer`; a forged body scored against the cache (fails with the cache
  lookup removed); the complete rule at 0 of N and N of N (fails with the check removed). The `package.json` test line
  conflicts with `feat/improvements` at merge; the orchestrator keeps both. On `main`,
  `tests/admin-certificates.test.ts` fails on Windows checkouts (fixed on `feat/improvements` by `71c4782`); that is
  pre-existing.
- Acceptance: on the Neon branch, by the orchestrator, before the engineer is asked to merge into `main`.

### Dependency Graph

```
Layer 1 (start together):   Track 0 ─────────┐      Track A        Track F
                                              │
Layer 2 (after 0 merges):   B    C    D    E    G (drafts in parallel)
                             \    \    |    /    /
Layer 3 (integration):        orchestrator merges B, C, D, E in any order,
                              then G last; full suite, typecheck, build
```

- **First parallel layer: Track 0, Track A, Track F and Track H (the hotfix, from `main`).** A and F share no file
  with 0 or with each other. H edits B's and C's regions before they start, and none of Track 0's files; the two meet
  only in the `routes.ts` import block, which the orchestrator resolves at merge.
- Layer 2 starts once Track 0 **and Track H** are merged into `feat/improvements`: B, C, D and E in parallel, under
  region ownership.
  G starts drafting at the same time and merges last.
- Strict fallback (one owner per file): 0 → B → C → E → D in sequence for `routes.ts` and `storage.ts`, with A, F and G
  in parallel throughout. B goes first because it closes the largest live gap. C follows, then E, because C's lock
  reads E-region data only through Track 0 resolvers. D goes last because it reads everyone's rules.
- The only cross-track call that crosses regions is C8, and its signatures are frozen.

## Data Boundary And Security

These are the gaps that exist today, at `71c4782`, in production.

| Gap | Real today? | Who can reach it | What it writes or reads | Closed by |
| --- | --- | --- | --- | --- |
| Course skip (finding 1) | **Yes.** | Any teacher, from the dashboard button, at 0%. | Writes a `teacher_course_completion` row marked `completed`. That row unlocks the next course, counts on the academy path, earns a medal, and is what the bulk certificate route reads. | C (refusal), D (certificates recompute), D10 (report on old rows) |
| Client-sent quiz answers (finding 2) | **Yes.** | Any signed-in teacher, with a hand-made request, for any module, even outside their cohorts (N3). | Writes a passing attempt and `completed` progress for the file, then runs completion sync. The answers are also readable before the attempt: module quiz `GET`, assigned quiz `GET`, and the generate route on a cache hit, including unapproved quizzes. | B |
| Teacher-triggered AI generation (N2) | **Yes.** | Any teacher, with a hand-made request. | Pays for an OpenAI draft. With `force`, replaces the trainer's quiz and marks it approved. | B |
| Unowned course edit or delete (finding 6) | **Yes, at the API.** No trainer screen calls it. | Any trainer session. | `DELETE` cascades to modules, completion rows and certificates for that course (`shared/schema.ts:605, 665`). Module, file and quiz edits for any course are also reachable from CourseWeeks by id. | E (courses), B (modules, files, quizzes) |
| Start-up account deletion | **Yes, as a standing hazard.** It runs on every cold start. Today it finds only rows the one-time prune marked, so the next run deletes nothing new unless someone marks a desk inactive. | Any deploy or cold start, and any local start with `.env`. | Hard-deletes users and teachers, and the rows keyed on them. | F |
| Two identities in one session (N1) | **Yes.** | Anyone who signs in as a teacher without logging out a staff session on the same browser, or the reverse. | Not an escalation across people: both identities belong to whoever signed in. But a shared classroom browser can hand a trainer session to the next teacher. | A |
| Cross-cohort reads (N4, N6) | **Yes.** | Teachers: module content and discussions by id. Trainers: any cohort's certificates. | Reads only. | C, D |

Access-control changes, including ones that grant nothing new:
- Trainers lose: course `PATCH`/`DELETE`, course assign, edits to modules, files and quizzes outside their cohorts'
  courses, reads of other cohorts' certificates, and cohorts they reached only through `created_by` (D8).
- Trainers gain: quiz approval on their own cohorts' courses, from their own screen. The server already allows it
  everywhere today, so the change narrows it (D5).
- Teachers lose: AI generation, unapproved quizzes, answers before submitting, quizzes and content for courses outside
  their open cohorts, and the course skip.
- Admins: unchanged, except that certificate issue now refuses an incomplete course.

The enforcement point for each rule is the Express route. Client gates (`canCheckComplete`, module locks, the hidden
Delete button) mirror it and are never the only check. See `docs/_learnings/a-signed-in-check-is-not-a-write-gate.md`
and `docs/_learnings/a-client-lock-that-mirrors-one-server-rule-fires-the-others-writes.md`.

Existing helpers reused by this plan, checked against the findings above (checklist 2):
- `trainerOwnsBatch` and `staffCanAccessBatch`: reused, but D8 narrows their rule first (Track 0).
- `teacherRecordAllowed`: reused for certificate reads. It loops `getAllBatches(trainerId)`, so it follows C4.
- `teacherMayTakeQuiz`: **not safe as is.** It allows an empty list (N3); B changes it.
- `moduleIsComplete`, `isCourseComplete`, `scoreQuizSubmission`: reused as the C2 home after Track 0 changes them.
- `blockAssignedQuiz`, `passMarkOf`: reused unchanged.

## Migrations

Under the recommended decisions, **no schema change.** No column, table or constraint is added. Each alternative
that needs one is named here so the engineer sees the cost:
- D2 alternative: `courses.created_by varchar references users(id)`.
- D9 alternative: `batch_teachers.source varchar not null default 'trainer'`, with a CHECK on (`step`, `trainer`).

If either is chosen, its files go in `migrations/lms-flow-fixes/` in the migrations skill's file set (preflight, up,
down, postflight). Agents write them; the engineer applies them in the Neon SQL editor. The up runs **before** the
deploy that reads the column. `server/schemaGuard.ts` adds any column `shared/schema.ts` names at start-up, so a deploy
that names the column also creates it, without the CHECK or backfill. The migration must therefore run first and be
idempotent.

D10 (Track C) writes `migrations/lms-flow-fixes/completion-rule-report.preflight.sql`, which is read-only: it lists
`teacher_course_completion` rows marked `completed` that fail the rule. The optional
`completion-rule-repair.apply.sql` is written and **not applied**. Both are checked with
`node scripts/database/check-sql-catalog-qualification.mjs migrations/lms-flow-fixes`.

### Phase 0: read-only probe (the engineer runs it; ships no code)

Run in the Neon SQL editor before phase 2 starts. This plan did not run these queries. Record the results here with
the date.

```sql
-- Q1. Completion rows marked complete that the stored counts do not support (impact of finding 1; D10)
SELECT count(*) FROM public.teacher_course_completion
WHERE status = 'completed' AND (total_weeks = 0 OR completed_weeks < total_weeks);

-- Q2. Quiz approval state today (D5)
SELECT approved, count(*) FROM public.quiz_cache GROUP BY approved;

-- Q3. Lesson files with no approved quiz (impact of D6)
SELECT count(*) FROM public.training_weeks w
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(w.deck_files, '[]'::jsonb)) AS f(file)
WHERE NOT EXISTS (
  SELECT 1 FROM public.quiz_cache q
  WHERE q.week_id = w.id AND q.deck_file_id = f.file->>'id' AND q.approved
);

-- Q4. Cohorts a trainer reaches only through created_by (D8; findings 15, 16)
SELECT b.id, b.name, u.username FROM public.batches b
JOIN public.users u ON u.id = b.created_by AND u.role = 'trainer'
WHERE b.trainer_id IS DISTINCT FROM b.created_by
  AND NOT EXISTS (SELECT 1 FROM public.cohort_trainers ct WHERE ct.cohort_id = b.id AND ct.trainer_id = b.created_by);

-- Q5. Inactive desks now, and the one-time prune flag (D7)
SELECT role, count(*) FROM public.users WHERE approval_status = 'inactive' GROUP BY role;
SELECT count(*) FROM public.teachers WHERE approval_status = 'inactive';
SELECT key, value, created_at FROM public.app_flags WHERE key = 'desk_roster_v2';

-- Q6. Sessions holding both a staff user and a teacher (N1)
SELECT count(*) FROM public.sessions
WHERE sess ? 'passport' AND sess->'passport' ? 'user' AND sess ? 'teacherId';

-- Q7. Cohort and step names that use the other level's word (finding 4)
SELECT 'cohort' AS level, name FROM public.batches WHERE name ~* '^(batch|week)'
UNION ALL SELECT 'step', name FROM public.cohort_batches WHERE name ~* '^(cohort|week)';

-- Q8. Teachers enrolled in a cohort with no assigned trainer (finding 16)
SELECT b.id, b.name, count(bt.teacher_id) AS teachers FROM public.batches b
JOIN public.batch_teachers bt ON bt.batch_id = b.id
WHERE b.trainer_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.cohort_trainers ct WHERE ct.cohort_id = b.id)
GROUP BY b.id, b.name;
```

How the results change the plan: if Q4 is not empty, the D8 recommendation waits on those assignments. If Q3 is
large, D6's recommendation matters more than its alternative. A large Q1 sharpens D10. If Q6 is not empty, A's deploy
leaves those sessions as they are until they log out; clearing them is an engineer's call, because it signs everyone
out.

## Test Plan

Tests planned for phase 2, per track, are listed under *Task Boundaries → Tracks*. Across all of them:
- New tests live in `tests/unit/<area>/` and run under `node scripts/run-node-tests.mjs unit`. The older
  `tests/*.test.ts` files that a track changes stay in the `test` script list.
- Route handlers call `storage` and `db` directly, so none can be driven yet
  (`skills/test-skill/references/this-repository.md`). Each track therefore puts the rule in a pure or injected function
  the route calls, and tests that function with rows in memory. A text contract only proves the route calls the
  function, and says so. A fake `storage` module for handler tests is cut (see *Cut*).
- Every refusal test is run once with its check removed, and must fail (checklist 7;
  `docs/_learnings/a-refusal-test-that-passes-when-the-refusal-is-gone.md`). The worker reports that it did this.
- Text contracts match line breaks with `\r?\n`.
- No test touches the database, loads `.env` or starts the server.
- Workers run their focused tests and `npm run typecheck`. The baseline is 46 errors in app code, so a worker reports
  the count before and after and adds none. The orchestrator runs the full `npm test`, `npm run typecheck` and
  `npm run build` once on `feat/improvements` after G merges. The build is needed because the client and server
  bundles change.

Not covered by any automated test, and checked at acceptance instead: the browser session cases (A); what each
desk shows after each action; behaviour against live rows.

## Rollout Plan

- **Branches.** Every track branches from `feat/improvements` (after Track 0 has merged, for B to E and G) and
  merges back into it. `main` stays production. It takes one merge of `feat/improvements` only after the steering
  engineer says go.
- **Order on `feat/improvements`.** Track 0, A and F as they finish. Then B, C, D and E in any order. Then G. Then
  the orchestrator's full suite, typecheck and build.
- **Deploy order.** One service, one database, no staging. Under the recommended decisions there is no migration, so
  the order is:
  1. The engineer runs Phase 0 on the Neon branch and records the results. Track H has already shipped on its own
     go-ahead.
  2. The orchestrator runs the full acceptance list on the Neon branch (amendment 2).
  3. No migration is needed under the approved decisions.
  4. With the engineer's go-ahead, merge `feat/improvements` into `main`, and Vercel deploys.
  5. The read-only smoke check on production (below).
- **What users notice at deploy.** The pass mark moves to 80% (D3). The skip button shows only when a course is
  done. Lesson files with no approved quiz can be completed by reading them (D6). AI drafts wait for approval (D5), so
  a file uploaded after deploy has no quiz until someone approves one. Teachers with a mixed session sign in again
  only when they next log out (A). Inactive desks stop disappearing (D7).
- **Version skew.** For a few minutes, browsers can run the old bundle against the new server. The old
  `FileQuizDialog` sends `{ questions, answers }`; the new server ignores `questions` and scores the same cached quiz,
  so the result is the same. The old dashboard may show the skip button; the server refuses it with a sentence. The
  old trainer desk may show Delete, which already fails today.
- **Rollback.** Revert the merge on `main` and redeploy. There is no schema change, so reverting the code is a full
  rollback of behaviour. Rows written in the meantime (attempts, completion rows, approvals) stay, and they are valid
  under both versions.
- **Start-up writes during rollout.** Every cold start still runs `ensureAllTestLogins` (the test-login reset stays).
  Until F is deployed, `removeInactiveDesks` still runs.

## Risks And Guardrails

- The pass mark change is felt by teachers mid-course. Mitigation: the engineer decides D3 knowingly, and the guide and
  dialog say the number.
- D5 makes a new lesson file quiz-less until approved. With D6, teachers are not blocked, but they skip the quiz.
  Mitigation: the trainer desk lists files waiting for approval.
- Region ownership of `routes.ts` and `storage.ts` can still conflict at the hot spots. Mitigation: the orchestrator
  merges one track at a time and runs that track's focused tests after each merge, or uses the strict fallback order.
- Recomputing completion on every `complete` and certificate request adds queries per module. Today the counts are
  tens of modules per course, so this is acceptable. If it is not, cache per request, not across requests.
- D8 can hide a cohort from a trainer who reached it through `created_by`. Mitigation: Phase 0 Q4 first.

## Hazards From docs/_learnings

- `one-rule-many-layers.md`: each rule here has several copies. The pass mark has five (`progressLogic.ts:133`,
  `routes.ts:1877`, `:3225`, `:3281`, `FileQuizDialog.tsx:457, 673`). Completion has five (`moduleIsComplete`,
  `isCourseComplete`, `syncTeacherCourseCompletion`, the inline percentages in `assigned-weeks` and the content route,
  and `courseCompleted` in `academyPathRoutes.ts:131`). Trainer scope has four (`access.ts`, the `getAllBatches` SQL,
  `routes.ts:4413`, `routes.ts:4567`). Track 0 collapses each into one home, and each track greps for the old copies
  before it calls a rule fixed.
- `a-signed-in-check-is-not-a-write-gate.md`: `isTrainer` and `isAuthenticatedAny` are role checks, not scope checks.
  Every write route in B, C, D and E names the row that ties the id to the caller (C5).
- `a-client-lock-that-mirrors-one-server-rule-fires-the-others-writes.md`: the dashboard's `canCheckComplete` and
  module locks mirror the server, and the server content route mirrored only part of the rule (N4). The server
  enforces all of it, and the client only reads server flags.
- `a-count-made-in-the-ui-from-a-projection-cannot-match-the-servers.md`: findings 15 and 22, and the dashboard's
  `courseChecked ? 100 : percent`. The server sends the number, and the page draws it.
- `an-approval-the-model-can-write-is-not-an-approval.md`: AI drafts saved `approved: true` (D5).
- `a-promise-on-a-consent-screen-outlives-the-code-that-made-it.md`: "Inactive desks stay folded below" against
  start-up deletion (D7), and "Your trainer can reply here" (D11).
- `a-documented-entry-point-can-be-unreachable.md`: findings 21 and 24.
- `a-refusal-test-that-passes-when-the-refusal-is-gone.md` and `a-test-that-reads-source-as-text-cannot-guard-a-move.md`:
  see *Test Plan*.
- `newline-anchored-matching-fails-only-on-windows.md` and `a-docs-only-change-can-fail-the-suite.md`: G's guide edits
  and every text contract.
- `removing-a-worktree-follows-its-links-into-the-main-checkout.md`: workers that link `node_modules` unlink it before
  the worktree is removed.

## Acceptance Criteria

Amendment 2: the full list below runs **on a Neon branch of production** (`.env.design`, the local app on port 5001),
on `feat/improvements` after G merges, before the merge into `main`. After deploy, production gets only a read-only
smoke check: each desk loads for the three test logins, `GET .../quiz` as a teacher has no `correctAnswer`, and the
skip button is absent on a course at 0%. No forged request or certificate issue runs on production.

With the test logins (admin, `trainer1`, `teacher@test.com`). Each check is read from the row, not from the screen:
- Teacher on a course at 0%: no skip button. A hand-made `POST .../complete` returns 400 `COURSE_INCOMPLETE`, and no
  `teacher_course_completion` row is marked `completed`.
- Teacher posts a forged module-quiz body with every answer "correct": the attempt row's score matches the cached quiz,
  not the body. `GET .../quiz` has no `correctAnswer` anywhere in the response.
- Teacher calls generate: 403, and no new `quiz_cache` row.
- `trainer1` sends `PATCH /api/courses/:id`: 403, and the course row is unchanged. `trainer1` approves a quiz on a
  course placed on their cohort: 200, and the row has `approved = true`.
- Admin saves a step's teachers: a teacher `trainer1` added by hand is still in `batch_teachers`.
- People, the trainer desk and Analytics show the same cohort count for `trainer1`.
- Sign in as trainer, then as teacher on the same browser, without logging out: the teacher desk shows, and
  `/api/user` answers with the teacher. Log out, press Back: the sign-in page stays.
- After a cold start, Phase 0 Q5's counts have not dropped.
- An admin issues a course certificate for a teacher who has not finished: refused with a sentence, and no
  `teacher_certificates` row.

Acceptance writes rows for `teacher@test.com` on the Neon branch only. The branch is discarded afterwards.

## Simplest Design And What Was Cut

The design adds three small files (`shared/constants.ts`, `server/completion.ts`, `server/scope.ts`), each justified
under *Shared Contracts*. It adds no table, column, service, queue, flag or dependency. Everything else edits routes
and pages that exist. Cut, and why that is safe:
- **Table renames** (D1-C). The UI words carry the model, and the mapping is written once. Nothing reads table names
  except code.
- **`courses.created_by`** (D2 alternative). Scope comes from placements, which already exist.
- **`batch_teachers.source`** (D9 alternative). Enrolment only grows on a step save, and removal stays explicit.
- **Automatic certificates** (D4 alternative). Admins issue today. The server check removes the risk that made
  automation attractive.
- **A trainer discussion view** (D11 alternative). The copy is made true instead. Future improvement.
- **A repair of historical completion rows** (D10). The rows no longer earn anything, and the report keeps the choice
  with the engineer.
- **Splitting `routes.ts` into modules.** Region ownership gets the parallelism without an unrelated refactor.
- **A fake `storage` for route-handler tests.** The rules move into functions the routes call, and those are tested.
  The wiring is guarded by text contracts, with that limit stated.
- **The legacy staff week quiz** (`routes.ts:1813, 1858`). Staff only, and no teacher can reach it.
- **A feature flag for the new rules.** One deploy, no staging, and a clean code rollback. A flag would have to cover
  four tracks' rules at once, and would ship the old gaps while off.

## Out Of Scope

Design feedback (its own track); analytics screens other than the counts in finding 15; a trainer Courses screen;
bulk changes to cohort or step names (Q7 lists them for the admin to rename in the UI); `/api/emergency-admin-reset`
on the server (it already refuses; G removes only its page).

## Future Improvements

- A trainer view of module discussions with replies (D11 alternative).
- An explicit, consent-gated admin action to delete inactive desks (D7).
- Route-handler tests over a fake `storage` module, which would let the text contracts go.
- Retiring `pruneExtraDesksOnce` and its `app_flags` row once nobody needs the history.

## Assumptions

- The guides are the product's intent where they agree with each other. Where they disagree with each other (who
  creates courses), D2 decides.
- Live counts (findings 15 and 16) behave as the code says. Phase 0 checks this.
- No other client (no mobile app, no script) calls the routes this plan deletes. Greps of `client/src`, `scripts/`
  and `server/` (outside `routes.ts`) found no caller of the teacher content quiz routes, course assign, or the bulk
  certificate route other than the pages named here. Vercel request logs were not checked.
- `feat/improvements` gains no code commits in these files before the tracks branch. If it does, Track 0 re-checks the
  line anchors.

## What This Plan's Guards Do Not Cover (checklist 12)

- Route wiring is proven by text contracts, not by driving the handler. A route that calls the right function with a
  wrong id would pass.
- Q6 sessions with two identities stay until they log out. A does not clear them.
- Rows written by the skip before deploy stay `completed` (D10). They unlock the next course for that teacher, but they
  no longer earn a certificate.
- `GET /api/courses/:courseId/weeks` and `GET /api/courses/:id` remain readable by any staff, for any course
  (draft-aware). That is accepted as staff-wide read.
- `/api/files/proxy`, `/convert-to-html`, `/convert-to-pdf` and `/objects/*` were not reviewed for scope. They are
  outside these findings, but they serve lesson files.
- Analytics routes outside finding 15 were not re-checked for the D8 rule.
