-- Run after 0001. Makes each ops area visible as its own objects in Supabase.
-- Table Editor → schema dropdown → choose `ops`. Open `catalog` first.

ALTER TABLE courses ADD COLUMN IF NOT EXISTS publish_status varchar NOT NULL DEFAULT 'published';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS objectives text;
ALTER TABLE assigned_quizzes ADD COLUMN IF NOT EXISTS pass_mark integer NOT NULL DEFAULT 80;
ALTER TABLE assigned_quizzes ADD COLUMN IF NOT EXISTS shuffle_questions varchar NOT NULL DEFAULT 'yes';

CREATE TABLE IF NOT EXISTS audit_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  actor_id varchar,
  actor_role varchar,
  action varchar NOT NULL,
  target_type varchar,
  target_id varchar,
  metadata jsonb,
  created_at timestamp DEFAULT now()
);

INSERT INTO ops.table_map (table_name, area_id) VALUES
  ('audit_events', 'security')
ON CONFLICT (table_name) DO UPDATE SET area_id = EXCLUDED.area_id;

COMMENT ON TABLE sessions IS 'ops.identity — login sessions';
COMMENT ON TABLE users IS 'ops.identity — admin and trainer accounts';
COMMENT ON TABLE user_profiles IS 'ops.identity — staff profile extras';
COMMENT ON TABLE approval_history IS 'ops.identity — approve/dismiss log';
COMMENT ON TABLE teachers IS 'ops.onboarding — fellow (learner) accounts';
COMMENT ON TABLE teacher_profiles IS 'ops.onboarding — fellow profile extras';
COMMENT ON TABLE batches IS 'ops.onboarding — cohorts';
COMMENT ON TABLE batch_teachers IS 'ops.onboarding — cohort membership';
COMMENT ON TABLE batch_courses IS 'ops.onboarding — courses assigned to a cohort';
COMMENT ON TABLE courses IS 'ops.learning — courses';
COMMENT ON TABLE training_weeks IS 'ops.learning — modules';
COMMENT ON TABLE content_items IS 'ops.learning — videos and files';
COMMENT ON TABLE user_content_progress IS 'ops.learning — staff progress';
COMMENT ON TABLE deck_file_progress IS 'ops.learning — slide progress';
COMMENT ON TABLE quiz_attempts IS 'ops.learning — quiz attempts';
COMMENT ON TABLE quiz_cache IS 'ops.learning — generated quizzes';
COMMENT ON TABLE assigned_quizzes IS 'ops.learning — quizzes assigned to a cohort';
COMMENT ON TABLE teacher_quiz_attempts IS 'ops.learning — fellow quiz attempts';
COMMENT ON TABLE teacher_content_progress IS 'ops.learning — fellow module progress';
COMMENT ON TABLE teacher_content_quiz_attempts IS 'ops.learning — fellow file quizzes';
COMMENT ON TABLE teacher_quiz_regenerations IS 'ops.learning — new quiz after failed attempts';
COMMENT ON TABLE open_ended_reviews IS 'ops.learning — written-answer reviews';
COMMENT ON TABLE teacher_course_completion IS 'ops.learning — course completion';
COMMENT ON TABLE course_repetitions IS 'ops.learning — course repeats';
COMMENT ON TABLE attendance_records IS 'ops.classroom — attendance';
COMMENT ON TABLE scheduled_events IS 'ops.classroom — calendar';
COMMENT ON TABLE written_assignments IS 'ops.classroom — written work';
COMMENT ON TABLE assignment_submissions IS 'ops.classroom — written submissions';
COMMENT ON TABLE batch_certificate_templates IS 'ops.classroom — certificate templates';
COMMENT ON TABLE teacher_certificates IS 'ops.classroom — issued certificates';
COMMENT ON TABLE teacher_report_cards IS 'ops.classroom — fellow report cards';
COMMENT ON TABLE notifications IS 'ops.communications — in-app notices';
COMMENT ON TABLE alert_rules IS 'ops.communications — alert thresholds';
COMMENT ON TABLE satisfaction_scores IS 'ops.marketing — ratings';
COMMENT ON TABLE trainer_comments IS 'ops.marketing — trainer comments';
COMMENT ON TABLE teacher_goals IS 'ops.marketing — fellow goals';
COMMENT ON TABLE fellow_reflections IS 'ops.marketing — weekly reflections';
COMMENT ON TABLE fellow_disqualifications IS 'ops.marketing — disqualifications';
COMMENT ON TABLE security_violations IS 'ops.security — integrity events';
COMMENT ON TABLE audit_events IS 'ops.security — staff action log';

CREATE OR REPLACE VIEW ops.catalog AS
SELECT
  a.id AS area,
  a.title,
  a.description,
  m.table_name,
  'public.' || m.table_name AS live_table,
  'ops.' || a.id || '_' || m.table_name AS area_view
