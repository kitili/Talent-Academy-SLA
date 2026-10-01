# Talent Academy ops catalog

All LMS data lives in **one Supabase Postgres project**. App tables stay in `public` (Drizzle). Categories live in `ops` so you can find tables and documents in one place.

| Area | What it covers | Tables |
|---|---|---|
| identity | Trainers, admins, sessions, profiles, approval history | `sessions`, `users`, `user_profiles`, `approval_history` |
| onboarding | Teacher (fellow) accounts, batches, enrollments | `teachers`, `teacher_profiles`, `batches`, `batch_teachers`, `batch_courses` |
| learning | Courses, weeks, materials, progress, quizzes | `courses`, `training_weeks`, `content_items`, `user_content_progress`, `deck_file_progress`, `quiz_attempts`, `quiz_cache`, `assigned_quizzes`, `teacher_quiz_attempts`, `teacher_content_progress`, `teacher_content_quiz_attempts`, `teacher_quiz_regenerations`, `open_ended_reviews`, `teacher_course_completion`, `course_repetitions` |
| classroom | Attendance, events, written work, certificates | `attendance_records`, `scheduled_events`, `written_assignments`, `assignment_submissions`, `batch_certificate_templates`, `teacher_certificates`, `teacher_report_cards` |
| communications | In-app notices and alerts | `notifications`, `alert_rules` |
| marketing | Satisfaction, comments, goals, reflections | `satisfaction_scores`, `trainer_comments`, `teacher_goals`, `fellow_reflections`, `fellow_disqualifications` |
| security | Screenshot / quiz integrity events | `security_violations` |

**How you know tables are separate in Supabase**

They are still one project (one database). Categories are not mixed into one blob:

1. Run `0001_talent_academy.sql` then `0002_ops_views.sql`.
2. In Supabase: **Table Editor** → schema dropdown (usually says `public`) → choose **`ops`**.
3. Open **`catalog`**. Every live table is listed with its area (`onboarding`, `marketing`, `learning`, …).
4. Open views named `onboarding_teachers`, `marketing_satisfaction_scores`, and so on. Same rows as `public.teachers`, but the name starts with the area.
5. Back in `public`, hover a table: the comment starts with `ops.onboarding` / `ops.learning` / etc.

The LMS still reads `public.*` so nothing breaks. `ops.*` is the index so you can find documents and tables in one place.

**How you know the tables are separate in Supabase**

Table Editor still lists tables in `public` (the app needs that). Each table **description** starts with a tag:

`[onboarding] Fellow accounts`, `[marketing] Ratings`, `[learning] Courses`, and so on.

Open SQL and run:

```sql
SELECT area_id, table_name, document_path FROM ops.catalog ORDER BY area_id, table_name;
```

In the app: Admin → **Data catalog** (`/admin/data-catalog`).

Then set **one** connection string:

- `SUPABASE_DATABASE_URL` (preferred) or `DATABASE_URL`
- Use the **transaction pooler** URI (`*.pooler.supabase.com`, port `6543`) on Vercel
- Do not keep Neon as a second live database
