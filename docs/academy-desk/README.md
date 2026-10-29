# Academy desk: Fellow and Trainer kinds, Trainer-registered Fellows, timetable and academy year

How people get in, what kinds of Fellow and Trainer there are, and how sessions and the academy year reach each desk.
Everything here is shipped unless a section says **Not built**.

## What it does

| Part | Behaviour |
| --- | --- |
| Sign-in after a request | A request, an Admin's approval, then the person creates their own password. They sign in with the username, email or Fellow ID they gave, in any capitals. |
| Kinds of Fellow | **In-house** (learns at Talent Academy) and **pre-service** (comes for two or three weeks of assessments). Both see every lesson, quiz and assessment. The kind only labels the person. |
| Kinds of Trainer | **In-house** (as before) and **instructional** (visits to teach). Only an instructional Trainer, or an Admin, can attach a meeting link, a video link or a materials link to a session. |
| Trainers register Fellows | Trainer desk, **Fellows**. The Fellow is approved at once, optionally enrolled in one of the Trainer's cohorts, and creates their own password at sign-in. The Trainer never sets one. |
| Timetable | Sessions show on **Calendar → Timetable** for every desk: Admin sees all cohorts, a Trainer the cohorts they teach, a Fellow the cohorts they are in. Admin and Trainers **Schedule a session**, **Edit** and **Remove** there (a Trainer only in their cohorts); the Trainer's **Schedule** page still adds sessions too. An in-house Trainer who edits a session keeps its links as they are. |
| Live sessions | From 15 minutes before a session starts until it ends (two hours when it has no end), a session with a meeting link shows **Live now · Join** on the Calendar and the Fellow's Home. After it ends, a video link reads **Watch the recording**. Home's **Coming up** lists only sessions not yet over. |
| Academy year | **Calendar → Academy year**. Admin adds terms, holidays, training, assessments, events and deadlines. New entries are **drafts** only the Admin sees, marked Draft; **Done — show to Trainers and Fellows** publishes every draft at once. Entries that existed before drafts were added stay published. Editing a published entry keeps it published. |
| Sharing an assessment | The "Who sits this" picker (Trainer Assessments page and the cohort room) names Fellows of the cohort. Only those Fellows see the assessment on **Work** and only they can answer it. Leaving every box empty gives it to the whole cohort. Every list of quizzes, exams and assessments (Trainer, cohort room, Admin cohort page) prints **Given to** with the names, or Whole cohort. |
| Marking | **Mark submissions** on each assessment of the Trainer's Assessments page opens its marking in the cohort room. Marking lists everyone who sits it: submitted answers first, with the time, then **Not submitted yet**. A Trainer can only read or mark an assessment through its own cohort. |
| Deadlines | Once a deadline passes, the quiz, exam or assessment leaves the Fellow's lists and answers are refused (410 "The deadline has passed"). Work the Fellow already handed in or tried stays, read-only, so they keep their mark and can review their tries. Trainers and Admin still see everything. |
| Trainer courses | Trainer desk → **Courses**. Any Trainer makes a course, opens it to add modules and files, and puts it on a cohort they teach (on its last step, or a first step made for it). A Trainer edits a course they made or one on their cohorts; only the Admin deletes one. |
| Uploads | With `BLOB_READ_WRITE_TOKEN` set, files go from the browser straight to Vercel Blob (documents, slides, images, audio, video; up to 500 MB). A video in Blob plays from Blob. Without the token the old path (through the server, about 4.5 MB on Vercel) is used. |
| Figures | Admin Home: Fellows by kind, Trainers by kind, sessions in the next 7 days (and how many online), written answers to mark. Trainer **This term**: Assessments (paper exams and uploaded assessments), To mark, Sessions coming up. Admin Analytics: participation is Fellows active in the last 30 days; enrolled is approved Fellows on a cohort; a cohort nobody has started is not 0% or at risk. |

| Admin cohort page | Shows Trainers, Fellows and **Courses in order**. The Fellows listed are the cohort's own roster (`batch_teachers`), so Fellows a Trainer registered or enrolled appear; **Manage the roster** ticks Fellows in and out of the cohort (progress is kept). A cohort's first course starts its first part automatically; parts (steps) are under **Split into parts (advanced)**. |

