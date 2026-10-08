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
  `);
}
