# Send the data the redesigned pages show

**Family:** Product UI · **Added:** 2026-10-27 · **Source:** design-implementation tracks (`plans/design-implementation/plan.md`) and their verify passes

Read `.claude/CLAUDE.md`, `docs/_learnings` and `design/README.md` first. The boards in `design/board/` are the spec.
Every item below needs a server change, which the design tracks were not allowed to make. Each page builds everything
else and shows nothing invented in the gap. The local `.env` is the live production database: never load it in tests.

## What the server does not send yet

| Page (board) | Missing on screen | What the server would need to send |
|---|---|---|
| Admin Home (`AdminHome`) | The "module with no lesson file" row in Needs attention | Courses whose modules have no lesson file, on the Home data |
| Admin person detail (`AdminPersonDetail`) | The Fellow's quiz attempts ("None taken yet" or the list) | A Fellow's quiz attempts for an Admin |
| Admin Attendance (`AdminAttendance`) | Recent marks shows only each person's latest mark | Recent marks as rows (person, cohort, date, status) |
| Trainer Cohorts (`TrainerCohort`) | Trainers block; "Step 1 · last seen"; the Finishing count | Cohort trainers' names, a Fellow's last-seen time, the academy path count, for a Trainer |
| Trainer Assessments (`TrainerAssessments`) | Exams as a table with Submissions | Submission counts per exam |
| Cohort room (`CohortRoom`) | Step column for Trainers (Admins see it) | A Fellow's current step to a Trainer (`/api/admin/academy-path` is Admin-only) |
| Request a desk (`RequestDesk`) | "Anything the Admin should know" | A note field on the access request |
| Fellow Work (`FellowWork`, `FellowStates`) | "set by", "submitted", "marked" dates; the Trainer's name on a comment | Those fields on written work |
| Fellow Quizzes (`FellowQuizzes`) | "finished [date]" on an exam | The finishing date |
| Lesson quiz, a failed try (`FellowStates`) | "N tries left" and right/wrong per answer | `remainingAttempts`, and a right/wrong `review` without the correct answers, from `/api/training-weeks/:weekId/files/:fileId/submit-quiz` (today a failed try returns `review: []`) |
| Fellow exam page | A per-question review once the exam is finished (it shows tries and best score now) | The attempts' answers with right/wrong, which `/api/teacher/quiz-attempts` already allows once no retake is left |

## Do

Pick the rows the steering engineer wants. For each one, add the field to the route the page already calls, then show
it on the page as its board draws it. Test the route, especially who may see it: the Trainer rows are limited to their
own cohorts, and quiz answers must never show before the rule allows. Some rows may belong with
`tasks/prioritised/mark-attendance-per-session.md` (attendance) or `plans/admin-invites/plan.md` (requests).