## Rules worth knowing

- A kind is chosen on the request form and changed afterwards by an Admin (Trainer or Fellow page) or, for a Fellow,
  by a Trainer who teaches them. A Fellow kind on a Trainer, or the reverse, is refused.
- Session links must start with `http://` or `https://`. Anything else is refused, so a session can never carry a
  script address.
- A Trainer may schedule, list and remove sessions only in a cohort they teach.
- Session times travel as an instant (the browser's zone is applied before sending). Academy-year entries are whole days
  (UTC midnight, printed in UTC).
- Roster and Fellow lists never send a password hash.

## Files

| Area | Files |
| --- | --- |
| Shared rules (kinds, link and calendar checks, month grouping) | `shared/academyPeople.ts`, `shared/accessRequest.ts` |
| Tables | `shared/schema.ts`: `users.trainer_type`, `teachers.fellow_type`, `scheduled_events.meeting_url / video_url / materials_url`, `academy_calendar` (`published_at`), `written_assignment_teachers`, `courses.created_by` |
| Shared rules (round 2) | `shared/academyPath.ts` (`isPastDue`, `fellowStillSees`), `shared/academyPeople.ts` (audience names, `assignmentRoster`, `sessionPhase`, `countKinds`), `shared/uploads.ts` (Blob URLs, upload types and size), `shared/trainerDesk.ts` |
| Pages (round 2) | `client/src/pages/trainer-courses.tsx`, `client/src/components/SessionDialog.tsx`, `client/src/components/SessionLinks.tsx`, `client/src/components/ObjectUploader.tsx` (direct uploads), `teacher-dashboard.tsx`, `teacher-exam.tsx`, `cohort-workspace.tsx`, `admin-home.tsx`, `admin-analytics.tsx` |
| Routes | `server/academyPathRoutes.ts` (cohort roster, `fellows` on each cohort), `server/academyDesk.ts` (register Fellows, kinds, academy year, timetable); `server/routes.ts` (sessions, assessments, roster); `server/auth.ts`, `server/accessRequests.ts` (sign-in) |
| Storage | `server/storage.ts` (assessment audience, `teacherCanSeeAssignment`) |
| Pages | `client/src/pages/admin-batches.tsx` (cohort page), `client/src/pages/trainer-fellows.tsx`, `client/src/pages/academy-calendar.tsx`, `client/src/pages/trainer-batches.tsx` (Schedule dialog, assessment picker), `client/src/pages/unified-auth.tsx`, `admin-trainer-detail.tsx`, `admin-teacher-detail.tsx` |
| Menus | `client/src/components/deskMenu.ts` (Fellows on the Trainer menu; Calendar on all three) |

New tables and columns are created at server start by `server/schemaGuard.ts` (additive; existing rows take the defaults).

Boundaries: cohorts, steps and courses stay in the academy path (`server/academyPathRoutes.ts`); attendance and
certificates are untouched. Quizzes already had an audience (`assigned_quiz_teachers`) and still use it.

## Not built

- Creating a Google Meet from inside the app. An instructional Trainer pastes the Meet link; the app shows **Live now · Join**.
- Uploading a recording from the session form. A video is uploaded to a course module, or its link is pasted on the session.
- The Trainer's **Schedule** page still has its own add-session dialog and no Edit; editing is on the Calendar.
- Email to a Fellow a Trainer registered. The Trainer tells them to open Sign in, choose Fellow, and create a password.
- A month-grid view of the calendar. It is a dated list grouped by month.
- Narrowing pre-service Fellows to assessments only. Both kinds see everything, as asked.
- Simplifying cohorts, steps and courses beyond the Admin page (the Trainer's cohort room, the Fellow's path and Analytics still say "step"; the data model is unchanged): filed as `tasks/unprioritised/simplify-cohorts-batches-and-courses-into-one-chain.md`.

## See also

- [workflow-walkthrough.md](workflow-walkthrough.md): the end-to-end run and how to repeat it.
- [test-suite.md](test-suite.md): what the tests cover.
- `docs/_learnings/a-sign-in-lookup-that-skips-the-field-the-form-collected-locks-people-out.md`
- `docs/_learnings/a-datetime-local-value-sent-raw-is-read-in-the-servers-time-zone.md`