FROM ops.table_map m
JOIN ops.areas a ON a.id = m.area_id
ORDER BY a.id, m.table_name;

CREATE OR REPLACE VIEW ops.identity_sessions AS SELECT * FROM public.sessions;
CREATE OR REPLACE VIEW ops.identity_users AS SELECT * FROM public.users;
CREATE OR REPLACE VIEW ops.identity_user_profiles AS SELECT * FROM public.user_profiles;
CREATE OR REPLACE VIEW ops.identity_approval_history AS SELECT * FROM public.approval_history;
CREATE OR REPLACE VIEW ops.onboarding_teachers AS SELECT * FROM public.teachers;
CREATE OR REPLACE VIEW ops.onboarding_teacher_profiles AS SELECT * FROM public.teacher_profiles;
CREATE OR REPLACE VIEW ops.onboarding_batches AS SELECT * FROM public.batches;
CREATE OR REPLACE VIEW ops.onboarding_batch_teachers AS SELECT * FROM public.batch_teachers;
CREATE OR REPLACE VIEW ops.onboarding_batch_courses AS SELECT * FROM public.batch_courses;
CREATE OR REPLACE VIEW ops.learning_courses AS SELECT * FROM public.courses;
CREATE OR REPLACE VIEW ops.learning_training_weeks AS SELECT * FROM public.training_weeks;
CREATE OR REPLACE VIEW ops.learning_content_items AS SELECT * FROM public.content_items;
CREATE OR REPLACE VIEW ops.learning_user_content_progress AS SELECT * FROM public.user_content_progress;
CREATE OR REPLACE VIEW ops.learning_deck_file_progress AS SELECT * FROM public.deck_file_progress;
CREATE OR REPLACE VIEW ops.learning_quiz_attempts AS SELECT * FROM public.quiz_attempts;
CREATE OR REPLACE VIEW ops.learning_quiz_cache AS SELECT * FROM public.quiz_cache;
CREATE OR REPLACE VIEW ops.learning_assigned_quizzes AS SELECT * FROM public.assigned_quizzes;
CREATE OR REPLACE VIEW ops.learning_teacher_quiz_attempts AS SELECT * FROM public.teacher_quiz_attempts;
CREATE OR REPLACE VIEW ops.learning_teacher_content_progress AS SELECT * FROM public.teacher_content_progress;
CREATE OR REPLACE VIEW ops.learning_teacher_content_quiz_attempts AS SELECT * FROM public.teacher_content_quiz_attempts;
CREATE OR REPLACE VIEW ops.learning_teacher_quiz_regenerations AS SELECT * FROM public.teacher_quiz_regenerations;
CREATE OR REPLACE VIEW ops.learning_open_ended_reviews AS SELECT * FROM public.open_ended_reviews;
CREATE OR REPLACE VIEW ops.learning_teacher_course_completion AS SELECT * FROM public.teacher_course_completion;
CREATE OR REPLACE VIEW ops.learning_course_repetitions AS SELECT * FROM public.course_repetitions;
CREATE OR REPLACE VIEW ops.classroom_attendance_records AS SELECT * FROM public.attendance_records;
CREATE OR REPLACE VIEW ops.classroom_scheduled_events AS SELECT * FROM public.scheduled_events;
CREATE OR REPLACE VIEW ops.classroom_written_assignments AS SELECT * FROM public.written_assignments;
CREATE OR REPLACE VIEW ops.classroom_assignment_submissions AS SELECT * FROM public.assignment_submissions;
CREATE OR REPLACE VIEW ops.classroom_batch_certificate_templates AS SELECT * FROM public.batch_certificate_templates;
CREATE OR REPLACE VIEW ops.classroom_teacher_certificates AS SELECT * FROM public.teacher_certificates;
CREATE OR REPLACE VIEW ops.classroom_teacher_report_cards AS SELECT * FROM public.teacher_report_cards;
CREATE OR REPLACE VIEW ops.communications_notifications AS SELECT * FROM public.notifications;
CREATE OR REPLACE VIEW ops.communications_alert_rules AS SELECT * FROM public.alert_rules;
CREATE OR REPLACE VIEW ops.marketing_satisfaction_scores AS SELECT * FROM public.satisfaction_scores;
CREATE OR REPLACE VIEW ops.marketing_trainer_comments AS SELECT * FROM public.trainer_comments;
CREATE OR REPLACE VIEW ops.marketing_teacher_goals AS SELECT * FROM public.teacher_goals;
CREATE OR REPLACE VIEW ops.marketing_fellow_reflections AS SELECT * FROM public.fellow_reflections;
CREATE OR REPLACE VIEW ops.marketing_fellow_disqualifications AS SELECT * FROM public.fellow_disqualifications;
CREATE OR REPLACE VIEW ops.security_security_violations AS SELECT * FROM public.security_violations;
CREATE OR REPLACE VIEW ops.security_audit_events AS SELECT * FROM public.audit_events;
