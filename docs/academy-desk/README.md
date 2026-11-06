# Academy desk: Fellow and Trainer kinds, Trainer-registered Fellows, timetable and academy year

How people get in, what kinds of Fellow and Trainer there are, and how sessions and the academy year reach each desk.
Everything here is shipped unless a section says **Not built**.

## What it does

| Part | Behaviour |
| --- | --- |
| Sign-in after a request | A request, an Admin's approval, then the person creates their own password. They sign in with the username, email or Fellow ID they gave, in any capitals. |
| Kinds of Fellow | **In-house** (learns at Talent Academy) and **pre-service** (comes for two or three weeks of assessments). Both see every lesson, quiz and assessment. The kind only labels the person. |
| Kinds of Trainer | **In-house** (as before) and **instructional** (visits to teach). Only an instructional Trainer, or an Admin, can attach a meeting link, a video link or a materials link to a session. Instructional Trainers have **Live sessions** on their menu (Live now, Coming up, Past, and Schedule a live session); an in-house Trainer who opens it by address is told it is for instructional Trainers. The kind shows as a chip beside each person on People (Fellows and Trainers, with a Kind filter) and on your own Account settings. |
| Trainers register Fellows | Trainer desk, **Fellows**. The Fellow is approved at once, optionally enrolled in one of the Trainer's cohorts, and creates their own password at sign-in. The Trainer never sets one. |
| Timetable | Sessions show on **Calendar / Schedule → Schedule** for every desk: Admin sees all cohorts, a Trainer the cohorts they teach, a Fellow the cohorts they are in. Admin and Trainers **Schedule a session**, **Edit** and **Remove** there (a Trainer only in their cohorts). The Trainer's menu has no separate **Schedule** item. An in-house Trainer who edits a session keeps its links as they are. |
| Live sessions | From 15 minutes before a session starts until it ends (two hours when it has no end), a session with a meeting link shows **Live now · Join** on the Calendar and the Fellow's Home. After it ends, a video link reads **Watch the recording**. Home's **Coming up** lists only sessions not yet over. |
| Academy year | **Calendar / Schedule → Academy calendar**. Admin adds terms, holidays, training, assessments, events and deadlines. The Admin's new entries are **drafts** only the Admin sees, marked Draft; **Done — show to Trainers and Fellows** publishes every draft at once, and only the Admin can press it. Entries that existed before drafts were added stay published. Editing a published entry keeps it published. The Admin may let a Trainer add entries (**May add to the academy calendar** on the Trainer's page). That Trainer's entries publish at once, and they can edit or remove only the entries they created; the Admin can change any entry. The server enforces this and the page only hides the controls. |
| Sharing an assessment | The "Who sits this" picker (Trainer Assessments page and the cohort room) names Fellows of the cohort. Only those Fellows see the assessment on **Work** and only they can answer it. Leaving every box empty gives it to the whole cohort. Every list of quizzes, exams and assessments (Trainer, cohort room, Admin cohort page) prints **Given to** with the names, or Whole cohort. |
| Marking | **Mark submissions** on each assessment of the Trainer's Assessments page opens its marking in the cohort room. Marking lists everyone who sits it: submitted answers first, with the time, then **Not submitted yet**. A Trainer can only read or mark an assessment through its own cohort. |
| Deadlines | Once a deadline passes, a quiz, exam or assessment stays on the Fellow's **Assessments** page under **Closed**, with what it was and its deadline, but there is no way to sit it or hand it in: answers are refused (410 "The deadline has passed"). A closed item never tried or handed in carries no questions, paper or file. Work already tried or handed in stays readable, so the Fellow keeps their mark. A Fellow's deadline is their own reopened date when they have one, otherwise the item's. |
| Reopening | **Reopen** on each quiz, exam and assessment, for the Admin or a Trainer of that cohort. **One Fellow** gets their own new deadline (`deadline_reopenings`) and nobody else is affected; **Everyone who sits it** moves the item's own date, which also clears any earlier personal dates. The new deadline must be in the future. |
| Materials | Cohort room, **Materials**. The Admin or a Trainer of that cohort shares a file or link with the whole cohort or ticked Fellows (`shared_materials`). A Fellow sees only what reaches them, on **Learning**, and never who else was named. Materials have no submission or mark. Courses still go to a whole cohort. |
| Admin mail | **Messages** on the Admin desk: private desk mail with any approved Trainer or Fellow. A Trainer or Fellow finds the Admin's thread in their own Messages once the Admin has written. |
| Attendance export | **Download CSV** and **Download PDF** on the Admin's Attendance page and the Trainer's. The CSV is the full register; the PDF is the browser printing the page. A Trainer can download only cohorts they teach. Spreadsheet formulas in any value are neutralised. |
| Daily line | One line a day for each person, by role, on Admin, Trainer and Fellow Home. Written in advance (`DAILY_LINES`), never repeated for anyone (`trainer_encouragements`, unique on the words), changing at midnight in Dar es Salaam. |
| Trainer courses | Trainer desk → **Courses**. Any Trainer makes a course, opens it to add modules and files, and puts it on a cohort they teach (on its last step, or a first step made for it). A Trainer edits a course they made or one on their cohorts; only the Admin deletes one. |
| Uploads | With `BLOB_READ_WRITE_TOKEN` set, files go from the browser straight to Vercel Blob (documents, slides, images, audio, video; up to 500 MB). A video in Blob plays from Blob. Without the token the old path (through the server, about 4.5 MB on Vercel) is used. |
| Figures | Admin Home: Fellows by kind, Trainers by kind, sessions in the next 7 days (and how many online), written answers to mark. Trainer **This term**: Assessments (paper exams and uploaded assessments), To mark, Sessions coming up. Admin Analytics: participation is Fellows active in the last 30 days; enrolled is approved Fellows on a cohort; a cohort nobody has started is not 0% or at risk. |

