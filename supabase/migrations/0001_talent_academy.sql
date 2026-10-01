-- Talent Academy LMS schema for a dedicated Supabase project.
-- Run once in the SQL editor. App tables stay in public; ops catalog is in schema ops.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS ops;

CREATE TABLE IF NOT EXISTS sessions (
  sid varchar PRIMARY KEY,
  sess jsonb NOT NULL,
  expire timestamp NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions (expire);

CREATE TABLE IF NOT EXISTS users (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  username varchar NOT NULL UNIQUE,
  password varchar NOT NULL,
  email varchar,
  first_name varchar,
  last_name varchar,
  role varchar NOT NULL DEFAULT 'trainer',
  approval_status varchar NOT NULL DEFAULT 'pending',
  approved_by varchar,
  approved_at timestamp,
  reset_token varchar,
  reset_token_expiry timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS courses (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name varchar NOT NULL,
  description text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_weeks (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  course_id varchar REFERENCES courses(id) ON DELETE CASCADE,
  week_number integer NOT NULL,
  competency_focus text NOT NULL DEFAULT '',
  objective text NOT NULL DEFAULT '',
  deck_files jsonb DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS content_items (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  week_id varchar NOT NULL REFERENCES training_weeks(id) ON DELETE CASCADE,
  type varchar NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  duration integer,
  file_size integer,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_content_progress (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_item_id varchar NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  status varchar NOT NULL DEFAULT 'pending',
  video_progress integer DEFAULT 0,
  completed_at timestamp,
  last_accessed_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deck_file_progress (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_id varchar NOT NULL REFERENCES training_weeks(id) ON DELETE CASCADE,
  deck_file_id varchar NOT NULL,
  status varchar NOT NULL DEFAULT 'pending',
  completed_at timestamp,
  last_accessed_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar REFERENCES users(id) ON DELETE CASCADE,
  teacher_id varchar,
  week_id varchar NOT NULL REFERENCES training_weeks(id) ON DELETE CASCADE,
  deck_file_id varchar,
  questions jsonb NOT NULL,
  answers jsonb NOT NULL,
  score integer NOT NULL,
  total_questions integer NOT NULL,
  passed varchar NOT NULL,
  completed_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quiz_cache (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  week_id varchar NOT NULL REFERENCES training_weeks(id) ON DELETE CASCADE,
  deck_file_id varchar NOT NULL,
  questions jsonb NOT NULL,
  approved boolean NOT NULL DEFAULT false,
  approved_at timestamp,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quiz_cache_week_file ON quiz_cache (week_id, deck_file_id);

CREATE TABLE IF NOT EXISTS security_violations (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_id varchar REFERENCES training_weeks(id) ON DELETE CASCADE,
  violation_type varchar NOT NULL,
  user_agent text,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teachers (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  teacher_id integer NOT NULL UNIQUE,
  name varchar NOT NULL,
  email varchar NOT NULL,
  password varchar NOT NULL,
  approval_status varchar NOT NULL DEFAULT 'pending',
  approved_by varchar,
  approved_by_role varchar,
  approved_at timestamp,
  gender varchar,
  location varchar,
  qualification varchar,
  employment_status varchar,
  years_of_experience integer,
  date_of_birth timestamp,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS batches (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name varchar NOT NULL,
  description text,
  created_by varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trainer_id varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS batch_teachers (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  batch_id varchar NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  teacher_id varchar NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  added_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_batch_teachers ON batch_teachers (batch_id, teacher_id);

CREATE TABLE IF NOT EXISTS assigned_quizzes (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  batch_id varchar NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  week_id varchar NOT NULL REFERENCES training_weeks(id) ON DELETE CASCADE,
  deck_file_id varchar,
  file_name varchar,
  title varchar NOT NULL,
  description text,
  num_questions integer NOT NULL DEFAULT 5,
  questions jsonb NOT NULL,
  assigned_by varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assigned_quizzes_batch ON assigned_quizzes (batch_id);

CREATE TABLE IF NOT EXISTS teacher_quiz_attempts (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  teacher_id varchar NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  assigned_quiz_id varchar NOT NULL REFERENCES assigned_quizzes(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL DEFAULT 1,
  answers jsonb NOT NULL,
  score integer NOT NULL,
  total_questions integer NOT NULL,
  passed varchar NOT NULL,
  open_ended_pending boolean DEFAULT false,
  final_passed boolean,
  completed_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_teacher_quiz_attempts ON teacher_quiz_attempts (teacher_id, assigned_quiz_id);

CREATE TABLE IF NOT EXISTS teacher_report_cards (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  teacher_id varchar NOT NULL UNIQUE REFERENCES teachers(id) ON DELETE CASCADE,
  level varchar NOT NULL DEFAULT 'Beginner',
  total_quizzes_taken integer NOT NULL DEFAULT 0,
  total_quizzes_passed integer NOT NULL DEFAULT 0,
  average_score integer NOT NULL DEFAULT 0,
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teacher_content_progress (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  teacher_id varchar NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  week_id varchar NOT NULL REFERENCES training_weeks(id) ON DELETE CASCADE,
  deck_file_id varchar NOT NULL,
  status varchar NOT NULL DEFAULT 'locked',
  viewed_at timestamp,
  completed_at timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_content_progress_unique
  ON teacher_content_progress (teacher_id, week_id, deck_file_id);

CREATE TABLE IF NOT EXISTS teacher_content_quiz_attempts (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  teacher_id varchar NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  week_id varchar NOT NULL REFERENCES training_weeks(id) ON DELETE CASCADE,
  deck_file_id varchar NOT NULL,
  quiz_generation_id varchar NOT NULL,
  attempt_number integer NOT NULL,
  questions jsonb NOT NULL,
  answers jsonb NOT NULL,
  score integer NOT NULL,
  total_questions integer NOT NULL,
  passed varchar NOT NULL,
  completed_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_teacher_content_quiz_attempts
  ON teacher_content_quiz_attempts (teacher_id, week_id, deck_file_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_quiz_attempt_unique
  ON teacher_content_quiz_attempts (teacher_id, week_id, deck_file_id, quiz_generation_id, attempt_number);

CREATE TABLE IF NOT EXISTS teacher_quiz_regenerations (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  teacher_id varchar NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  week_id varchar NOT NULL REFERENCES training_weeks(id) ON DELETE CASCADE,
  deck_file_id varchar NOT NULL,
  previous_quiz_generation_id varchar NOT NULL,
  new_quiz_generation_id varchar NOT NULL,
  requested_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_teacher_quiz_regenerations
  ON teacher_quiz_regenerations (teacher_id, week_id, deck_file_id);

CREATE TABLE IF NOT EXISTS open_ended_reviews (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  attempt_id varchar NOT NULL,
  assigned_quiz_id varchar NOT NULL REFERENCES assigned_quizzes(id) ON DELETE CASCADE,
  teacher_id varchar NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  question_id varchar NOT NULL,
  question_text text,
  teacher_answer text,
  reviewed_by varchar,
  passed boolean,
  reviewed_at timestamp,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_open_ended_reviews_attempt ON open_ended_reviews (attempt_id);
CREATE INDEX IF NOT EXISTS idx_open_ended_reviews_teacher ON open_ended_reviews (teacher_id);

CREATE TABLE IF NOT EXISTS approval_history (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  target_type varchar NOT NULL,
  target_id varchar NOT NULL,
  target_name varchar NOT NULL,
  target_email varchar,
  action varchar NOT NULL,
  performed_by varchar NOT NULL,
  performed_by_name varchar NOT NULL,
  performed_by_role varchar NOT NULL,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_approval_history_target ON approval_history (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_approval_history_date ON approval_history (created_at);

CREATE TABLE IF NOT EXISTS batch_courses (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  batch_id varchar NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  course_id varchar NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  assigned_by varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_batch_courses_unique ON batch_courses (batch_id, course_id);

CREATE TABLE IF NOT EXISTS teacher_course_completion (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  teacher_id varchar NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  course_id varchar NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  batch_id varchar NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  status varchar NOT NULL DEFAULT 'in_progress',
  completed_at timestamp,
  total_weeks integer NOT NULL DEFAULT 0,
  completed_weeks integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_course_completion_unique
  ON teacher_course_completion (teacher_id, course_id, batch_id);

CREATE TABLE IF NOT EXISTS batch_certificate_templates (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  batch_id varchar NOT NULL UNIQUE REFERENCES batches(id) ON DELETE CASCADE,
  course_id varchar NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  appreciation_text text NOT NULL DEFAULT 'In recognition of successfully completing the training program',
  admin_name_1 varchar,
  admin_name_2 varchar,
  status varchar NOT NULL DEFAULT 'draft',
  approved_by varchar REFERENCES users(id),
  approved_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teacher_certificates (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  teacher_id varchar NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  batch_id varchar NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  course_id varchar NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  template_id varchar NOT NULL REFERENCES batch_certificate_templates(id) ON DELETE CASCADE,
  teacher_name varchar NOT NULL,
  course_name varchar NOT NULL,
  appreciation_text text NOT NULL,
  admin_name_1 varchar,
  admin_name_2 varchar,
  completion_percentage integer NOT NULL DEFAULT 100,
  generated_at timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_certificate_unique
  ON teacher_certificates (teacher_id, batch_id, course_id);

CREATE TABLE IF NOT EXISTS fellow_reflections (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  teacher_id varchar NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  week_id varchar NOT NULL REFERENCES training_weeks(id) ON DELETE CASCADE,
  batch_id varchar NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  content text NOT NULL,
  rating integer,
  submitted_at timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fellow_reflection_unique
  ON fellow_reflections (teacher_id, week_id, batch_id);

CREATE TABLE IF NOT EXISTS fellow_disqualifications (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  teacher_id varchar NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  batch_id varchar NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  reason text NOT NULL,
  disqualified_by varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  disqualified_by_role varchar NOT NULL,
  disqualified_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fellow_disqualification ON fellow_disqualifications (teacher_id, batch_id);

CREATE TABLE IF NOT EXISTS satisfaction_scores (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  type varchar NOT NULL,
  rater_id varchar NOT NULL,
  rater_role varchar NOT NULL,
  target_id varchar NOT NULL,
  target_type varchar NOT NULL,
  batch_id varchar REFERENCES batches(id) ON DELETE SET NULL,
  week_id varchar REFERENCES training_weeks(id) ON DELETE SET NULL,
  score integer NOT NULL,
  comment text,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_satisfaction_type_target ON satisfaction_scores (type, target_id);
CREATE INDEX IF NOT EXISTS idx_satisfaction_rater ON satisfaction_scores (rater_id);

CREATE TABLE IF NOT EXISTS trainer_comments (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  trainer_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  teacher_id varchar NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  batch_id varchar REFERENCES batches(id) ON DELETE SET NULL,
  week_id varchar REFERENCES training_weeks(id) ON DELETE SET NULL,
  comment text NOT NULL,
  category varchar NOT NULL DEFAULT 'general',
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trainer_comments_teacher ON trainer_comments (teacher_id);
CREATE INDEX IF NOT EXISTS idx_trainer_comments_trainer ON trainer_comments (trainer_id);

CREATE TABLE IF NOT EXISTS course_repetitions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  teacher_id varchar NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  course_id varchar NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  batch_id varchar NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  repetition_number integer NOT NULL DEFAULT 1,
  reason text,
  started_at timestamp DEFAULT now(),
  completed_at timestamp
);
CREATE INDEX IF NOT EXISTS idx_course_repetitions ON course_repetitions (teacher_id, course_id);

CREATE TABLE IF NOT EXISTS attendance_records (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  teacher_id varchar NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  batch_id varchar NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  date timestamp NOT NULL,
  status varchar NOT NULL DEFAULT 'present',
  marked_by varchar REFERENCES users(id),
  notes text,
  created_at timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_unique ON attendance_records (teacher_id, batch_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_batch_date ON attendance_records (batch_id, date);

CREATE TABLE IF NOT EXISTS notifications (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  recipient_id varchar NOT NULL,
  recipient_type varchar NOT NULL,
  type varchar NOT NULL,
  title varchar NOT NULL,
  message text NOT NULL,
  metadata jsonb,
  is_read varchar NOT NULL DEFAULT 'no',
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications (recipient_id, recipient_type);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (recipient_id, is_read);

CREATE TABLE IF NOT EXISTS alert_rules (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  batch_id varchar REFERENCES batches(id) ON DELETE CASCADE,
  rule_type varchar NOT NULL,
  threshold integer NOT NULL,
  is_active varchar NOT NULL DEFAULT 'yes',
  created_by varchar REFERENCES users(id),
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teacher_goals (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  teacher_id varchar NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  batch_id varchar REFERENCES batches(id) ON DELETE SET NULL,
  goal_text text NOT NULL,
  status varchar NOT NULL DEFAULT 'pending',
  due_date timestamp,
  completed_at timestamp,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_teacher_goals ON teacher_goals (teacher_id);

CREATE TABLE IF NOT EXISTS scheduled_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title varchar NOT NULL,
  description text,
  event_type varchar NOT NULL,
  start_date timestamp NOT NULL,
  end_date timestamp,
  batch_id varchar NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  created_by varchar REFERENCES users(id),
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_batch ON scheduled_events (batch_id);
CREATE INDEX IF NOT EXISTS idx_events_date ON scheduled_events (start_date);

CREATE TABLE IF NOT EXISTS user_profiles (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  father_name varchar,
  phone_number varchar,
  qualification varchar,
  cnic varchar,
  gender varchar,
  date_of_birth timestamp,
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teacher_profiles (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  teacher_id varchar NOT NULL UNIQUE REFERENCES teachers(id) ON DELETE CASCADE,
  father_name varchar,
  phone_number varchar,
  cnic varchar,
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS written_assignments (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  batch_id varchar NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  title varchar NOT NULL,
  instructions text NOT NULL,
  due_date timestamp,
  created_by varchar REFERENCES users(id),
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  assignment_id varchar NOT NULL REFERENCES written_assignments(id) ON DELETE CASCADE,
  teacher_id varchar NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  response text NOT NULL,
  submitted_at timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_assignment_submission_unique
  ON assignment_submissions (assignment_id, teacher_id);

-- Ops catalog: one place to find areas, tables, and repo documents
CREATE TABLE IF NOT EXISTS ops.areas (
  id varchar PRIMARY KEY,
  title varchar NOT NULL,
  description text NOT NULL
);

CREATE TABLE IF NOT EXISTS ops.documents (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  area_id varchar NOT NULL REFERENCES ops.areas(id) ON DELETE CASCADE,
  path varchar NOT NULL,
  title varchar NOT NULL
);

CREATE TABLE IF NOT EXISTS ops.table_map (
  table_name varchar PRIMARY KEY,
  area_id varchar NOT NULL REFERENCES ops.areas(id) ON DELETE CASCADE
);

INSERT INTO ops.areas (id, title, description) VALUES
  ('identity', 'Identity', 'Staff accounts, sessions, and approval history'),
  ('onboarding', 'Onboarding', 'Fellow accounts, batches, and enrollments'),
  ('learning', 'Learning', 'Curriculum, progress, and assessments'),
  ('classroom', 'Classroom', 'Attendance, events, assignments, certificates'),
  ('communications', 'Communications', 'Notifications and alert rules'),
  ('marketing', 'Marketing', 'Satisfaction, comments, goals, reflections'),
  ('security', 'Security', 'Integrity events and access notes')
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description;

INSERT INTO ops.documents (area_id, path, title)
SELECT * FROM (VALUES
  ('identity', 'docs/ops/identity.md', 'Identity'),
  ('onboarding', 'docs/ops/onboarding.md', 'Onboarding'),
  ('learning', 'docs/ops/learning.md', 'Learning'),
  ('classroom', 'docs/ops/classroom.md', 'Classroom'),
  ('communications', 'docs/ops/communications.md', 'Communications'),
  ('marketing', 'docs/ops/marketing.md', 'Marketing'),
  ('security', 'docs/ops/security.md', 'Security'),
  ('identity', 'docs/ops/README.md', 'Catalog overview')
) AS d(area_id, path, title)
WHERE NOT EXISTS (
  SELECT 1 FROM ops.documents x WHERE x.path = d.path
);

INSERT INTO ops.table_map (table_name, area_id) VALUES
  ('sessions', 'identity'),
  ('users', 'identity'),
  ('user_profiles', 'identity'),
  ('approval_history', 'identity'),
  ('teachers', 'onboarding'),
  ('teacher_profiles', 'onboarding'),
  ('batches', 'onboarding'),
  ('batch_teachers', 'onboarding'),
  ('batch_courses', 'onboarding'),
  ('courses', 'learning'),
  ('training_weeks', 'learning'),
  ('content_items', 'learning'),
  ('user_content_progress', 'learning'),
  ('deck_file_progress', 'learning'),
  ('quiz_attempts', 'learning'),
  ('quiz_cache', 'learning'),
  ('assigned_quizzes', 'learning'),
  ('teacher_quiz_attempts', 'learning'),
  ('teacher_content_progress', 'learning'),
  ('teacher_content_quiz_attempts', 'learning'),
  ('teacher_quiz_regenerations', 'learning'),
  ('open_ended_reviews', 'learning'),
  ('teacher_course_completion', 'learning'),
  ('course_repetitions', 'learning'),
  ('attendance_records', 'classroom'),
  ('scheduled_events', 'classroom'),
  ('written_assignments', 'classroom'),
  ('assignment_submissions', 'classroom'),
  ('batch_certificate_templates', 'classroom'),
  ('teacher_certificates', 'classroom'),
  ('teacher_report_cards', 'classroom'),
  ('notifications', 'communications'),
  ('alert_rules', 'communications'),
  ('satisfaction_scores', 'marketing'),
  ('trainer_comments', 'marketing'),
  ('teacher_goals', 'marketing'),
  ('fellow_reflections', 'marketing'),
  ('fellow_disqualifications', 'marketing'),
  ('security_violations', 'security')
ON CONFLICT (table_name) DO UPDATE SET area_id = EXCLUDED.area_id;

REVOKE ALL ON SCHEMA public FROM anon, authenticated;
GRANT USAGE ON SCHEMA public TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;
