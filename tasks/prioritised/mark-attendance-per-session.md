# Mark attendance per session

**Family:** Certificates and records · **Added:** 2026-10-27 · **Source:** nomenclature review on the design board (session vs attendance day)

Read `.claude/CLAUDE.md`, `docs/_learnings`, `skills/plan-skill/SKILL.md` and `skills/migrations-skill/SKILL.md`
(with its `references/this-repository.md`) first. The local `.env` points at the live production database: never load
it in tests, and treat any migration or backfill as a production write that needs the steering engineer's approval.

## What was observed

"Session" means one scheduled meeting of a cohort, but attendance never points at one:
- `attendance_records` (`shared/schema.ts:804`) and `trainer_attendance` (`shared/schema.ts:818`, also created at
  start-up in `server/db.ts:182`) hold one mark per person, cohort and **date**. They are unique on
  `(teacher_id | trainer_id, batch_id, date)`, so a cohort can have only one mark per person per day.
- Sessions are `scheduled_events` rows with `event_type = 'session'` (`shared/schema.ts:906`, created at start-up in
  `server/db.ts:52`), with a start and end time and a cohort (`batch_id`). Nothing links them to attendance.
- Routes: `POST/GET /api/batches/:batchId/attendance`, `/api/admin/attendance`, `/api/teacher/attendance` and their
  summaries in `server/routes.ts` (about lines 3951 and 5476–5676). UI: `client/src/components/AttendanceBoard.tsx`
  and the schedule in `client/src/pages/cohort-workspace.tsx`.

Until this is done, the product says "session" only for the calendar meeting. Attendance is worded by its date
("Mark attendance for Tue 27 October"), and the designs on the board follow that.

## Do

Write a plan under `plans/attendance-per-session/` before any code. It must settle:
- whether a mark carries an optional `session_id` (nullable, so the existing day-based marks stay valid) or
  attendance becomes session-only;
- whether a cohort may hold more than one session a day, and what replaces the per-day unique indexes;
- what happens to the existing marks: leave them day-based, or match them to a session on the same day;
- how the Trainer chooses the session when marking (today's sessions first; a day with no session);
- what the attendance figures (rate, medals such as "Keeping time", Admin analytics) count once both kinds exist;
- the migration, written but not applied, and the test plan.
