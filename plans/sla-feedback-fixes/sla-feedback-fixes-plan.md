# SLA Feedback Fixes Plan

## Status

**Implemented — 2026-11-06.** Working branch `feat/curriculum-branches`, base `85d68b9`. Workers ran as background subagents, because the steering engineer left the orchestrator in charge. Not merged to `main`, not deployed. Deploying applies `users.can_edit_calendar`, `deadline_reopenings`, `shared_materials` and a unique index to the live database at server start.

Verification, on a local Postgres with no `.env`: `scripts/workflow-walkthrough.ts` 157 of 157; `npm test`, `npm run typecheck` (28 errors, baseline 29) and `npm run build` on the final tree; a browser run of the Admin, Trainer and Fellow desks, covering closed work, Reopen, materials, Admin mail, kinds, certificates on screen, the month calendar and the date picker, at desktop and phone widths and in dark mode.

**Not run:** a real Blob upload (needs the live token); the print dialog's PDF output; Excel opening a CSV; item 4, which waits on the steering engineer.

Added during the work, at the steering engineer's request: a month-grid calendar and one themed date and time picker (task T4).

Deviations and additions:
- **Items found by workers and fixed, though outside the plan:** an unguarded read of any quiz at `/attempts`; attendance reads with no cohort check; unvalidated file addresses on assignments and paper exams; `staffCanAccessBatch` passing staff when a cohort is missing; a Fellow unable to open their own certificate; a path traversal at `/api/local-objects/:id`; missing CSV formula guards.
- **T1-B:** moving an item's own date also deletes earlier personal deadlines, so "reopen for everyone" reaches them. Not in the contract; decided by the orchestrator, because the notice would otherwise tell a Fellow a date that does not apply to them.
- **T2-F:** `safeFileHref` also allows `http://`, matching `safeLink`.
- **T2-N:** removed one notice (a failed-quiz streak told a Fellow about their own action); the rest kept, some reworded. Trainers still cannot issue certificates: `tasks/unprioritised/decide-who-issues-and-edits-certificates.md`.

Decisions taken by the steering engineer, 2026-11-06 ("proceed as recommended"):

- D1. Colours: follow the feedback: Silverleaf blue and yellow, no green. The recommendation was conditional on the recording's date, which nobody has stated. Item 20 was on the approved list, so the feedback wins.
- D2. After a deadline: the item and its deadline stay visible to the Fellow; only the way to submit goes. Supersedes the 2026-10-29 "work disappears" decision.
- D3. Pictures: a few photos on Home and sign-in only. No emojis: the recommendation did not include them.
- D4. Pre-service Fellows: keep as shipped (both kinds see everything); what they get is decided by assignment.
- D5. Daily quotes: extend the existing approach to all three roles, with lines written in advance. No live model call.
- D6. The big cohort change is shelved: `tasks/prioritised/replace-steps-with-reusable-curriculums.md`.

Questions with no recommendation, so no change is made: **Reflect stays as it is**, and **the trainer home page fix (item 4) waits** for the steering engineer to say what it was. Item 5 is done.

## Objective

Ship the fixes from the SLA feedback. Source: `docs/Talent_Academy_SLA_transcript_EN.md`, 00:00–12:22, checked against the code at `85d68b9`.

## Methodology

Instruction file: `.claude/CLAUDE.md`. Read `docs/academy-desk/README.md`, `plans/academy-desk/academy-desk-round-2-plan.md`, `design/DESIGN-BRIEF.md`, the plan, orchestration and test skills, and the code named below. No live data was read: `.env` is the live database and is off limits.

## Baseline Findings

- Deadlines: `fellowStillSees` hides unsubmitted past-due work (`shared/academyPath.ts:122`; used at `server/routes.ts` `/api/teacher/quizzes`, `/api/teacher/assignments`, and `client/src/pages/teacher-dashboard.tsx`). Answers are refused with 410 at `/api/assigned-quizzes/:quizId/submit` and `/api/teacher/assignments/:assignmentId/submit`.
- The theme lives in tokens: `--sl-*` and the shadcn variables in `client/src/index.css`. The blue values from before commit `2daf68c` are in git. Direct green classes are few.
- The logo at `attached_assets/Screenshot 2025-10-14 214034_1761029433045.png` is byte-identical to `design/assets/silverleaf-logo.png`, so it is the real logo under a poor file name, not a wrong image.
- Academy calendar writes are `isAdmin` only (`server/academyDesk.ts:264-304`). `server/schemaGuard.ts` derives tables and columns from `shared/schema.ts`, so schema additions apply at start-up.
- Desk mail exists (`/api/desk-messages`, `client/src/components/DeskMail.tsx`, `TrainerMessages.tsx`), but no Admin page uses it.
- `/api/user` returns `trainerType` and `fellowType` already (`server/auth.ts:360`).
- `trainer_encouragements` holds one line per person per day with a unique message; it has no foreign key, so Fellow and Admin ids fit.
- Local Postgres (scoop) and Docker exist on this machine, so a throwaway database needs no Neon project.

