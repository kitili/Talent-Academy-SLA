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
| Timetable | Sessions a Trainer schedules (Trainer desk, **Schedule**) show on **Calendar → Timetable** for every desk: Admin sees all cohorts, a Trainer the cohorts they teach, a Fellow the cohorts they are in. |
| Academy year | **Calendar → Academy year**. Admin adds terms, holidays, training, assessments, events and deadlines. Trainers and Fellows read the same rows; nothing is copied or sent. |
| Sharing an assessment | The "Who sits this" picker on Upload an assessment names Fellows of the cohort. Only those Fellows see the assessment on **Work** and only they can answer it. Leaving every box empty gives it to the whole cohort. |

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
| Tables | `shared/schema.ts`: `users.trainer_type`, `teachers.fellow_type`, `scheduled_events.meeting_url / video_url / materials_url`, `academy_calendar`, `written_assignment_teachers` |
| Routes | `server/academyPathRoutes.ts` (cohort roster, `fellows` on each cohort), `server/academyDesk.ts` (register Fellows, kinds, academy year, timetable); `server/routes.ts` (sessions, assessments, roster); `server/auth.ts`, `server/accessRequests.ts` (sign-in) |
| Storage | `server/storage.ts` (assessment audience, `teacherCanSeeAssignment`) |
| Pages | `client/src/pages/admin-batches.tsx` (cohort page), `client/src/pages/trainer-fellows.tsx`, `client/src/pages/academy-calendar.tsx`, `client/src/pages/trainer-batches.tsx` (Schedule dialog, assessment picker), `client/src/pages/unified-auth.tsx`, `admin-trainer-detail.tsx`, `admin-teacher-detail.tsx` |
| Menus | `client/src/components/deskMenu.ts` (Fellows on the Trainer menu; Calendar on all three) |

New tables and columns are created at server start by `server/schemaGuard.ts` (additive; existing rows take the defaults).

Boundaries: cohorts, steps and courses stay in the academy path (`server/academyPathRoutes.ts`); attendance and
certificates are untouched. Quizzes already had an audience (`assigned_quiz_teachers`) and still use it.

## Not built

- Uploading a video, and creating a Google Meet from inside the app. An instructional Trainer pastes links.
- Email to a Fellow a Trainer registered. The Trainer tells them to open Sign in, choose Fellow, and create a password.
- A month-grid view of the calendar. It is a dated list grouped by month.
- Narrowing pre-service Fellows to assessments only. Both kinds see everything, as asked.
- Simplifying cohorts, steps and courses beyond the Admin page (the Trainer's cohort room, the Fellow's path and Analytics still say "step"; the data model is unchanged): filed as `tasks/unprioritised/simplify-cohorts-batches-and-courses-into-one-chain.md`.

## See also

- [workflow-walkthrough.md](workflow-walkthrough.md): the end-to-end run and how to repeat it.
- [test-suite.md](test-suite.md): what the tests cover.
- `docs/_learnings/a-sign-in-lookup-that-skips-the-field-the-form-collected-locks-people-out.md`
- `docs/_learnings/a-datetime-local-value-sent-raw-is-read-in-the-servers-time-zone.md`