| Admin cohort page | Shows Trainers, Fellows and **Courses in order**. The Fellows listed are the cohort's own roster (`batch_teachers`), so Fellows a Trainer registered or enrolled appear; **Manage the roster** ticks Fellows in and out of the cohort (progress is kept). A cohort's first course starts its first part automatically; parts (steps) are under **Split into parts (advanced)**. |

## Demo academy

`scripts/demo-academy.ts seed` builds a Demo academy over HTTP through the app's own routes. It creates accounts
(Admin, an instructional and an in-house Trainer, two in-house and two pre-service Fellows), a Demo cohort, two
courses with video lessons, sessions, the academy year (published with Done), assessments, a quiz and a written exam.
Then it does the work as each Fellow and marks it as the Trainer. Every name starts with "Demo"; every email is
`demo.…@example.com`. The password is written to `demo-accounts.local.md`, which git ignores. `remove` deletes the
Demo cohort, courses and academy-year rows and makes the demo people inactive, so their emails stay taken; a rerun
sets `DEMO_EMAIL_TAG`. Seeded on the live site on 2026-10-29 (60 of 60 steps).

## Rules worth knowing

- A kind is chosen on the request form and changed afterwards by an Admin (Trainer or Fellow page) or, for a Fellow,
  by a Trainer who teaches them. A Fellow kind on a Trainer, or the reverse, is refused.
- Session links must start with `http://` or `https://`. Anything else is refused, so a session can never carry a
  script address.