## Scope

In: items 1, 2, 3, 6 (local path), 7 (materials), 8, 9, 10, 11 (research only), 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22.

Out: item 4 (waiting), item 5 (done), changing course placement (shelved task), per-session attendance (its own prioritised task), any write to the live database, deploying.

## Shared Contract

This section and the committed files win over any other text here.

**Committed in tranche 0:** `shared/schema.ts` (`users.can_edit_calendar`, `deadline_reopenings`, `shared_materials`), `server/routeGuards.ts`, one empty route module per task, registered in `server/routes.ts`; pages `admin-messages.tsx` and `trainer-live-sessions.tsx`, their routes and menu items; `deskMenuFor`. Task workers fill their own module and do not edit the registration.

### Deadlines and reopening (T1-B owns the server; T2-F and T2-T own the screens)

- A Fellow's effective deadline is their `deadline_reopenings.due_date` when a row exists, otherwise the item's due date. Every check uses it.
- `GET /api/teacher/quizzes` and `GET /api/teacher/assignments` return **every** item assigned to the Fellow, past due or not, each with `closed: boolean` and `dueDate` set to their effective deadline.
- A closed item the Fellow never tried or handed in carries its title, description or instructions and deadline only. It never carries questions, `paperUrl` or `fileUrl`.
- `GET /api/assigned-quizzes/:quizId` and both submit routes keep answering 410 `DEADLINE_PASSED` as today, using the effective deadline.
- `POST /api/deadlines/reopen` with `{ kind: "quiz" | "assignment", itemId, scope: "fellow" | "everyone", teacherId?, dueDate }`. `dueDate` must be in the future. `fellow` upserts a row, and the Fellow must sit that item. `everyone` updates the item's own due date. The Fellow or the cohort gets the existing deadline notice. Admin may act on any item; a Trainer only on items in cohorts they teach, using the same scope helper the deadline edit routes use.
- `GET /api/deadlines/reopenings?kind=&itemId=` returns `[{ teacherId, name, dueDate }]`, same access.

### Calendar rights (T1-C)

- `canEditAcademyCalendar(user)` in `shared/academyPeople.ts`: an Admin, or a Trainer with `canEditCalendar`.
- The Admin grants it: `PATCH /api/admin/trainers/:id/calendar-rights` with `{ canEditCalendar: boolean }`, `isAdmin` only, and a switch on `admin-trainer-detail.tsx`.
- A Trainer with the right may add entries, and edit or remove **only entries they created**. Their entries publish at once. **Done** stays Admin only.
- The same rule is enforced on the server, and the page only hides controls.

### Calendar and schedule naming (T1-C)

- Menu label on all three desks: **Calendar / Schedule**. The page's two tabs: **Schedule** (the timetable of sessions) and **Academy calendar** (the year).
- T1-C removes the Trainer's **Schedule** menu item. T2-T removes the section from `trainer-batches.tsx` and sends `?tab=schedule` to `/calendar`.

### Materials (T1-D owns the server; T2-T and T2-F own the screens)

- `GET` and `POST /api/batches/:batchId/materials`, `DELETE /api/batches/:batchId/materials/:id`: Admin, or a Trainer who teaches that cohort. Body: `{ title, note?, fileUrl?, fileName?, linkUrl?, teacherIds? }`. One of file or link is required; `linkUrl` goes through `safeLink`; every `teacherIds` entry must be in the cohort.
- `GET /api/teacher/materials`: the materials of the Fellow's cohorts where `teacherIds` is empty or names them.

### Admin mail (T1-D)

- `GET /api/admin/desk-peers`: Admin only: `[{ id, name, role }]` for approved Trainers and Fellows.
- The page uses `DeskMail`. A Trainer can read and answer the Admin's messages in their Messages section; T1-D owns `TrainerMessages.tsx` and checks this works.

