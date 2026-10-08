-- Separate schemas so Supabase Table Editor shows each ops area as its own folder.
-- Each "table" here is a view of the real public table. One database, clear categories.

CREATE TABLE IF NOT EXISTS public.audit_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  actor_id varchar,
  actor_role varchar,
  action varchar NOT NULL,
  target_type varchar,
  target_id varchar,
  metadata jsonb,
  created_at timestamp DEFAULT now()
);
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS publish_status varchar NOT NULL DEFAULT 'published';
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS objectives text;
INSERT INTO ops.table_map (table_name, area_id) VALUES ('audit_events', 'identity')
ON CONFLICT (table_name) DO UPDATE SET area_id = EXCLUDED.area_id;

CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS onboarding;
CREATE SCHEMA IF NOT EXISTS learning;
CREATE SCHEMA IF NOT EXISTS classroom;
CREATE SCHEMA IF NOT EXISTS communications;
CREATE SCHEMA IF NOT EXISTS marketing;
CREATE SCHEMA IF NOT EXISTS security;

CREATE OR REPLACE VIEW identity.sessions AS SELECT * FROM public.sessions;
CREATE OR REPLACE VIEW identity.users AS SELECT * FROM public.users;
CREATE OR REPLACE VIEW identity.user_profiles AS SELECT * FROM public.user_profiles;
CREATE OR REPLACE VIEW identity.approval_history AS SELECT * FROM public.approval_history;
CREATE OR REPLACE VIEW identity.audit_events AS SELECT * FROM public.audit_events;

CREATE OR REPLACE VIEW onboarding.teachers AS SELECT * FROM public.teachers;
CREATE OR REPLACE VIEW onboarding.teacher_profiles AS SELECT * FROM public.teacher_profiles;
CREATE OR REPLACE VIEW onboarding.batches AS SELECT * FROM public.batches;
CREATE OR REPLACE VIEW onboarding.batch_teachers AS SELECT * FROM public.batch_teachers;
CREATE OR REPLACE VIEW onboarding.batch_courses AS SELECT * FROM public.batch_courses;

CREATE OR REPLACE VIEW learning.courses AS SELECT * FROM public.courses;
CREATE OR REPLACE VIEW learning.training_weeks AS SELECT * FROM public.training_weeks;
CREATE OR REPLACE VIEW learning.content_items AS SELECT * FROM public.content_items;
CREATE OR REPLACE VIEW learning.user_content_progress AS SELECT * FROM public.user_content_progress;
CREATE OR REPLACE VIEW learning.deck_file_progress AS SELECT * FROM public.deck_file_progress;
CREATE OR REPLACE VIEW learning.quiz_attempts AS SELECT * FROM public.quiz_attempts;
CREATE OR REPLACE VIEW learning.quiz_cache AS SELECT * FROM public.quiz_cache;
CREATE OR REPLACE VIEW learning.assigned_quizzes AS SELECT * FROM public.assigned_quizzes;
CREATE OR REPLACE VIEW learning.teacher_quiz_attempts AS SELECT * FROM public.teacher_quiz_attempts;
CREATE OR REPLACE VIEW learning.teacher_content_progress AS SELECT * FROM public.teacher_content_progress;
CREATE OR REPLACE VIEW learning.teacher_content_quiz_attempts AS SELECT * FROM public.teacher_content_quiz_attempts;
CREATE OR REPLACE VIEW learning.teacher_quiz_regenerations AS SELECT * FROM public.teacher_quiz_regenerations;
CREATE OR REPLACE VIEW learning.open_ended_reviews AS SELECT * FROM public.open_ended_reviews;
CREATE OR REPLACE VIEW learning.teacher_course_completion AS SELECT * FROM public.teacher_course_completion;
CREATE OR REPLACE VIEW learning.course_repetitions AS SELECT * FROM public.course_repetitions;

CREATE OR REPLACE VIEW classroom.attendance_records AS SELECT * FROM public.attendance_records;
CREATE OR REPLACE VIEW classroom.scheduled_events AS SELECT * FROM public.scheduled_events;
CREATE OR REPLACE VIEW classroom.written_assignments AS SELECT * FROM public.written_assignments;
CREATE OR REPLACE VIEW classroom.assignment_submissions AS SELECT * FROM public.assignment_submissions;
CREATE OR REPLACE VIEW classroom.batch_certificate_templates AS SELECT * FROM public.batch_certificate_templates;
CREATE OR REPLACE VIEW classroom.teacher_certificates AS SELECT * FROM public.teacher_certificates;
CREATE OR REPLACE VIEW classroom.teacher_report_cards AS SELECT * FROM public.teacher_report_cards;

CREATE OR REPLACE VIEW communications.notifications AS SELECT * FROM public.notifications;
CREATE OR REPLACE VIEW communications.alert_rules AS SELECT * FROM public.alert_rules;

CREATE OR REPLACE VIEW marketing.satisfaction_scores AS SELECT * FROM public.satisfaction_scores;
CREATE OR REPLACE VIEW marketing.trainer_comments AS SELECT * FROM public.trainer_comments;
CREATE OR REPLACE VIEW marketing.teacher_goals AS SELECT * FROM public.teacher_goals;
CREATE OR REPLACE VIEW marketing.fellow_reflections AS SELECT * FROM public.fellow_reflections;
CREATE OR REPLACE VIEW marketing.fellow_disqualifications AS SELECT * FROM public.fellow_disqualifications;

CREATE OR REPLACE VIEW security.security_violations AS SELECT * FROM public.security_violations;

CREATE OR REPLACE VIEW ops.catalog AS
SELECT
  a.id AS area,
  a.title,
  a.description,
  m.table_name,
  d.path AS document_path
FROM ops.areas a
JOIN ops.table_map m ON m.area_id = a.id
LEFT JOIN ops.documents d ON d.area_id = a.id;