- A Trainer may schedule, list and remove sessions only in a cohort they teach.
- Session times travel as an instant (the browser's zone is applied before sending). Academy-year entries are whole days
  (UTC midnight, printed in UTC).
- Roster and Fellow lists never send a password hash.
- A Trainer acts only on their own cohorts and Fellows (since 2026-10-29). This covers: resetting a Fellow's password,
  comments, attendance (only Fellows enrolled in that cohort), announcements, disqualifying, and marking open quiz
  answers (the attempt names the Fellow and quiz, not the request). Desk mail goes from a Fellow to staff, or from a
  Trainer to staff or their own Fellows.
- Removing a Fellow or a Trainer makes the desk inactive; it never deletes the row (a delete cascaded through cohorts,
  exams, marks and certificates).

## Files

| Area | Files |
| --- | --- |
| Shared rules (kinds, link and calendar checks, who may write the calendar, month grouping) | `shared/academyPeople.ts`, `shared/accessRequest.ts` |
| Tables | `shared/schema.ts`: `users.trainer_type`, `users.can_edit_calendar`, `teachers.fellow_type`, `scheduled_events.meeting_url / video_url / materials_url`, `academy_calendar` (`published_at`), `written_assignment_teachers`, `courses.created_by` |
| Shared rules (round 2) | `shared/academyPath.ts` (`isPastDue`, `effectiveDeadline`, `fellowDeadline`, `closedQuizItem`, `closedAssignmentItem`), `shared/academyPeople.ts` (audience names, `assignmentRoster`, `sessionPhase`, `countKinds`), `shared/uploads.ts` (Blob URLs, upload types and size), `shared/trainerDesk.ts` |
| Pages (round 2) | `client/src/pages/trainer-courses.tsx`, `client/src/components/SessionDialog.tsx`, `client/src/components/SessionLinks.tsx`, `client/src/components/ObjectUploader.tsx` (direct uploads), `teacher-dashboard.tsx`, `teacher-exam.tsx`, `cohort-workspace.tsx`, `admin-home.tsx`, `admin-analytics.tsx` |
| Routes | `server/academyPathRoutes.ts` (cohort roster, `fellows` on each cohort), `server/academyDesk.ts` (register Fellows, kinds, calendar rights, academy year, timetable); `server/routes.ts` (sessions, assessments, roster); `server/auth.ts`, `server/accessRequests.ts` (sign-in) |
| Routes (SLA fixes) | `server/deadlineRoutes.ts`, `server/materialRoutes.ts`, `server/adminMailRoutes.ts`, `server/attendanceExportRoutes.ts`, `server/dailyLineRoutes.ts`, sharing `server/routeGuards.ts` |
| Pages (SLA fixes) | `client/src/pages/admin-messages.tsx`, `client/src/pages/trainer-live-sessions.tsx`, `client/src/components/ReopenDialog.tsx`, `client/src/components/KindBadge.tsx`, `client/src/components/DailyLine.tsx`, `client/src/components/DeskPhoto.tsx`, `client/src/components/CourseProgressChart.tsx`, `client/src/components/deskSections.ts`, `client/src/lib/fellowDesk.ts`, `client/src/components/trainerDeskRules.ts` |
| Storage | `server/storage.ts` (assessment audience, `teacherCanSeeAssignment`) |
| Pages | `client/src/pages/admin-batches.tsx` (cohort page), `client/src/pages/trainer-fellows.tsx`, `client/src/pages/academy-calendar.tsx`, `client/src/pages/trainer-batches.tsx` (Schedule dialog, assessment picker), `client/src/pages/unified-auth.tsx`, `admin-trainer-detail.tsx`, `admin-teacher-detail.tsx` |
| Menus | `client/src/components/deskMenu.ts` (Fellows on the Trainer menu; Calendar / Schedule on all three) |

New tables and columns are created at server start by `server/schemaGuard.ts` (additive; existing rows take the defaults).

Boundaries: cohorts, steps and courses stay in the academy path (`server/academyPathRoutes.ts`); attendance and
certificates are untouched. Quizzes already had an audience (`assigned_quiz_teachers`) and still use it.

## Not built

- A proctored or timed online exam sitting: see `plans/sla-feedback-fixes/online-exam-platform-research.md`.
- A course given to only some of a cohort's Fellows: use **Materials**, or see `tasks/prioritised/replace-steps-with-reusable-curriculums.md`.
- Creating a Google Meet from inside the app. An instructional Trainer pastes the Meet link; the app shows **Live now · Join**.
- Uploading a recording from the session form. A video is uploaded to a course module, or its link is pasted on the session.
- A week-by-week view of sessions. The Trainer's **Schedule** menu item, which opened one, is gone; the same sessions and deadlines are on **Calendar / Schedule → Schedule**, as a list grouped by month. Of sessions older than two weeks, **Show past sessions** lists the newest 200.
- Email to a Fellow a Trainer registered. The Trainer tells them to open Sign in, choose Fellow, and create a password.
- A month-grid view of the calendar. It is a dated list grouped by month.
- Narrowing pre-service Fellows to assessments only. Both kinds see everything, as asked.
- Simplifying cohorts, steps and courses beyond the Admin page (the Trainer's cohort room, the Fellow's path and Analytics still say "step"; the data model is unchanged): filed as `tasks/prioritised/replace-steps-with-reusable-curriculums.md`.

## See also

- [workflow-walkthrough.md](workflow-walkthrough.md): the end-to-end run and how to repeat it.
- [test-suite.md](test-suite.md): what the tests cover.
- `docs/_learnings/a-sign-in-lookup-that-skips-the-field-the-form-collected-locks-people-out.md`
- `docs/_learnings/a-datetime-local-value-sent-raw-is-read-in-the-servers-time-zone.md`