### Attendance export (T1-E)

- `GET /api/batches/:batchId/attendance.csv` for the Admin or a Trainer who teaches that cohort; `GET /api/admin/attendance.csv` for the Admin. Columns: person, kind, cohort, date, status. Guard against CSV formula injection in names.
- **Download PDF** means the browser's print-to-PDF, as certificates already do, with a print stylesheet. No PDF library.
- `AttendanceExportButtons` in `client/src/components/AttendanceBoard.tsx`, used by `admin-attendance.tsx` and later by T2-T.

### Daily lines (T1-G)

- `DAILY_LINES: { admin, trainer, fellow }` in `shared/encouragement.ts`, written in advance, never mentioning the software, in the voice of the existing lines.
- `GET /api/daily-line` for any signed-in person returns `{ line }`. It reuses `trainer_encouragements`, so a line is never repeated for anyone.
- `client/src/components/DailyLine.tsx` shows it. The Trainer's existing line keeps working.

### Shared Home pieces, placed in tranche 2

| Piece | Built by | Placed by |
|---|---|---|
| `client/src/components/DeskPhoto.tsx` (`desk` prop; decorative, `alt=""`) | T1-A | T2-F Fellow Home, T2-T Trainer and Admin Home |
| `client/src/components/KindBadge.tsx` (reads the signed-in person from `useAuth`) | T1-H | T2-F, T2-T, and `ProfileSettingsDialog` by T1-H |
| `DailyLine` | T1-G | T2-F, T2-T (Admin Home only; Trainer Home has its own line) |

### Fellow menu (T2-F)

Home, Learning, Assessments, Progress, Reflect, Messages, Calendar / Schedule, Certificates. `key: "assessments"`, `?tab=assessments`. `?tab=work`, `?tab=quizzes` and `#my-work` land on it. Phone bar: home, learning, assessments, messages. Work's written work and Quizzes' exams and lesson quizzes become one list under Assessments. Work's calendar panel goes, because the Calendar page holds it.

## Task Boundaries

| Task | Builds | Files it owns | Model | Why |
|---|---|---|---|---|
| T0 (orchestrator) | Plan, contract, shelved task, local database config | as committed | | |
| T1-A | Items 20, 21: blue and yellow tokens in light and dark, no green, `DeskPhoto`, sign-in photo, logo file name | `client/src/index.css`, `tailwind.config.ts`, `client/src/pages/unified-auth.tsx`, `client/src/components/DeskPhoto.tsx`, `client/src/components/AcademyShell.tsx` (logo import only), files with direct green classes except `trainer-batches.tsx`, `teacher-dashboard.tsx`, `cohort-workspace.tsx`, `design/DESIGN-BRIEF.md`, `attached_assets` | Sonnet | Layout and tokens |
| T1-B | Items 9, 10 server | `server/routes.ts`, `server/storage.ts`, `server/deadlineRoutes.ts`, `shared/academyPath.ts`, their tests | Opus | Access checks, what a Fellow may see |
| T1-C | Items 15, 16 | `server/academyDesk.ts`, `shared/academyPeople.ts`, `client/src/pages/academy-calendar.tsx`, `client/src/pages/admin-trainer-detail.tsx`, `client/src/components/deskMenu.ts`, `tests/unit/contract/desk-menu.test.ts` | Opus | Role check |
| T1-D | Items 7 server, 14 | `server/materialRoutes.ts`, `server/adminMailRoutes.ts`, `client/src/pages/admin-messages.tsx`, `client/src/components/TrainerMessages.tsx`, `client/src/components/DeskMail.tsx` | Opus | Role checks, data boundary |
| T1-E | Item 13 | `server/attendanceExportRoutes.ts`, `client/src/components/AttendanceBoard.tsx`, `client/src/pages/admin-attendance.tsx` | Opus | Role checks, SQL |
| T1-F | Item 11 research | `plans/sla-feedback-fixes/online-exam-platform-research.md` | Sonnet | Reading and writing up |
| T1-G | Item 22 | `shared/encouragement.ts`, `server/trainerEncouragement.ts`, `server/dailyLineRoutes.ts`, `client/src/components/DailyLine.tsx` | Sonnet | Follows an existing pattern |
| T1-H | Items 1, 3 | `client/src/components/KindBadge.tsx`, `client/src/pages/admin-teachers.tsx`, `client/src/pages/admin-trainers.tsx`, `client/src/components/ProfileSettingsDialog.tsx`, `client/src/pages/trainer-live-sessions.tsx` | Sonnet | UI over routes the server already guards |
| T2-F (after T1) | Items 8, 9, 7, 12, 17, 18 on the Fellow desk | `client/src/pages/teacher-dashboard.tsx`, `client/src/pages/teacher-exam.tsx`, fellow lines of `deskMenu.ts` and its test | Sonnet | UI gating the server also enforces |
| T2-T (after T1) | Items 7, 8, 10, 12, 13, 15 on the Trainer desk; Home pieces on Trainer and Admin | `client/src/pages/trainer-batches.tsx`, `client/src/pages/cohort-workspace.tsx`, `client/src/pages/admin-home.tsx` | Sonnet | Same |
| T2-N (after T1) | Items 18 notifications, 19 | `server/routes.ts`, `client/src/pages/admin-certificates.tsx`, `client/src/components/NotificationBell.tsx`, `server/storage.ts` | Opus | Certificates |
| T3 (orchestrator) | Item 2, item 6 local path, browser run of all four account types, docs, full suite | `scripts/workflow-walkthrough.ts`, `docs/` | | |

