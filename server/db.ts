import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";
import { isHostedPostgres, resolveDatabaseUrl } from "./databaseUrl";

const databaseUrl = resolveDatabaseUrl();
const hosted = isHostedPostgres(databaseUrl);

export const pool = new Pool(
  databaseUrl
    ? {
        connectionString: databaseUrl,
        max: process.env.VERCEL ? 1 : 10,
        ssl: hosted ? { rejectUnauthorized: false } : undefined,
      }
    : {
        // Never implicitly connect to localhost:5432 on Vercel.
        connectionString: "postgres://127.0.0.1:1/unconfigured",
        max: 0,
      },
);

pool.on("error", (error) => {
  console.error("Database pool error:", error.message);
});

export const db = drizzle({ client: pool, schema });

export function hasDatabaseUrl() {
  return Boolean(databaseUrl);
}

export function getDatabaseUrl() {
  return databaseUrl;
}

export async function ensureWrittenAssignmentTables() {
  if (!databaseUrl) return;
  await pool.query(`
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
      ON assignment_submissions(assignment_id, teacher_id);
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
    ALTER TABLE courses ADD COLUMN IF NOT EXISTS publish_status varchar NOT NULL DEFAULT 'published';
    ALTER TABLE courses ADD COLUMN IF NOT EXISTS stage varchar;
    ALTER TABLE courses ADD COLUMN IF NOT EXISTS track varchar;
    ALTER TABLE batches ADD COLUMN IF NOT EXISTS stage varchar;
    ALTER TABLE batches ADD COLUMN IF NOT EXISTS track varchar;
    ALTER TABLE batches ADD COLUMN IF NOT EXISTS status varchar NOT NULL DEFAULT 'open';
    ALTER TABLE batches ADD COLUMN IF NOT EXISTS quizzes_status varchar NOT NULL DEFAULT 'open';
    ALTER TABLE assigned_quizzes ADD COLUMN IF NOT EXISTS status varchar NOT NULL DEFAULT 'open';
    ALTER TABLE courses ADD COLUMN IF NOT EXISTS objectives text;
    ALTER TABLE assigned_quizzes ADD COLUMN IF NOT EXISTS pass_mark integer NOT NULL DEFAULT 80;
    ALTER TABLE assigned_quizzes ADD COLUMN IF NOT EXISTS shuffle_questions varchar NOT NULL DEFAULT 'yes';
    ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS trainer_score integer;
    ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS trainer_comment text;
    ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS rubric jsonb;
    CREATE TABLE IF NOT EXISTS discussion_posts (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
      week_id varchar NOT NULL REFERENCES training_weeks(id) ON DELETE CASCADE,
      author_id varchar NOT NULL,
      author_role varchar NOT NULL,
      author_name varchar NOT NULL,
      body text NOT NULL,
      created_at timestamp DEFAULT now()
    );
    ALTER TABLE teacher_certificates ADD COLUMN IF NOT EXISTS kind varchar NOT NULL DEFAULT 'graduation';
    ALTER TABLE teacher_certificates ADD COLUMN IF NOT EXISTS outstanding_areas text;
    ALTER TABLE teacher_certificates ALTER COLUMN template_id DROP NOT NULL;
    DROP INDEX IF EXISTS idx_teacher_certificate_unique;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_teacher_certificate_kind
      ON teacher_certificates(teacher_id, batch_id, course_id, kind);
    CREATE TABLE IF NOT EXISTS trainer_stars (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
      teacher_id varchar NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      batch_id varchar NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      awarded_by varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      note text,
      created_at timestamp DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_trainer_star_unique ON trainer_stars(teacher_id, batch_id);
    CREATE TABLE IF NOT EXISTS academy_settings (
      id varchar PRIMARY KEY,
      cohorts_required integer NOT NULL DEFAULT 1,
      updated_at timestamp DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS cohort_batches (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
      cohort_id varchar NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      name varchar NOT NULL,
      description text,
      order_index integer NOT NULL DEFAULT 0,
      created_at timestamp DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS cohort_batch_courses (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
      cohort_batch_id varchar NOT NULL REFERENCES cohort_batches(id) ON DELETE CASCADE,
      course_id varchar NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      order_index integer NOT NULL DEFAULT 0
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cohort_batch_course
      ON cohort_batch_courses(cohort_batch_id, course_id);
    CREATE TABLE IF NOT EXISTS cohort_trainers (
      cohort_id varchar NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      trainer_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (cohort_id, trainer_id)
    );
    CREATE TABLE IF NOT EXISTS cohort_batch_teachers (
      cohort_batch_id varchar NOT NULL REFERENCES cohort_batches(id) ON DELETE CASCADE,
      teacher_id varchar NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      PRIMARY KEY (cohort_batch_id, teacher_id)
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_set varchar NOT NULL DEFAULT 'yes';
    ALTER TABLE teachers ADD COLUMN IF NOT EXISTS username varchar;
    ALTER TABLE teachers ADD COLUMN IF NOT EXISTS password_set varchar NOT NULL DEFAULT 'yes';
    ALTER TABLE written_assignments ADD COLUMN IF NOT EXISTS file_url text;
    ALTER TABLE written_assignments ADD COLUMN IF NOT EXISTS file_name varchar;
    ALTER TABLE written_assignments ADD COLUMN IF NOT EXISTS kind varchar NOT NULL DEFAULT 'assignment';
    CREATE TABLE IF NOT EXISTS trainer_attendance (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
      trainer_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      batch_id varchar NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      date timestamp NOT NULL,
      status varchar NOT NULL DEFAULT 'present',
      marked_by varchar REFERENCES users(id),
      notes text,
      created_at timestamp DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_trainer_attendance_unique ON trainer_attendance(trainer_id, batch_id, date);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_teachers_username_lower ON teachers (LOWER(username));
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'assigned_quizzes') THEN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'assigned_quizzes' AND column_name = 'week_id' AND is_nullable = 'NO'
        ) THEN
          ALTER TABLE assigned_quizzes ALTER COLUMN week_id DROP NOT NULL;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'assigned_quizzes' AND column_name = 'paper_url'
        ) THEN
          ALTER TABLE assigned_quizzes ADD COLUMN paper_url text;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'assigned_quizzes' AND column_name = 'paper_name'
        ) THEN
          ALTER TABLE assigned_quizzes ADD COLUMN paper_name varchar;
        END IF;
      END IF;
    END $$;
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'assigned_quizzes') THEN
        CREATE TABLE IF NOT EXISTS assigned_quiz_teachers (
          quiz_id varchar NOT NULL REFERENCES assigned_quizzes(id) ON DELETE CASCADE,
          teacher_id varchar NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
          PRIMARY KEY (quiz_id, teacher_id)
        );
      END IF;
    END $$;
    CREATE TABLE IF NOT EXISTS trainer_encouragements (
      trainer_id varchar NOT NULL,
      day date NOT NULL,
      message text NOT NULL,
      PRIMARY KEY (trainer_id, day)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_trainer_encouragement_message
      ON trainer_encouragements (message);
    CREATE TABLE IF NOT EXISTS desk_messages (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
      from_id varchar NOT NULL,
      from_role varchar NOT NULL,
      from_name varchar NOT NULL,
      to_id varchar NOT NULL,
      to_role varchar NOT NULL,
      body text NOT NULL,
      created_at timestamp DEFAULT now()
    );
  `);
}