Order: T1 tasks run together. T2 tasks start when T1 is merged, and run together. T3 last.

## Public Interfaces

New columns and tables as above; they apply at server start through `schemaGuard`, so deploying this branch is a production schema write. New routes as above. `GET /api/teacher/quizzes` and `GET /api/teacher/assignments` gain `closed` and now return past-due items.

## Data Boundary And Security

- Access-control changes: Trainers may gain calendar writes when granted; Trainers and the Admin may reopen deadlines; the Admin gains a peer list of all Trainers and Fellows.
- A closed, unattempted item must never send questions or papers. A reopened Fellow's deadline must not reopen it for anyone else.
- Materials are named-Fellow data: a Fellow not named must not receive one, and every read is scoped on the server.

## Test Plan

Each task adds `node:test` files under `tests/unit/<area>/`, proving guards by removal. Tests never load `.env` and never start the server. Existing tests that pin old behaviour (`deadlines.test.ts`, `teacher-desk-split.test.ts`, `desk-menu.test.ts`, `routes-contract.test.ts`) are updated by the task that changes the behaviour.

T3: `npm test`, `npm run typecheck` (baseline 29 errors at `main`, must not grow), `npm run build`, the extended `scripts/workflow-walkthrough.ts`, and a browser run on the local database as each of the four account types.

## Documentation Plan

`docs/academy-desk/README.md`, `test-suite.md`, `docs/guides/{admin,trainer,learner}.md`, `design/DESIGN-BRIEF.md`. A `docs/_learnings` entry for starting a local server from `.env`.

## Rollout Plan

Nothing deploys from this plan. Merging to `main` deploys through Vercel and applies the schema additions to the live database, and needs the steering engineer's go-ahead.

## Risks And Guardrails

- Returning past-due items is a loosening of a read: guarded by the closed-item projection and its test.
- Blue tokens change every screen: contrast is checked in light and dark.
- Removing Trainer **Schedule** could lose the week-by-week view: the Calendar's Schedule tab must show the same sessions.

## Hazards From docs/_learnings

- `a-datetime-local-value-sent-raw-is-read-in-the-servers-time-zone.md`: new reopen and deadline fields send an instant.
- `an-upload-through-a-vercel-function-stops-at-its-body-limit.md`: materials use the existing direct upload.
- `removing-a-worktree-follows-its-links-into-the-main-checkout.md`: workers unlink `node_modules` before finishing.
- `newline-anchored-matching-fails-only-on-windows.md`: text contracts match `\r?\n`.

## Acceptance Criteria

On the local database, signed in as each of the in-house and instructional Trainers and the in-house and pre-service Fellows: each sees their own kind; a Fellow sees a closed item with its deadline and no submit, which then reopens for one Fellow only; a material named for one Fellow reaches only them; Admin mail reaches a Trainer who can answer; a Trainer without the right is refused calendar writes, by the server, and one with it succeeds; no green appears; attendance downloads as CSV and prints to PDF.

## Out Of Scope

Course-level audience (shelved task), emojis, the trainer home page fix, changing Reflect, setting `cohorts_required` on the live database, a real Blob upload (needs the live token, so held for the steering engineer).
